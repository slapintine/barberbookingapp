import { all, get, transaction } from "../db/query.js";
import { PROVIDER_ENTITLEMENTS, assertProviderEntitlement, getProviderEntitlementSnapshot } from "./entitlementService.js";
import { getOwnedAiCoachBusiness } from "./aiCoachService.js";

const PREMIUM_SAMPLE_WARNING_THRESHOLD = 10;
const PROMOTION_STATUSES = new Set(["draft", "active", "paused", "expired", "cancelled"]);

function httpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizeDate(value = "") {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeTime(value = "") {
  const text = String(value || "").trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function normalizeRange(range = "last_30_days", now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(today);
  const key = String(range || "last_30_days").toLowerCase();
  if (key === "today") {
    return { key, start: today.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (key === "this_week") {
    const day = today.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    return { key, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (key === "this_month") {
    start.setUTCDate(1);
    return { key, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  start.setUTCDate(start.getUTCDate() - 30);
  return { key: "last_30_days", start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function minutesFromTime(value = "") {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value) {
  const minutes = Math.max(0, Math.min(24 * 60 - 1, Number(value || 0)));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function knownBookingPrice(booking = {}) {
  const amount = Number(booking.price ?? booking.total_price ?? booking.booking_price ?? 0);
  const pricingType = String(booking.pricing_type || booking.price_type || "").toLowerCase();
  if (pricingType === "quote" || Number(booking.requires_quote || 0) === 1) return null;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function bookingStatus(booking = {}) {
  return String(booking.status || "").toLowerCase();
}

function bookingDateKey(booking = {}) {
  if (!booking) return "";
  return String(booking.booking_date || booking.date || "").slice(0, 10);
}

function bookingTimeKey(booking = {}) {
  if (!booking) return "";
  return normalizeTime(booking.booking_time || booking.time || "");
}

function isKnownRevenueBooking(booking = {}) {
  return knownBookingPrice(booking) !== null;
}

function bookingStartMillis(booking = {}) {
  const date = bookingDateKey(booking);
  if (!date) return null;
  const time = bookingTimeKey(booking) || "00:00";
  const millis = new Date(`${date}T${time}:00+03:00`).getTime();
  return Number.isFinite(millis) ? millis : null;
}

export function buildProviderAnalytics({ bookings = [], range = normalizeRange(), now = new Date() } = {}) {
  const rows = bookings.filter((booking) => {
    const date = bookingDateKey(booking);
    return date && date >= range.start && date < range.end;
  });
  const completed = rows.filter((booking) => bookingStatus(booking) === "completed");
  const nowMillis = now.getTime();
  const confirmedUpcoming = rows.filter((booking) => {
    if (bookingStatus(booking) !== "confirmed") return false;
    const startMillis = bookingStartMillis(booking);
    return startMillis !== null && startMillis >= nowMillis;
  });
  const pending = rows.filter((booking) => ["pending", "payment_pending"].includes(bookingStatus(booking)));
  const cancelled = rows.filter((booking) => ["cancelled", "canceled", "rejected"].includes(bookingStatus(booking)));
  const noShows = rows.filter((booking) => bookingStatus(booking) === "no_show");
  const quoteBookings = rows.filter((booking) => !isKnownRevenueBooking(booking));
  const knownBookedRevenue = rows
    .filter((booking) => ["confirmed", "completed"].includes(bookingStatus(booking)))
    .reduce((sum, booking) => sum + (knownBookingPrice(booking) || 0), 0);
  const knownCompletedRevenue = completed.reduce((sum, booking) => sum + (knownBookingPrice(booking) || 0), 0);
  const knownCompletedValues = completed.map(knownBookingPrice).filter((value) => value !== null);
  const byService = new Map();
  rows.forEach((booking) => {
    const service = String(booking.service_name || booking.service || "Unknown service").trim() || "Unknown service";
    const current = byService.get(service) || { service, bookings: 0, knownRevenue: 0 };
    current.bookings += 1;
    current.knownRevenue += knownBookingPrice(booking) || 0;
    byService.set(service, current);
  });
  const serviceRows = [...byService.values()].sort((a, b) => b.bookings - a.bookings || b.knownRevenue - a.knownRevenue);
  const total = rows.length;
  const denominator = completed.length + cancelled.length + noShows.length;
  return {
    range,
    totalBookings: total,
    completedBookings: completed.length,
    confirmedUpcoming: confirmedUpcoming.length,
    pendingRequests: pending.length,
    cancelledBookings: cancelled.length,
    noShows: noShows.length,
    cancellationRate: denominator ? Number(((cancelled.length / denominator) * 100).toFixed(1)) : null,
    noShowRate: denominator ? Number(((noShows.length / denominator) * 100).toFixed(1)) : null,
    denominator,
    smallSampleWarning: denominator > 0 && denominator < PREMIUM_SAMPLE_WARNING_THRESHOLD,
    knownBookedRevenue,
    knownCompletedRevenue,
    quoteBookings: quoteBookings.length,
    averageKnownBookingValue: knownCompletedValues.length
      ? Math.round(knownCompletedValues.reduce((sum, value) => sum + value, 0) / knownCompletedValues.length)
      : null,
    mostBookedServices: serviceRows.slice(0, 5),
    highestKnownRevenueServices: [...serviceRows].sort((a, b) => b.knownRevenue - a.knownRevenue).slice(0, 5),
    revenueLimitations: quoteBookings.length
      ? "Quote-based or unknown-price bookings are separated and not counted as known revenue."
      : "",
    terminology: "Known revenue is booked value from stored booking prices, not profit.",
  };
}

export function buildScheduleSuggestions({ bookings = [], schedule = [], alerts = [], now = new Date() } = {}) {
  const suggestions = [];
  const today = now.toISOString().slice(0, 10);
  const todayBookings = bookings
    .filter((booking) => bookingDateKey(booking) === today && !["cancelled", "canceled", "rejected", "completed", "no_show"].includes(bookingStatus(booking)))
    .map((booking) => {
      const start = minutesFromTime(bookingTimeKey(booking));
      const duration = Math.max(15, Number(booking.service_duration_minutes || booking.duration_minutes || 30));
      return { ...booking, start, end: start === null ? null : start + duration };
    })
    .filter((booking) => booking.start !== null)
    .sort((a, b) => a.start - b.start);
  const daySchedule = schedule.find((item) => Number(item.day_of_week ?? item.day) === now.getDay());
  const open = Number(daySchedule?.is_open ?? daySchedule?.open ?? 0) === 1;
  const openStart = minutesFromTime(daySchedule?.start_time || "08:00");
  const openEnd = minutesFromTime(daySchedule?.end_time || "18:00");

  if (!open) {
    suggestions.push({
      code: "review_closed_day",
      severity: "medium",
      title: "Review today's hours",
      body: "Your schedule shows today as closed. Confirm this before accepting requests.",
      confirmationRequired: true,
    });
  } else if (openStart !== null && openEnd !== null) {
    let cursor = openStart;
    todayBookings.forEach((booking) => {
      if (booking.start < openStart || booking.end > openEnd) {
        suggestions.push({
          code: "outside_hours",
          severity: "high",
          title: "Booking outside saved hours",
          body: `${booking.service_name || "A booking"} is outside today's saved working hours.`,
          confirmationRequired: true,
        });
      }
      if (booking.start - cursor >= 60) {
        suggestions.push({
          code: "open_window",
          severity: "low",
          title: "Unused appointment window",
          body: `${timeFromMinutes(cursor)}-${timeFromMinutes(booking.start)} is open. You could offer this slot after checking availability.`,
          confirmationRequired: true,
        });
      }
      cursor = Math.max(cursor, booking.end);
    });
    if (openEnd - cursor >= 60) {
      suggestions.push({
        code: "open_window",
        severity: "low",
        title: "Unused appointment window",
        body: `${timeFromMinutes(cursor)}-${timeFromMinutes(openEnd)} is open. You could promote or hold this time.`,
        confirmationRequired: true,
      });
    }
  }

  for (let index = 1; index < todayBookings.length; index += 1) {
    const previous = todayBookings[index - 1];
    const current = todayBookings[index];
    if (current.start < previous.end) {
      suggestions.push({
        code: "booking_overlap",
        severity: "high",
        title: "Booking conflict",
        body: `${current.service_name || "A booking"} overlaps another booking. Review before confirming more work.`,
        confirmationRequired: true,
      });
    } else if (current.start - previous.end < 10) {
      suggestions.push({
        code: "transition_time",
        severity: "medium",
        title: "Back-to-back bookings",
        body: "Add transition time if setup, travel, or cleanup is needed.",
        confirmationRequired: true,
      });
    }
  }

  if (alerts.length && suggestions.some((item) => item.code === "open_window")) {
    suggestions.push({
      code: "earlier_slot_candidate",
      severity: "medium",
      title: "Earlier-slot interest exists",
      body: "A customer has an active earlier-slot alert. Revalidate the slot before contacting or rescheduling anyone.",
      confirmationRequired: true,
    });
  }

  return suggestions.slice(0, 8);
}

export function buildRetentionInsights({ bookings = [], alerts = [] } = {}) {
  const completed = bookings.filter((booking) => bookingStatus(booking) === "completed" && booking.customer_user_id);
  const byCustomer = new Map();
  completed.forEach((booking) => {
    const key = String(booking.customer_user_id);
    const current = byCustomer.get(key) || { customerUserId: booking.customer_user_id, customerName: booking.customer_full_name || booking.customer_username || "Customer", bookings: [] };
    current.bookings.push(booking);
    byCustomer.set(key, current);
  });
  const customers = [...byCustomer.values()];
  const returning = customers.filter((item) => item.bookings.length > 1);
  const due = customers
    .map((item) => {
      const ordered = item.bookings.sort((a, b) => `${bookingDateKey(b)} ${bookingTimeKey(b)}`.localeCompare(`${bookingDateKey(a)} ${bookingTimeKey(a)}`));
      const last = ordered[0];
      return {
        customerUserId: item.customerUserId,
        customerName: item.customerName,
        lastBookingDate: bookingDateKey(last),
        previousService: last.service_name || last.service || "Service",
        reason: item.bookings.length >= 2 ? "This customer has booked before and may be ready to review a repeat service." : "One completed booking so far; use a gentle follow-up only when appropriate.",
        draft: `Hello ${item.customerName}, thanks again for booking ${last.service_name || "with us"} at Queless. If you would like another appointment, I can share available times for you to review.`,
        requiresReview: true,
      };
    })
    .slice(0, 10);
  return {
    completedBookings: completed.length,
    returningCustomers: returning.length,
    newCustomers: customers.length - returning.length,
    repeatCustomerRate: customers.length ? Number(((returning.length / customers.length) * 100).toFixed(1)) : null,
    earlierSlotAlerts: alerts.length,
    opportunities: due,
    smallHistoryWarning: completed.length < PREMIUM_SAMPLE_WARNING_THRESHOLD,
    delivery: "Draft only. Provider must review before sending through supported messaging.",
  };
}

export function buildProfileGuidance({ business = {}, services = [], schedule = [] } = {}) {
  const missing = [];
  if (!String(business.business_name || "").trim()) missing.push({ field: "Business name", why: "Customers need to know who they are booking." });
  if (!String(business.intro_text || business.description || "").trim()) missing.push({ field: "Description", why: "A short truthful description helps customers understand your service style." });
  if (!String(business.business_type || "").trim()) missing.push({ field: "Category", why: "Categories help Queless show your stand in the right searches." });
  if (!services.length) missing.push({ field: "Services", why: "Customers cannot book clearly without service options." });
  if (services.some((service) => !String(service.description || "").trim())) missing.push({ field: "Service descriptions", why: "Clear descriptions reduce confusion before booking." });
  if (services.some((service) => !knownBookingPrice({ price: service.price_extra || service.price, pricing_type: service.pricing_type }) && String(service.pricing_type || "").toLowerCase() !== "quote")) missing.push({ field: "Prices or quote labels", why: "Price clarity helps customers decide without surprises." });
  if (services.some((service) => !Number(service.duration_minutes || 0))) missing.push({ field: "Service duration", why: "Durations make availability and arrival estimates more reliable." });
  if (!String(business.location || "").trim() && !Number(business.home_service_enabled || 0)) missing.push({ field: "Location or service area", why: "Customers should know where to go or whether you can travel." });
  if (!schedule.some((day) => Number(day.is_open ?? day.open ?? 0) === 1)) missing.push({ field: "Opening hours", why: "Hours help customers pick realistic booking times." });
  if (!String(business.image || "").trim()) missing.push({ field: "Profile image", why: "A real image helps the stand feel active and trustworthy." });
  return {
    missing,
    complete: missing.length === 0,
    note: "Provider must review and save any changes manually. Verification is never granted by payment tier alone.",
  };
}

export function draftProviderResponse({ message = "", service = null, booking = null, business = {} } = {}) {
  const serviceName = service?.service_name || booking?.service_name || "the service";
  const price = service ? (knownBookingPrice({ price: service.price_extra, pricing_type: service.pricing_type }) || null) : knownBookingPrice(booking);
  const priceText = price ? ` The known price is UGX ${Math.round(price).toLocaleString("en-UG")}.` : " I will confirm the price before you decide.";
  const dateText = bookingDateKey(booking) ? ` for ${bookingDateKey(booking)}${bookingTimeKey(booking) ? ` at ${bookingTimeKey(booking)}` : ""}` : "";
  return {
    draft: `Hello, thanks for contacting ${business.business_name || "us"} about ${serviceName}${dateText}.${priceText} I will check availability and confirm the details before any booking is finalized.`,
    requiresReview: true,
    sendAvailable: false,
    safety: "Draft only. Customer text is treated as context, not instructions. Provider must review before sending.",
    ignoredCustomerInstructions: /ignore|system|developer|password|secret/i.test(String(message || "")),
  };
}

export function validatePromotionPayload(payload = {}, service = {}) {
  const title = String(payload.title || "").trim();
  const discountType = String(payload.discountType || payload.discount_type || "").trim().toLowerCase();
  const discountValue = Number(payload.discountValue ?? payload.discount_value ?? 0);
  const startDate = normalizeDate(payload.startDate || payload.start_date);
  const endDate = normalizeDate(payload.endDate || payload.end_date);
  const description = String(payload.description || "").trim();
  if (!title || title.length > 120) throw httpError(400, "Promotion title is required.");
  if (!["fixed", "percentage"].includes(discountType)) throw httpError(400, "Choose a fixed amount or percentage discount.");
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw httpError(400, "Discount value must be greater than zero.");
  if (discountType === "percentage" && discountValue > 50) throw httpError(400, "Percentage discounts cannot exceed 50%.");
  if (!startDate || !endDate || endDate < startDate) throw httpError(400, "Choose a valid promotion date range.");
  const knownPrice = knownBookingPrice({ price: service.price_extra || service.price, pricing_type: service.pricing_type });
  if (String(service.pricing_type || "").toLowerCase() === "quote") {
    return { title, discountType, discountValue, startDate, endDate, description, quoteService: true };
  }
  if (discountType === "fixed" && knownPrice !== null && discountValue >= knownPrice) {
    throw httpError(400, "Fixed discount cannot make the known service price zero or negative.");
  }
  return { title, discountType, discountValue, startDate, endDate, description, quoteService: false };
}

async function loadProviderPremiumData(business) {
  const businessId = Number(business.id);
  const [services, schedule, bookings, alerts, promotions] = await Promise.all([
    all(`SELECT * FROM barber_services WHERE barber_id = ? ORDER BY category ASC, service_name ASC`, [businessId]),
    all(`SELECT * FROM barber_schedule WHERE barber_id = ? ORDER BY day_of_week ASC`, [businessId]),
    all(`SELECT * FROM bookings WHERE barber_id = ? ORDER BY booking_date DESC, booking_time DESC, id DESC LIMIT 500`, [businessId]),
    all(`SELECT * FROM customer_slot_alerts WHERE provider_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 50`, [businessId]).catch(() => []),
    all(`SELECT * FROM provider_promotions WHERE barber_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`, [businessId]).catch(() => []),
  ]);
  return { services, schedule, bookings, alerts, promotions };
}

export async function getProviderPremiumDashboard(userId, { range: rangeKey = "last_30_days" } = {}) {
  const business = await getOwnedAiCoachBusiness(userId);
  const snapshot = await getProviderEntitlementSnapshot(userId);
  const data = await loadProviderPremiumData(business);
  const range = normalizeRange(rangeKey);
  const freePreview = !snapshot.entitlements[PROVIDER_ENTITLEMENTS.REVENUE_ANALYTICS];
  const analytics = buildProviderAnalytics({ bookings: data.bookings, range });
  const profile = buildProfileGuidance({ business, services: data.services, schedule: data.schedule });
  return {
    businessId: business.id,
    plan: snapshot.tier,
    entitlements: snapshot.entitlements,
    limits: snapshot.limits,
    access: freePreview ? "preview" : "premium",
    analytics: freePreview ? {
      totalBookings: analytics.totalBookings,
      completedBookings: analytics.completedBookings,
      message: "Upgrade to Provider Premium for detailed revenue, cancellation, no-show, schedule, and retention insights.",
    } : analytics,
    scheduleSuggestions: freePreview ? [] : buildScheduleSuggestions({ bookings: data.bookings, schedule: data.schedule, alerts: data.alerts }),
    retention: freePreview ? null : buildRetentionInsights({ bookings: data.bookings, alerts: data.alerts }),
    profileGuidance: profile,
    promotions: freePreview ? [] : data.promotions,
    limitations: [
      "No profit is calculated because Queless does not store provider cost data.",
      "Unknown and quote-required prices are separated from known revenue.",
      "No action is performed automatically; provider confirmation is required.",
    ],
  };
}

export async function createProviderPromotion(userId, payload = {}) {
  await assertProviderEntitlement(userId, PROVIDER_ENTITLEMENTS.PROMOTIONS);
  const business = await getOwnedAiCoachBusiness(userId);
  const serviceId = Number(payload.serviceId || payload.service_id || 0);
  const service = await get(`SELECT * FROM barber_services WHERE id = ? AND barber_id = ?`, [serviceId, business.id]);
  if (!service) throw httpError(404, "Choose one of your own services for this promotion.");
  const normalized = validatePromotionPayload(payload, service);
  const status = String(payload.confirm === true || payload.confirm === "true" ? "active" : "draft");
  if (!PROMOTION_STATUSES.has(status)) throw httpError(400, "Invalid promotion status.");
  if (status === "draft") {
    return { confirmationRequired: true, promotion: { ...normalized, serviceId, serviceName: service.service_name, status: "draft" } };
  }
  return transaction(async (client) => {
    const duplicate = await client.get(
      `SELECT id FROM provider_promotions
       WHERE barber_id = ? AND service_id = ? AND status = 'active'
         AND title = ? AND end_date >= date('now')`,
      [business.id, serviceId, normalized.title]
    );
    if (duplicate) throw httpError(409, "An active promotion with this title already exists for that service.", "DUPLICATE_PROMOTION");
    const result = await client.run(
      `INSERT INTO provider_promotions
       (barber_id, service_id, title, description, discount_type, discount_value, start_date, end_date,
        usage_limit, per_customer_limit, eligible_customer_group, status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        business.id,
        serviceId,
        normalized.title,
        normalized.description,
        normalized.discountType,
        normalized.discountValue,
        normalized.startDate,
        normalized.endDate,
        Number(payload.usageLimit || payload.usage_limit || 0) || null,
        Number(payload.perCustomerLimit || payload.per_customer_limit || 0) || null,
        String(payload.eligibleCustomerGroup || payload.eligible_customer_group || "all").slice(0, 80),
        userId,
      ]
    );
    return {
      confirmationRequired: false,
      promotion: {
        id: result.lastID,
        serviceId,
        serviceName: service.service_name,
        status: "active",
        ...normalized,
      },
    };
  });
}

export async function createProviderResponseDraft(userId, payload = {}) {
  await assertProviderEntitlement(userId, PROVIDER_ENTITLEMENTS.RESPONSE_ASSISTANT);
  const business = await getOwnedAiCoachBusiness(userId);
  let service = null;
  let booking = null;
  const serviceId = Number(payload.serviceId || payload.service_id || 0);
  const bookingId = Number(payload.bookingId || payload.booking_id || 0);
  if (serviceId) service = await get(`SELECT * FROM barber_services WHERE id = ? AND barber_id = ?`, [serviceId, business.id]);
  if (bookingId) booking = await get(`SELECT * FROM bookings WHERE id = ? AND barber_id = ?`, [bookingId, business.id]);
  return draftProviderResponse({ message: payload.message, service, booking, business });
}
