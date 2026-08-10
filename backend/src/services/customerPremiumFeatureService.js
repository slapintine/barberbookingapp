import db from "../config/db.js";
import { all, get, run, transaction } from "../db/query.js";
import { publicBusinessParams, publicBusinessWhere } from "./businessVisibility.js";
import { CAPABILITY, hasCapability } from "./entitlementMatrix.js";
import { getCustomerEntitlements } from "./entitlementService.js";

const ALERT_STATUSES = new Set(["active", "paused", "matched", "expired", "cancelled"]);
const DEFAULT_EARLIER_SLOT_LIMIT = 10;

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

function isPastDateTime(date, time = "23:59") {
  const parsed = new Date(`${date}T${time || "23:59"}:00+03:00`);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() < Date.now();
}

function availableServiceWhere(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return db.client === "postgres"
    ? `COALESCE(${prefix}is_available, true) = true`
    : `COALESCE(${prefix}is_available, 1) = 1`;
}

async function requireCustomerCapability(userId, capability) {
  const snapshot = await getCustomerEntitlements(userId);
  if (!hasCapability(snapshot.capabilities, capability)) {
    throw httpError(403, "This feature is included with Customer Premium.", "CUSTOMER_PREMIUM_REQUIRED");
  }
  return snapshot;
}

function formatServicePrice(service = {}) {
  const pricingType = String(service.pricing_type || "fixed").toLowerCase();
  const fixed = Number(service.price_extra || 0);
  const min = Number(service.min_price || 0);
  const max = Number(service.max_price || 0);
  const starting = Number(service.starting_price || 0);
  if (pricingType === "quote") return { priceLabel: "Quote required", priceMin: 0, priceMax: 0, pricingType };
  if (min > 0 && max >= min) return { priceLabel: `UGX ${min.toLocaleString("en-UG")}-${max.toLocaleString("en-UG")}`, priceMin: min, priceMax: max, pricingType };
  if (starting > 0) return { priceLabel: `From UGX ${starting.toLocaleString("en-UG")}`, priceMin: starting, priceMax: starting, pricingType };
  if (fixed > 0) return { priceLabel: `UGX ${fixed.toLocaleString("en-UG")}`, priceMin: fixed, priceMax: fixed, pricingType };
  return { priceLabel: "Quote required", priceMin: 0, priceMax: 0, pricingType };
}

function mapBookingDetails(row = {}) {
  try {
    return JSON.parse(row.booking_details_json || "{}") || {};
  } catch {
    return {};
  }
}

async function getCurrentServiceForBooking(booking) {
  const serviceId = Number(booking.booking_details?.serviceId || booking.booking_details?.service_id || booking.service_id || 0);
  return get(
    `SELECT *
     FROM barber_services
     WHERE barber_id = ?
       AND ${availableServiceWhere()}
       AND (LOWER(service_name) = LOWER(?) OR id = ?)
     ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [booking.barber_id, booking.service_name, serviceId, serviceId]
  );
}

function bookingMatchesService(booking = {}, service = {}) {
  const details = booking.booking_details || {};
  const bookingServiceId = Number(details.serviceId || details.service_id || booking.service_id || 0);
  if (bookingServiceId) return bookingServiceId === Number(service.id);

  const bookingServiceName = String(booking.service_name || details.serviceName || details.service_name || "").trim().toLowerCase();
  const currentServiceName = String(service.service_name || "").trim().toLowerCase();
  return Boolean(bookingServiceName && currentServiceName && bookingServiceName === currentServiceName);
}

export async function getCustomerPlanSnapshot(userId) {
  return getCustomerEntitlements(userId);
}

export async function getSmartRebookingOptions(userId) {
  await requireCustomerCapability(userId, CAPABILITY.CUSTOMER_SMART_MATCH_REBOOKING);
  const now = new Date();
  const rows = await all(
    `SELECT b.*, br.business_name, br.business_type, br.location, br.image,
            br.business_status, br.is_published
     FROM bookings b
     JOIN barbers br ON br.id = b.barber_id
     WHERE b.customer_user_id = ?
       AND LOWER(b.status) = 'completed'
     ORDER BY b.booking_date DESC, b.booking_time DESC, b.id DESC
     LIMIT 20`,
    [userId]
  );

  const options = [];
  for (const row of rows) {
    const booking = { ...row, booking_details: mapBookingDetails(row) };
    const service = await getCurrentServiceForBooking(booking);
    const providerAvailable = Boolean(row.is_published) && !["deleted", "inactive", "suspended"].includes(String(row.business_status || "").toLowerCase());
    const price = service ? formatServicePrice(service) : null;
    options.push({
      bookingId: row.id,
      providerId: row.barber_id,
      providerName: row.business_name,
      providerType: row.business_type,
      previousDate: row.booking_date,
      previousTime: row.booking_time,
      previousServiceName: row.service_name,
      providerAvailable,
      serviceAvailable: Boolean(service && providerAvailable),
      unavailableReason: !providerAvailable
        ? "Provider is not currently available."
        : !service
        ? "This service is no longer available from this provider."
        : "",
      currentService: service ? {
        serviceId: service.id,
        serviceName: service.service_name,
        durationMinutes: Number(service.duration_minutes || 0) || null,
        ...price,
      } : null,
      notesPreview: String(booking.booking_details?.notes || "").slice(0, 160),
      generatedAt: now.toISOString(),
    });
  }
  return options;
}

export async function createEarlierSlotAlert(userId, payload = {}) {
  const snapshot = await requireCustomerCapability(userId, CAPABILITY.CUSTOMER_EARLIER_SLOT_ALERTS);
  const existingBookingId = Number(payload.existingBookingId || payload.existing_booking_id || 0) || null;
  const providerId = Number(payload.providerId || payload.provider_id || 0) || null;
  const serviceId = Number(payload.serviceId || payload.service_id || 0) || null;
  const desiredStartDate = normalizeDate(payload.desiredStartDate || payload.desired_start_date);
  const desiredEndDate = normalizeDate(payload.desiredEndDate || payload.desired_end_date || desiredStartDate);
  const preferredStartTime = normalizeTime(payload.preferredStartTime || payload.preferred_time_start || "08:00");
  const preferredEndTime = normalizeTime(payload.preferredEndTime || payload.preferred_time_end || "20:00");
  const notificationPreference = String(payload.notificationPreference || payload.notification_preference || "in_app").toLowerCase() === "push" ? "push" : "in_app";

  if (!providerId || !serviceId || !desiredStartDate || !desiredEndDate || !preferredStartTime || !preferredEndTime) {
    throw httpError(400, "Provider, service, date range, and time window are required.");
  }
  if (desiredEndDate < desiredStartDate) throw httpError(400, "End date cannot be before start date.");
  if (preferredEndTime <= preferredStartTime) throw httpError(400, "Choose an end time after the start time.");
  if (isPastDateTime(desiredEndDate, preferredEndTime)) throw httpError(400, "Earlier-slot alerts cannot target past times.");

  const provider = await get(
    `SELECT id FROM barbers b WHERE b.id = ? AND ${publicBusinessWhere("b")}`,
    [providerId, ...publicBusinessParams(new Date())]
  );
  if (!provider) throw httpError(404, "Provider is not available for alerts.");

  const service = await get(
    `SELECT id, service_name FROM barber_services WHERE id = ? AND barber_id = ? AND ${availableServiceWhere()}`,
    [serviceId, providerId]
  );
  if (!service) throw httpError(404, "Service is not available for alerts.");

  if (existingBookingId) {
    const booking = await get(
      `SELECT id, service_name, booking_details_json
       FROM bookings
       WHERE id = ? AND customer_user_id = ? AND barber_id = ?`,
      [existingBookingId, userId, providerId]
    );
    if (!booking) throw httpError(403, "You can only create alerts for your own bookings.");
    const bookingWithDetails = { ...booking, booking_details: mapBookingDetails(booking) };
    if (!bookingMatchesService(bookingWithDetails, service)) {
      throw httpError(400, "Selected service does not match this booking.", "SERVICE_CONTEXT_MISMATCH");
    }
  }

  return transaction(async (client) => {
    const duplicate = await client.get(
      `SELECT id FROM customer_slot_alerts
       WHERE customer_user_id = ? AND provider_id = ? AND service_id = ?
         AND status = 'active'
         AND desired_start_date = ? AND desired_end_date = ?
         AND preferred_time_start = ? AND preferred_time_end = ?`,
      [userId, providerId, serviceId, desiredStartDate, desiredEndDate, preferredStartTime, preferredEndTime]
    );
    if (duplicate) throw httpError(409, "An active alert already exists for this provider, service, and time window.", "DUPLICATE_ALERT");

    const limitRow = await client.get(
      `SELECT COUNT(*) AS count FROM customer_slot_alerts WHERE customer_user_id = ? AND status = 'active'`,
      [userId]
    );
    const alertLimit = Number(snapshot.limits?.earlierSlotAlerts || DEFAULT_EARLIER_SLOT_LIMIT);
    if (Number(limitRow?.count || 0) >= alertLimit) {
      throw httpError(403, "You've reached your active earlier-slot alert limit.", "ALERT_LIMIT_REACHED");
    }

    const result = await client.run(
      `INSERT INTO customer_slot_alerts
       (customer_user_id, existing_booking_id, provider_id, service_id, desired_start_date, desired_end_date,
        preferred_time_start, preferred_time_end, current_booking_date, current_booking_time,
        notification_preference, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`,
      [
        userId,
        existingBookingId,
        providerId,
        serviceId,
        desiredStartDate,
        desiredEndDate,
        preferredStartTime,
        preferredEndTime,
        normalizeDate(payload.currentBookingDate || payload.current_booking_date),
        normalizeTime(payload.currentBookingTime || payload.current_booking_time),
        notificationPreference,
        `${desiredEndDate}T${preferredEndTime}:00+03:00`,
      ]
    );
    return getCustomerSlotAlertById(userId, result.lastID || result.lastInsertRowid || result.id);
  });
}

export async function getCustomerSlotAlertById(userId, alertId) {
  return get(
    `SELECT csa.*, b.business_name AS provider_name, s.service_name
     FROM customer_slot_alerts csa
     LEFT JOIN barbers b ON b.id = csa.provider_id
     LEFT JOIN barber_services s ON s.id = csa.service_id
     WHERE csa.id = ? AND csa.customer_user_id = ?`,
    [alertId, userId]
  );
}

export async function listEarlierSlotAlerts(userId) {
  await requireCustomerCapability(userId, CAPABILITY.CUSTOMER_EARLIER_SLOT_ALERTS);
  return all(
    `SELECT csa.*, b.business_name AS provider_name, s.service_name
     FROM customer_slot_alerts csa
     LEFT JOIN barbers b ON b.id = csa.provider_id
     LEFT JOIN barber_services s ON s.id = csa.service_id
     WHERE csa.customer_user_id = ?
     ORDER BY csa.created_at DESC, csa.id DESC`,
    [userId]
  );
}

export async function cancelEarlierSlotAlert(userId, alertId) {
  await requireCustomerCapability(userId, CAPABILITY.CUSTOMER_EARLIER_SLOT_ALERTS);
  const existing = await getCustomerSlotAlertById(userId, alertId);
  if (!existing) throw httpError(404, "Alert not found.");
  if (!ALERT_STATUSES.has(String(existing.status || ""))) throw httpError(409, "Alert status is not valid.");
  await run(
    `UPDATE customer_slot_alerts
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND customer_user_id = ?`,
    [alertId, userId]
  );
  return getCustomerSlotAlertById(userId, alertId);
}
