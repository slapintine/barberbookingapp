import { all, get, run, transaction } from "../db/query.js";
import {
  sendBookingNotification,
  sendNotificationToBusiness,
  sendPaymentNotification,
} from "../services/notificationService.js";
import {
  sendBookingCreatedProviderSmsFallback,
  sendBookingStatusCustomerSmsFallback,
  sendPaidBookingProviderSmsFallback,
  sendPaymentSmsFallback,
} from "../services/lifecycleSmsService.js";
import { requireClockTime, requireIsoDate, toPositiveInteger } from "../utils/validation.js";
import { bookingConfirmationEmail, sendEmail } from "../services/emailService.js";
import { env } from "../config/env.js";
import {
  createReference,
  getMobileMoneyProviderLabel,
  normalizeMoneyAmount,
  normalizeUgandaPhoneNumber,
} from "../services/paymentService.js";
import {
  BOOKING_PAYMENT_METHODS,
  getBookingPaymentBreakdown,
  isBookingPaymentMethodEnabled,
  isMobileMoneyPayment,
} from "../services/bookingPaymentRules.js";
import { publicBusinessParams, publicBusinessWhere } from "../services/businessVisibility.js";
import { getMobileMoneyService } from "../services/mobileMoneyService.js";
import {
  creditPendingBarberShare,
  reversePendingBarberShare,
  settlePendingBarberShare,
} from "../services/ledgerService.js";
import {
  createPaymentRecord,
  getPaymentRecordByBookingId,
  markWebhookEventProcessed,
  recordWebhookEvent,
  updatePaymentRecord,
  normalizeLifecycleStatus,
} from "../services/paymentDataService.js";

/* ================= HELPERS ================= */

function getBarberById(barberId, client = { get }) {
  const now = new Date();
  return client.get(
    `SELECT
       id,
       owner_user_id,
       business_name,
       location,
       price_from,
       availability_start,
       availability_end,
       accepts_wallet,
       accepts_cash,
       home_service_enabled,
       stand_type,
       subscription_tier,
       subscription_status,
       subscription_expires_at,
       business_status,
       is_published,
       trial_status,
       trial_ends_at
     FROM barbers b
     WHERE b.id = ?
       AND ${publicBusinessWhere("b")}`,
    [barberId, ...publicBusinessParams(now)]
  );
}

function getMyOwnedBarber(reqUserId, client = { get }) {
  return client.get(
    `SELECT id, owner_user_id, business_name
     FROM barbers
     WHERE owner_user_id = ?`,
    [reqUserId]
  );
}

function getUsernameByUserId(userId, client = { get }) {
  return client.get(`SELECT username FROM users WHERE id = ?`, [userId]);
}

function getCustomerProfileByUserId(userId, client = { get }) {
  return client.get(
    `SELECT full_name, email, phone FROM profiles WHERE user_id = ?`,
    [userId]
  );
}

function getProfileByUserId(userId, client = { get }) {
  return client.get(
    `SELECT full_name, email, phone FROM profiles WHERE user_id = ?`,
    [userId]
  );
}

function getBarberServiceById(serviceId, barberId, client = { get }) {
  return client.get(
    `SELECT id, barber_id, service_name, price_extra, pricing_type, min_price, max_price, starting_price, duration_minutes, location_type, is_available
     FROM barber_services
     WHERE id = ? AND barber_id = ? AND COALESCE(is_available, 1) = 1`,
    [serviceId, barberId]
  );
}

function getTeamMemberById(teamMemberId, barberId, client = { get }) {
  return client.get(
    `SELECT id, barber_id, name, title, bio, image, specialties, is_active
     FROM barber_team_members
     WHERE id = ? AND barber_id = ? AND is_active = 1`,
    [teamMemberId, barberId]
  );
}

function getActiveTeamMemberCount(barberId, client = { get }) {
  return client.get(
    `SELECT COUNT(*) AS count
     FROM barber_team_members
     WHERE barber_id = ? AND is_active = 1`,
    [barberId]
  );
}

function getBookingById(bookingId, client = { get }) {
  return client.get(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
}

function getPaymentTransactionByBookingId(bookingId, client = { get }) {
  return client.get(
    `SELECT * FROM payment_transactions
     WHERE booking_id = ?
       AND transaction_type = 'booking_payment'
     ORDER BY id DESC
     LIMIT 1`,
    [bookingId]
  );
}

function addNotification(userId, { title, type, message }) {
  return run(
    `INSERT INTO notifications (user_id, title, type, message, read)
     VALUES (?, ?, ?, ?, 0)`,
    [userId, title, type, message]
  );
}

function logAudit(userId, action) {
  return run(
    `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
    [userId || null, action]
  ).catch(() => {});
}

function addBookingEvent(bookingId, actorUserId, eventType, eventNote = "") {
  return run(
    `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
     VALUES (?, ?, ?, ?)`,
    [bookingId, actorUserId, eventType, eventNote]
  ).catch(() => {});
}

export const LIVE_BOOKING_STATUSES = Object.freeze({
  expected: {
    label: "Customer expected",
    notification: false,
    terminal: false,
    allowedFrom: ["", "expected", "running_late"],
  },
  arrived: {
    label: "Customer arrived",
    notification: false,
    terminal: false,
    allowedFrom: ["", "expected", "running_late", "arrived"],
  },
  ready: {
    label: "Ready for customer",
    notification: true,
    terminal: false,
    allowedFrom: ["", "expected", "running_late", "arrived", "ready"],
  },
  service_started: {
    label: "Service started",
    notification: false,
    terminal: false,
    allowedFrom: ["", "expected", "running_late", "arrived", "ready", "service_started"],
  },
  running_late: {
    label: "Running late",
    notification: true,
    terminal: false,
    allowedFrom: ["", "expected", "running_late", "arrived", "ready"],
  },
  service_completed: {
    label: "Service completed",
    notification: false,
    terminal: true,
    lifecycleStatus: "completed",
    allowedFrom: ["", "expected", "running_late", "arrived", "ready", "service_started", "service_completed"],
  },
  no_show: {
    label: "Customer did not arrive",
    notification: true,
    terminal: true,
    lifecycleStatus: "no_show",
    allowedFrom: ["", "expected", "running_late", "ready", "no_show"],
  },
  booking_cancelled: {
    label: "Booking cancelled",
    notification: true,
    terminal: true,
    lifecycleStatus: "cancelled",
    allowedFrom: ["", "expected", "running_late", "arrived", "ready", "booking_cancelled"],
  },
});

const LIVE_STATUS_ALIASES = Object.freeze({
  customer_expected: "expected",
  customer_arrived: "arrived",
  ready_for_customer: "ready",
  started: "service_started",
  completed: "service_completed",
  customer_did_not_arrive: "no_show",
  did_not_arrive: "no_show",
  cancelled: "booking_cancelled",
  canceled: "booking_cancelled",
});

export function normalizeLiveBookingStatus(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return LIVE_STATUS_ALIASES[raw] || raw;
}

export function normalizeDelayMinutes(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "on_time" || raw === "on time") return 0;
  const parsed = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 240);
}

export function shouldNotifyLiveStatusChange(liveUpdate, booking = {}) {
  if (!liveUpdate?.notification) return false;
  if (liveUpdate.liveStatus === "running_late" && normalizeDelayMinutes(booking.delay_minutes) <= 0) {
    return false;
  }
  return true;
}

function addDaysToDate(dateString, daysToAdd = 0) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day || !Number.isFinite(daysToAdd)) return dateString || "";
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return date.toISOString().slice(0, 10);
}

function addMinutesToBookingTime(time, minutesToAdd = 0) {
  const rawTotal = toMinutes(time) + Number(minutesToAdd || 0);
  const safeTotal = Math.max(0, rawTotal);
  const dayOffset = Math.floor(safeTotal / 1440);
  const localMinutes = safeTotal % 1440;
  const hours = Math.floor(localMinutes / 60);
  const minutes = localMinutes % 60;
  return {
    time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    dayOffset,
  };
}

function addMinutesToTime(time, minutesToAdd = 0) {
  return addMinutesToBookingTime(time, minutesToAdd).time;
}

export function getLiveStatusTransition({ booking = {}, liveStatus }) {
  const next = normalizeLiveBookingStatus(liveStatus);
  const config = LIVE_BOOKING_STATUSES[next];
  if (!config) {
    return { ok: false, message: "Invalid live booking status." };
  }

  const lifecycle = String(booking.status || "").toLowerCase();
  if (["completed", "cancelled", "rejected", "no_show"].includes(lifecycle)) {
    return { ok: false, message: "This booking is already closed." };
  }
  if (lifecycle !== "confirmed") {
    return { ok: false, message: "Live updates are only available for confirmed bookings." };
  }

  const current = normalizeLiveBookingStatus(booking.live_status || "");
  if (!config.allowedFrom.includes(current)) {
    return { ok: false, message: "This live booking status cannot follow the current status." };
  }

  return {
    ok: true,
    liveStatus: next,
    lifecycleStatus: config.lifecycleStatus || lifecycle,
    label: config.label,
    notification: config.notification,
  };
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

async function getBookingEvents(bookingId, client = { all }) {
  return client.all(
    `SELECT id, actor_user_id, event_type, event_note, idempotency_key, created_at
     FROM booking_events
     WHERE booking_id = ?
     ORDER BY id ASC`,
    [bookingId]
  ).catch(() => []);
}

async function getCustomersAhead(booking, client = { all }) {
  if (!booking?.barber_id || !booking?.booking_date || !booking?.booking_time) return null;
  const params = [
    booking.barber_id,
    booking.booking_date,
    normalizeTimeInput(booking.booking_time),
  ];
  const teamFilter = booking.team_member_id ? "AND team_member_id = ?" : "AND team_member_id IS NULL";
  if (booking.team_member_id) params.push(booking.team_member_id);
  params.push(booking.id);

  const rows = await client.all(
    `SELECT id
     FROM bookings
     WHERE barber_id = ?
       AND booking_date = ?
       AND booking_time < ?
       ${teamFilter}
       AND id <> ?
       AND status = 'confirmed'
       AND COALESCE(live_status, '') NOT IN ('service_completed', 'no_show', 'booking_cancelled')
     ORDER BY booking_time ASC`,
    params
  ).catch(() => []);
  return rows.length;
}

/* ================= TIME ================= */

function normalizeTimeInput(time) {
  const raw = String(time || "").trim().toUpperCase();

  if (!raw) return "";

  if (/^\d{2}:\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return raw;

  let hours = Number(match[1]);
  const minutes = match[2];
  const modifier = match[3].toUpperCase();

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function toMinutes(time) {
  const normalized = normalizeTimeInput(time);
  const [h, m] = String(normalized || "00:00").split(":").map(Number);
  return h * 60 + m;
}

/* ================= DATE ================= */

function getDayOfWeek(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/* ================= SCHEDULE ================= */

function getBarberScheduleForDay(barberId, dayOfWeek, client = { get }) {
  return client.get(
    `SELECT * FROM barber_schedule
     WHERE barber_id = ? AND day_of_week = ?`,
    [barberId, dayOfWeek]
  );
}

function getActiveBookingsForBarberOnDate(barberId, bookingDate, teamMemberId = null, client = { all }) {
  const teamFilter = teamMemberId
    ? "AND team_member_id = ?"
    : "AND team_member_id IS NULL";
  const params = teamMemberId ? [barberId, bookingDate, teamMemberId] : [barberId, bookingDate];

  return client.all(
    `SELECT id, booking_time, service_duration_minutes, team_member_id
     FROM bookings
     WHERE barber_id = ?
       AND booking_date = ?
       ${teamFilter}
       AND status IN ('payment_pending','pending','confirmed')`,
    params
  );
}

function getAvailabilityBookingsForBarberOnDate(barberId, bookingDate, teamMemberId = null, client = { all }) {
  const teamFilter = teamMemberId
    ? "AND team_member_id = ?"
    : "";
  const params = teamMemberId ? [barberId, bookingDate, teamMemberId] : [barberId, bookingDate];

  return client.all(
    `SELECT id, booking_time, service_duration_minutes, status, team_member_id
     FROM bookings
     WHERE barber_id = ?
       AND booking_date = ?
       ${teamFilter}
       AND status IN ('payment_pending','pending','confirmed')`,
    params
  );
}

function resolveWorkingWindow(barber, scheduleRow) {
  const barberStart = normalizeTimeInput(barber?.availability_start || "");
  const barberEnd = normalizeTimeInput(barber?.availability_end || "");

  const hasBarberWindow =
    /^\d{2}:\d{2}$/.test(barberStart) &&
    /^\d{2}:\d{2}$/.test(barberEnd) &&
    toMinutes(barberEnd) > toMinutes(barberStart);

  const scheduleStart = normalizeTimeInput(scheduleRow?.start_time || "");
  const scheduleEnd = normalizeTimeInput(scheduleRow?.end_time || "");

  const hasScheduleWindow =
    /^\d{2}:\d{2}$/.test(scheduleStart) &&
    /^\d{2}:\d{2}$/.test(scheduleEnd) &&
    toMinutes(scheduleEnd) > toMinutes(scheduleStart);

  // ✅ If open schedule exists → use it
  if (scheduleRow && Number(scheduleRow.is_open) === 1 && hasScheduleWindow) {
    return {
      start: scheduleStart,
      end: scheduleEnd,
      source: "schedule"
    };
  }

  // ❗ DO NOT RETURN NULL ANYMORE

  // ✅ fallback to barber profile hours
  if (hasBarberWindow) {
    return {
      start: barberStart,
      end: barberEnd,
      source: "barber"
    };
  }

  // ✅ final fallback
  return {
    start: "08:00",
    end: "20:00",
    source: "default"
  };
}

/* ================= PROTECTION ================= */

function getActiveBookingsForCustomerWithBarber(userId, barberId, client = { all }) {
  return client.all(
    `SELECT id FROM bookings
     WHERE customer_user_id = ?
       AND barber_id = ?
       AND status IN ('payment_pending','pending','confirmed')`,
    [userId, barberId]
  );
}

function getRecentBookingForCustomerWithBarber(userId, barberId, client = { get }) {
  return client.get(
    `SELECT created_at FROM bookings
     WHERE customer_user_id = ?
       AND barber_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [userId, barberId]
  );
}

/* ================= VALIDATION ================= */

function isWithinSchedule(window, bookingTime, durationMinutes) {
  if (!window) return false;

  const requestedStart = toMinutes(normalizeTimeInput(bookingTime));
  const requestedEnd = requestedStart + Number(durationMinutes || 30);

  const start = toMinutes(normalizeTimeInput(window.start));
  const end = toMinutes(normalizeTimeInput(window.end));

  return requestedStart >= start && requestedEnd <= end;
}

function hasOverlap(existingBookings, bookingTime, durationMinutes) {
  const requestedStart = toMinutes(bookingTime);
  const requestedEnd = requestedStart + durationMinutes;

  return existingBookings.some((item) => {
    const existingStart = toMinutes(item.booking_time);
    const existingEnd = existingStart + Number(item.service_duration_minutes || 30);
    return requestedStart < existingEnd && requestedEnd > existingStart;
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isSuccessfulPaymentStatus(value) {
  return ["successful", "success", "completed", "paid"].includes(String(value || "").trim().toLowerCase());
}

function isFailedPaymentStatus(value) {
  return ["failed", "rejected", "expired", "cancelled", "canceled"].includes(String(value || "").trim().toLowerCase());
}

async function verifyProviderCallbackStatus({ payment, providerReference, reference, expected }) {
  const provider = String(payment?.provider || "").trim().toLowerCase();
  if (!["mtn_mobile_money", "airtel_money"].includes(provider)) {
    return { accepted: false, status: "unsupported", rawResponse: {} };
  }

  const verification = await getMobileMoneyService(provider).verifyTransaction({
    provider,
    providerReference: providerReference || payment.provider_reference,
    reference: reference || payment.internal_reference,
    amount: payment.gross_amount,
  });

  const status = String(verification.status || "").trim().toLowerCase();
  const accepted =
    expected === "successful"
      ? Boolean(verification.success) || isSuccessfulPaymentStatus(status)
      : isFailedPaymentStatus(status);

  return {
    accepted,
    status,
    providerReference: verification.providerReference || providerReference || payment.provider_reference || "",
    rawResponse: verification.rawResponse || {},
  };
}

function normalizePaymentMethod(value, barber) {
  const requestedRaw = String(value || "").trim().toLowerCase();
  const requested = requestedRaw === "wallet_balance" ? "wallet" : requestedRaw || "mtn_mobile_money";

  if (!BOOKING_PAYMENT_METHODS.includes(requested)) {
    throw httpError(400, "Invalid payment method.");
  }

  if (
    !isBookingPaymentMethodEnabled(requested, {
      onlinePaymentsEnabled: env.bookingOnlinePaymentsEnabled,
      walletPaymentsEnabled: env.bookingWalletPaymentsEnabled,
    })
  ) {
    throw httpError(503, "This booking payment method is not available yet.");
  }

  if (requested === "airtel_money" && !env.airtelEnabled) {
    throw httpError(503, "Airtel Money is currently disabled.");
  }

  if (["mtn_mobile_money", "airtel_money"].includes(requested) && !barber?.owner_user_id) {
    throw httpError(400, "This barber cannot receive mobile money payouts yet.");
  }

  return requested;
}

function resolveServiceBookingPrice(barber, service) {
  const basePrice = Number(barber.price_from || 0);
  const pricingType = String(service?.pricing_type || "fixed").toLowerCase();
  const total =
    pricingType === "quote"
      ? basePrice
      : pricingType === "range"
      ? basePrice + Number(service?.min_price || service?.price_extra || 0)
      : pricingType === "starting_from"
      ? basePrice + Number(service?.starting_price || service?.price_extra || 0)
      : basePrice + Number(service?.price_extra || 0);
  return normalizeMoneyAmount(total, "Booking price");
}

async function ensureWallet(userId, client) {
  let wallet = await client.get(`SELECT id, user_id, balance FROM wallets WHERE user_id = ?`, [userId]);

  if (!wallet) {
    await client.run(
      `INSERT INTO wallets (user_id, balance)
       VALUES (?, 0)
       ON CONFLICT(user_id) DO NOTHING`,
      [userId]
    );
    wallet = await client.get(`SELECT id, user_id, balance FROM wallets WHERE user_id = ?`, [userId]);
  }

  return wallet;
}

async function transferWalletPayment({ fromUserId, barberId, bookingId, amount, barberAmount = amount, paymentTransactionId = null, reference = "", client }) {
  const customerWallet = await ensureWallet(fromUserId, client);
  const ledgerReference = reference || `wallet-booking-${bookingId}-customer`;
  const existingDebit = await client.get(
    `SELECT id FROM wallet_ledger
     WHERE owner_type = 'customer'
       AND owner_id = ?
       AND booking_id = ?
       AND reference = ?
     LIMIT 1`,
    [fromUserId, bookingId, ledgerReference]
  );
  if (existingDebit) return false;

  const debit = await client.run(
    `UPDATE wallets
     SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND balance >= ?`,
    [amount, customerWallet.id, amount]
  );

  if (!debit?.changes) {
    throw httpError(402, "Insufficient wallet balance.");
  }
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, payment_id, direction, balance_bucket, amount, reference, description, metadata)
     VALUES ('customer', ?, ?, ?, 'debit', 'available', ?, ?, ?, ?)`,
    [
      fromUserId,
      bookingId,
      paymentTransactionId,
      amount,
      ledgerReference,
      `Booking #${bookingId} wallet payment`,
      JSON.stringify({ walletId: customerWallet.id }),
    ]
  );
  await creditPendingBarberShare({
    client,
    barberId,
    bookingId,
    paymentTransactionId,
    amount: barberAmount,
    reference: reference || `wallet-booking-${bookingId}`,
  });
  return true;
}

async function refundWalletPayment({ fromUserId, barberId, bookingId, amount, client }) {
  if (!fromUserId || !barberId || !amount) return false;

  const customerWallet = await ensureWallet(fromUserId, client);

  await client.run(
    `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [amount, customerWallet.id]
  );
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, direction, balance_bucket, amount, reference, description, metadata)
     VALUES ('customer', ?, ?, 'credit', 'available', ?, ?, ?, ?)`,
    [
      fromUserId,
      bookingId,
      amount,
      `wallet-refund-${bookingId}-customer`,
      `Booking #${bookingId} refund`,
      JSON.stringify({ walletId: customerWallet.id }),
    ]
  );
  await client.run(
    `UPDATE payment_transactions
     SET status = CASE WHEN status = 'successful' THEN 'refunded' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE booking_id = ? AND provider = 'wallet'`,
    [bookingId]
  );
  await reversePendingBarberShare({
    client,
    barberId,
    bookingId,
    amount,
    reference: `wallet-refund-${bookingId}-barber`,
  }).catch(() => false);

  return true;
}

function canTransitionBooking({ booking, status, isBarberOwner, isCustomer }) {
  const current = String(booking?.status || "").toLowerCase();

  if (isCustomer) {
    return ["payment_pending", "pending", "confirmed"].includes(current) && status === "cancelled";
  }

  if (!isBarberOwner) return false;

  if (current === "pending") {
    return ["confirmed", "rejected", "cancelled"].includes(status);
  }
  if (current === "confirmed") {
    return ["completed", "cancelled", "no_show"].includes(status);
  }

  return false;
}

/* ================= MAP BOOKING ================= */

async function mapBookingRow(row) {
  const barber = await getBarberById(row.barber_id);
  const teamMember = row.team_member_id
    ? await getTeamMemberById(row.team_member_id, row.barber_id).catch(() => null)
    : null;
  const customerUser = await getUsernameByUserId(row.customer_user_id);
  const customerProfile = await getCustomerProfileByUserId(row.customer_user_id);
  const barberOwner = barber?.owner_user_id ? await getUsernameByUserId(barber.owner_user_id) : null;
  const delayMinutes = normalizeDelayMinutes(row.delay_minutes);
  const estimatedStart = addMinutesToBookingTime(row.booking_time, delayMinutes);
  const estimatedStartTime = row.estimated_start_time || estimatedStart.time;
  const estimatedStartDate = addDaysToDate(row.booking_date, estimatedStart.dayOffset);
  const liveStatus = normalizeLiveBookingStatus(row.live_status || "");
  const liveStatusConfig = LIVE_BOOKING_STATUSES[liveStatus] || null;
  const events = await getBookingEvents(row.id);
  const liveStatusHistory = events
    .filter((event) => String(event.event_type || "") === "live_status_changed")
    .map((event) => ({
      id: event.id,
      actor_user_id: event.actor_user_id,
      event_type: event.event_type,
      created_at: event.created_at,
      idempotency_key: event.idempotency_key || "",
      ...safeJson(event.event_note),
    }));
  const customersAhead = String(row.status || "").toLowerCase() === "confirmed"
    ? await getCustomersAhead(row)
    : null;

  return {
    ...row,
    business_name: barber?.business_name || "",
    location: barber?.location || "",
    booking_location_type: row.booking_location_type || "provider_location",
    booking_address: row.booking_address || barber?.location || "",
    booking_details: (() => {
      try {
        return JSON.parse(row.booking_details_json || "{}");
      } catch {
        return {};
      }
    })(),
    barber_owner_username: barberOwner?.username || "",
    barber_username: barberOwner?.username || "",
    team_member_id: row.team_member_id || null,
    team_member_name: teamMember?.name || "",
    team_member_title: teamMember?.title || "",
    customer_username: customerUser?.username || "",
    customer_full_name: customerProfile?.full_name || customerUser?.username || "",
    payment_provider: row.payment_provider || row.payment_method || "",
    payment_reference: row.payment_reference || "",
    payment_customer_phone: row.payment_customer_phone || "",
    commission_amount: Number(row.commission_amount || 0),
    barber_amount: Number(row.barber_amount || 0),
    live_status: liveStatus || "expected",
    live_status_label: liveStatusConfig?.label || "Customer expected",
    delay_minutes: delayMinutes,
    estimated_start_time: estimatedStartTime,
    estimated_start_date: estimatedStartDate,
    customers_ahead: customersAhead,
    provider_ready_at: row.provider_ready_at || null,
    service_started_at: row.service_started_at || null,
    service_completed_at: row.service_completed_at || null,
    live_status_updated_at: row.live_status_updated_at || null,
    live_status_history: liveStatusHistory,
  };
}

function isAdminRole(user = {}) {
  return ["admin", "superadmin", "super_admin", "super-admin"].includes(String(user.role || "").trim().toLowerCase());
}

function isProviderViewer(booking = {}, user = {}) {
  return (
    String(booking.barber_owner_username || booking.barberOwnerUsername || "") &&
    String(booking.barber_owner_username || booking.barberOwnerUsername) === String(user.username || "")
  );
}

function serializeBookingForViewer(booking = {}, user = {}) {
  const safe = { ...booking };
  const canSeeProviderMoney = isAdminRole(user) || isProviderViewer(safe, user);
  if (!canSeeProviderMoney) {
    delete safe.commission_amount;
    delete safe.commissionAmount;
    delete safe.barber_amount;
    delete safe.barberAmount;
  }
  return safe;
}

async function sendBookingConfirmationEmails(booking) {
  const barber = await getBarberById(booking.barber_id);
  const customerProfile = await getProfileByUserId(booking.customer_user_id);
  const customerUser = await getUsernameByUserId(booking.customer_user_id);
  const barberProfile = barber?.owner_user_id ? await getProfileByUserId(barber.owner_user_id) : null;
  const teamMember = booking.team_member_id
    ? await getTeamMemberById(booking.team_member_id, booking.barber_id).catch(() => null)
    : null;

  const base = {
    barberName: barber?.business_name || "Queless provider",
    customerName: customerProfile?.full_name || customerUser?.username || "Customer",
    serviceName: booking.service_name,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    paymentMethod: booking.payment_method,
    price: booking.price,
    teamMemberName: teamMember?.name || "",
  };

  await Promise.allSettled([
    sendEmail({
      to: customerProfile?.email,
      ...bookingConfirmationEmail({
        ...base,
        recipientName: customerProfile?.full_name || customerUser?.username,
      }),
    }),
    sendEmail({
      to: barberProfile?.email,
      ...bookingConfirmationEmail({
        ...base,
        recipientName: barberProfile?.full_name || barber?.business_name,
      }),
    }),
  ]);
}

export async function finalizeBookingPayment({ bookingId, actorUserId = null, forceVerify = false, client }) {
  const booking = await getBookingById(bookingId, client);
  if (!booking) {
    throw httpError(404, "Booking not found.");
  }

  const payment = await getPaymentTransactionByBookingId(bookingId, client);
  if (!payment) {
    throw httpError(404, "Payment transaction not found.");
  }

  if (payment.status === "successful" && booking.payment_status === "paid") {
    return {
      booking: await mapBookingRow(booking),
      payment,
      alreadyProcessed: true,
    };
  }

  if (forceVerify) {
    const verification = await getMobileMoneyService(payment.provider).verifyTransaction({
      providerReference: payment.provider_reference,
      reference: payment.internal_reference,
      amount: payment.gross_amount,
      provider: payment.provider,
    });

    if (!verification.success) {
      throw httpError(402, "Payment has not been completed yet.");
    }

    await client.run(
      `UPDATE payment_transactions
       SET status = 'successful',
           provider_reference = ?,
           metadata = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        verification.providerReference || payment.provider_reference || "",
        JSON.stringify(verification.rawResponse || {}),
        payment.id,
      ]
    );

    await updatePaymentRecord({
      client,
      internalReference: payment.internal_reference,
      providerReference: verification.providerReference || payment.provider_reference || "",
      status: "successful",
      metadata: verification.rawResponse || {},
    });
  }

  const refreshedBooking = await getBookingById(bookingId, client);
  const refreshedPayment = await getPaymentTransactionByBookingId(bookingId, client);
  const canonicalPayment = await getPaymentRecordByBookingId(bookingId, client);
  const barber = await getBarberById(refreshedBooking.barber_id, client);

  await client.run(
    `UPDATE bookings
     SET status = 'confirmed',
         payment_status = 'paid',
         paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [bookingId]
  );

  await creditPendingBarberShare({
    client,
    barberId: refreshedBooking.barber_id,
    bookingId: refreshedBooking.id,
    paymentTransactionId: refreshedPayment.id,
    paymentId: canonicalPayment?.id || null,
    amount: Number(refreshedBooking.barber_amount || 0),
    reference: refreshedPayment.internal_reference,
    providerReference: refreshedPayment.provider_reference || "",
  });

  if (canonicalPayment) {
    await updatePaymentRecord({
      client,
      internalReference: canonicalPayment.internal_reference,
      providerReference: refreshedPayment.provider_reference || canonicalPayment.provider_reference || "",
      status: "successful",
      metadata: {
        source: "finalizeBookingPayment",
        bookingId: refreshedBooking.id,
      },
    });
  }

  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, payment_id, direction, balance_bucket, amount, reference, provider_reference, description, metadata)
     VALUES ('platform', NULL, ?, ?, 'credit', 'commission', ?, ?, ?, ?, ?)`,
    [
      refreshedBooking.id,
      canonicalPayment?.id || null,
      Number(refreshedBooking.commission_amount || 0),
      `${refreshedPayment.internal_reference}-commission`,
      refreshedPayment.provider_reference || "",
      `Platform commission captured for booking #${refreshedBooking.id}`,
      JSON.stringify({ bookingId: refreshedBooking.id }),
    ]
  );

  await client.run(
    `INSERT INTO payment_transactions
     (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, payer_phone, payee_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
     VALUES (?, ?, ?, 'commission', 'platform', ?, '', ?, '', ?, ?, ?, 'UGX', 'successful', ?)` ,
    [
      refreshedBooking.id,
      refreshedBooking.barber_id,
      refreshedBooking.customer_user_id,
      `${refreshedPayment.internal_reference}-commission`,
      refreshedBooking.payment_customer_phone || "",
      Number(refreshedBooking.commission_amount || 0),
      Number(refreshedBooking.commission_amount || 0),
      0,
      JSON.stringify({ source_payment_reference: refreshedPayment.internal_reference }),
    ]
  );

  await client.run(
    `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
     VALUES (?, ?, 'payment_confirmed', ?)`,
    [
      bookingId,
      actorUserId || refreshedBooking.customer_user_id,
      `Payment verified. ${getMobileMoneyProviderLabel(refreshedPayment.provider)} collection succeeded.`,
    ]
  );

  await client.run(
    `INSERT INTO notifications (user_id, title, type, message, read)
     VALUES (?, 'Booking confirmed', 'booking', ?, 0)`,
    [
      refreshedBooking.customer_user_id,
      `Your booking payment was confirmed and the appointment is now secured.`,
    ]
  );

  if (barber?.owner_user_id) {
    await client.run(
      `INSERT INTO notifications (user_id, title, type, message, read)
       VALUES (?, 'New paid booking', 'booking', ?, 0)`,
      [
        barber.owner_user_id,
        `A paid booking was confirmed. UGX ${Number(refreshedBooking.barber_amount || 0).toLocaleString()} has been added to pending wallet balance.`,
      ]
    );
  }

  const updatedBooking = await getBookingById(bookingId, client);
  return {
    booking: await mapBookingRow(updatedBooking),
    payment: refreshedPayment,
    disbursement: null,
    alreadyProcessed: false,
  };
}

/* ================= CREATE BOOKING ================= */

export async function createBooking(req, res, next) {
  try {
    const barberId = toPositiveInteger(req.body.barber_id, "barber_id");
    const serviceId = toPositiveInteger(req.body.service_id, "service_id");
    const rawTeamMemberId = req.body.team_member_id ? toPositiveInteger(req.body.team_member_id, "team_member_id") : null;
    const bookingDate = requireIsoDate(req.body.booking_date, "booking_date");
    const normalizedBookingTime = requireClockTime(
      normalizeTimeInput(req.body.booking_time),
      "booking_time"
    );

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    if (bookingDate < today) {
      return res.status(400).json({
        success: false,
        message: "Cannot book a past date."
      });
    }

    if (bookingDate === today) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const reqMinutes = toMinutes(normalizedBookingTime);

      if (reqMinutes <= nowMinutes) {
        return res.status(400).json({
          success: false,
          message: "Selected time has already passed."
        });
      }
    }

    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);

    const { mappedBooking, payment } = await transaction(async (client) => {
      const barber = await getBarberById(barberId, client);
      if (!barber) {
        throw httpError(404, "Barber not found.");
      }
      // Prevent self-booking: a provider cannot book their own stand
      if (barber.owner_user_id && Number(barber.owner_user_id) === Number(req.user.id)) {
        throw httpError(400, "You cannot book your own stand.");
      }
      if (Number(barber.is_banned || 0) === 1) {
        throw httpError(403, "This business is not available for bookings.");
      }
      if (Number(barber.is_suspended || 0) === 1) {
        throw httpError(403, "This business is currently suspended and cannot accept new bookings.");
      }
      const paymentMethod = normalizePaymentMethod(req.body.payment_method, barber);
      if (paymentMethod === "wallet" && !barber.owner_user_id) {
        throw httpError(400, "This barber cannot receive wallet payments yet.");
      }
      const teamCountRow = await getActiveTeamMemberCount(barberId, client);
      const requiresTeamMember =
        String(barber.stand_type || "individual").toLowerCase() === "shop" &&
        Number(teamCountRow?.count || 0) > 0;
      const teamMember = rawTeamMemberId
        ? await getTeamMemberById(rawTeamMemberId, barberId, client)
        : null;

      if (rawTeamMemberId && !teamMember) {
        throw httpError(400, "Selected barber is not available on this stand.");
      }

      if (requiresTeamMember && !teamMember) {
        throw httpError(400, "Choose a barber from this stand before booking.");
      }

      const service = await getBarberServiceById(serviceId, barberId, client);
      if (!service) {
        throw httpError(404, "Service not found.");
      }
      const servicePricingType = String(service.pricing_type || "fixed").toLowerCase();
      const directBookingPrice =
        servicePricingType === "range" ||
        servicePricingType === "starting_from" ||
        Number(service.price_extra || 0) > 0 ||
        Number(barber.price_from || 0) > 0;
      if (servicePricingType === "quote" || !directBookingPrice) {
        throw httpError(400, "This service requires a quote before booking.");
      }
      const bookingLocationType = String(req.body.booking_location_type || "provider_location").toLowerCase();
      if (!["provider_location", "customer_location"].includes(bookingLocationType)) {
        throw httpError(400, "Choose a valid booking location.");
      }
      const serviceLocationType = String(service.location_type || "provider_location").toLowerCase();
      const supportsCustomerLocation = Number(barber.home_service_enabled || 0) === 1 || serviceLocationType === "customer_location";
      if (bookingLocationType === "customer_location" && !supportsCustomerLocation) {
        throw httpError(400, "This service is only available at the provider location.");
      }
      const bookingAddress =
        bookingLocationType === "customer_location"
          ? String(req.body.booking_address || "").trim().slice(0, 240)
          : barber.location || "";
      if (bookingLocationType === "customer_location" && bookingAddress.length < 3) {
        throw httpError(400, "Customer address is required for home service bookings.");
      }
      const bookingDetailsJson = JSON.stringify(
        req.body.booking_details && typeof req.body.booking_details === "object"
          ? {
              type: String(req.body.booking_details.type || "").slice(0, 40),
              subject: String(req.body.booking_details.subject || "").slice(0, 80),
              studentLevel: String(req.body.booking_details.studentLevel || "").slice(0, 80),
              lessonMode: String(req.body.booking_details.lessonMode || "").slice(0, 80),
              duration: String(req.body.booking_details.duration || "").slice(0, 40),
              notes: String(req.body.booking_details.notes || "").slice(0, 500),
            }
          : {}
      );

      const active = await getActiveBookingsForCustomerWithBarber(req.user.id, barberId, client);
      if (active.length) {
        throw httpError(409, "You already have an active booking with this barber.");
      }

      const recent = await getRecentBookingForCustomerWithBarber(req.user.id, barberId, client);
      if (recent?.created_at) {
        const diff = Date.now() - new Date(recent.created_at).getTime();
        if (diff < 30 * 60 * 1000) {
          throw httpError(429, "Please wait before booking again.");
        }
      }

      const day = getDayOfWeek(bookingDate);
      const schedule = await getBarberScheduleForDay(barberId, day, client);
      const workingWindow = resolveWorkingWindow(barber, schedule);

      if (!isWithinSchedule(workingWindow, normalizedBookingTime, service.duration_minutes)) {
        throw httpError(
          400,
          `Outside working hours. Barber works ${workingWindow?.start || "--:--"} to ${workingWindow?.end || "--:--"}.`
        );
      }

      const existing = await getActiveBookingsForBarberOnDate(barberId, bookingDate, teamMember?.id || null, client);
      if (hasOverlap(existing, normalizedBookingTime, service.duration_minutes)) {
        throw httpError(409, "Time slot already booked.");
      }

      const totalPrice = resolveServiceBookingPrice(barber, service);
      const customerProfile = await getCustomerProfileByUserId(req.user.id, client);
      const paymentPhone = normalizeUgandaPhoneNumber(req.body.payment_phone || customerProfile?.phone || "");
      const requiresMobileMoney = isMobileMoneyPayment(paymentMethod);
      const { commissionAmount, barberAmount } = getBookingPaymentBreakdown(totalPrice, paymentMethod);

      if (requiresMobileMoney && !paymentPhone) {
        throw httpError(400, "Enter a valid Uganda phone number before paying with MTN Mobile Money.");
      }

      if (requiresMobileMoney && idempotencyKey) {
        const duplicate = await client.get(
          `SELECT b.*
           FROM payment_transactions pt
           JOIN bookings b ON b.id = pt.booking_id
           WHERE pt.user_id = ?
             AND pt.idempotency_key = ?
             AND pt.transaction_type = 'booking_payment'
           ORDER BY pt.id DESC
           LIMIT 1`,
          [req.user.id, idempotencyKey]
        );

        if (duplicate) {
          const duplicatePayment = await getPaymentTransactionByBookingId(duplicate.id, client);
          return {
            mappedBooking: await mapBookingRow(duplicate),
            payment: duplicatePayment,
          };
        }
      }

      const result = await client.run(
        `INSERT INTO bookings
         (barber_id, customer_user_id, team_member_id, service_name, booking_date, booking_time, price, service_duration_minutes, status, payment_method, payment_status, paid_at, payment_provider, payment_customer_phone, commission_amount, barber_amount, booking_location_type, booking_address, booking_details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          barberId,
          req.user.id,
          teamMember?.id || null,
          service.service_name,
          bookingDate,
          normalizedBookingTime,
          totalPrice,
          service.duration_minutes,
          requiresMobileMoney ? "payment_pending" : "pending",
          paymentMethod,
          paymentMethod === "wallet" ? "paid" : requiresMobileMoney ? "pending" : "unpaid",
          paymentMethod === "wallet" ? new Date().toISOString() : null,
          requiresMobileMoney ? paymentMethod : "",
          paymentPhone,
          commissionAmount,
          barberAmount,
          bookingLocationType,
          bookingAddress,
          bookingDetailsJson,
        ]
      );

      const createdBooking = await getBookingById(result.lastID, client);
      let payment = null;

      if (paymentMethod === "wallet") {
        const paymentReference = createReference("wallet-booking", createdBooking.id);
        await client.run(
          `UPDATE bookings
           SET payment_reference = ?,
               payment_provider = 'wallet',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [paymentReference, createdBooking.id]
        );
        await client.run(
          `INSERT INTO payment_transactions
           (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
           VALUES (?, ?, ?, 'booking_payment', 'wallet', ?, '', ?, '', ?, ?, ?, 'UGX', 'successful', ?)`,
          [
            createdBooking.id,
            barberId,
            req.user.id,
            paymentReference,
            idempotencyKey,
            totalPrice,
            commissionAmount,
            barberAmount,
            JSON.stringify({ source: "customer_wallet", bookingId: createdBooking.id }),
          ]
        );
        payment = await getPaymentTransactionByBookingId(createdBooking.id, client);
        await createPaymentRecord({
          client,
          bookingId: createdBooking.id,
          barberId,
          userId: req.user.id,
          flowType: "booking",
          provider: "wallet",
          internalReference: paymentReference,
          providerReference: "",
          idempotencyKey,
          grossAmount: totalPrice,
          commissionAmount,
          barberAmount,
          status: "successful",
          metadata: { source: "customer_wallet", bookingId: createdBooking.id },
        });
        await transferWalletPayment({
          fromUserId: req.user.id,
          barberId,
          bookingId: createdBooking.id,
          amount: totalPrice,
          barberAmount,
          paymentTransactionId: payment?.id || null,
          reference: paymentReference,
          client
        });
      }

      if (requiresMobileMoney) {
        const paymentReference = createReference("booking", createdBooking.id);
        const providerResult = await getMobileMoneyService(paymentMethod).initiateCollection({
          provider: paymentMethod,
          amount: totalPrice,
          phoneNumber: paymentPhone,
          reference: paymentReference,
          description: `Booking payment for ${barber.business_name}`,
          callbackUrl: env.mtnCallbackUrl || env.mobileMoneyCallbackUrl || `${env.appPublicUrl}/api/payments/mtn/callback`,
        });
        const paymentStatus = normalizeLifecycleStatus(providerResult.status, "initiated");

        await client.run(
          `UPDATE bookings
           SET payment_reference = ?,
               payment_provider = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [paymentReference, paymentMethod, createdBooking.id]
        );

        await client.run(
          `INSERT INTO payment_transactions
           (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
           VALUES (?, ?, ?, 'booking_payment', ?, ?, ?, ?, ?, ?, ?, ?, 'UGX', ?, ?)`,
          [
            createdBooking.id,
            barberId,
            req.user.id,
            paymentMethod,
            paymentReference,
            providerResult.providerReference || "",
            idempotencyKey,
            paymentPhone,
            totalPrice,
            commissionAmount,
            barberAmount,
            paymentStatus,
            JSON.stringify(providerResult.rawResponse || {}),
          ]
        );

        await createPaymentRecord({
          client,
          bookingId: createdBooking.id,
          barberId,
          userId: req.user.id,
          flowType: "booking",
          provider: paymentMethod,
          internalReference: paymentReference,
          providerReference: providerResult.providerReference || "",
          callbackUrl: env.mtnCallbackUrl || env.mobileMoneyCallbackUrl || `${env.appPublicUrl}/api/payments/mtn/callback`,
          idempotencyKey,
          payerPhone: paymentPhone,
          grossAmount: totalPrice,
          commissionAmount,
          barberAmount,
          status: paymentStatus,
          metadata: providerResult.rawResponse || {},
        });

        payment = await getPaymentTransactionByBookingId(createdBooking.id, client);
      }

      await client.run(
        `INSERT INTO notifications (user_id, title, type, message, read)
         VALUES (?, ?, ?, ?, 0)`,
        [
          barber.owner_user_id,
          requiresMobileMoney ? "Booking awaiting payment" : "New booking",
          "booking",
          requiresMobileMoney
            ? `A customer started payment for ${normalizedBookingTime}. The slot will be confirmed after payment succeeds.`
            : `New booking at ${normalizedBookingTime}`,
        ]
      );

      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, ?, ?)`,
        [createdBooking.id, req.user.id, "created", "Booking created"]
      );

      await client.run(
        `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
        [req.user.id, `Created booking #${createdBooking.id}`]
      );

      return {
        booking: createdBooking,
        mappedBooking: await mapBookingRow(await getBookingById(createdBooking.id, client)),
        payment,
      };
    });

    if (mappedBooking.payment_status === "paid") {
      try {
        await sendBookingConfirmationEmails(mappedBooking);
      } catch {}
    }

    const providerPushResult = await sendNotificationToBusiness(
      barberId,
      mappedBooking.payment_status === "paid" ? "New paid booking" : "New booking request",
      mappedBooking.payment_status === "paid"
        ? `${mappedBooking.customer_full_name || "A customer"} booked ${mappedBooking.service_name} at ${normalizedBookingTime}.`
        : `A new booking request arrived for ${normalizedBookingTime}.`,
      {
        type: "booking",
        bookingId: mappedBooking.id,
        status: mappedBooking.status,
        route: "/bookings",
      },
      { persist: false }
    ).catch(() => {});
    const providerForSms = await getBarberById(barberId).catch(() => null);
    await sendBookingCreatedProviderSmsFallback({
      booking: mappedBooking,
      providerUserId: providerForSms?.owner_user_id,
      pushResult: providerPushResult,
    });

    return res.status(201).json({
      success: true,
      booking: serializeBookingForViewer(mappedBooking, req.user),
      payment: payment && isMobileMoneyPayment(payment.provider)
        ? {
            reference: payment.internal_reference,
            provider: payment.provider,
            status: payment.status,
            gross_amount: Number(payment.gross_amount || 0),
            payer_phone: payment.payer_phone || "",
            instructions: `Approve the ${getMobileMoneyProviderLabel(payment.provider)} prompt on your phone to confirm the booking.`,
          }
        : null,
    });
  } catch (error) {
    if (error?.code === "SQLITE_CONSTRAINT" && String(error.message || "").includes("bookings")) {
      return res.status(409).json({
        success: false,
        message: "Time slot already booked."
      });
    }

    next(error);
  }
}

/* ================= GET MY BOOKINGS ================= */

export async function getMyBookings(req, res, next) {
  try {
    const myBarber = await getMyOwnedBarber(req.user.id);

    let rows = [];

    if (myBarber) {
      rows = await all(
        `SELECT * FROM bookings
         WHERE barber_id = ?
         ORDER BY booking_date DESC, booking_time DESC, id DESC`,
        [myBarber.id]
      );
    } else {
      rows = await all(
        `SELECT * FROM bookings
         WHERE customer_user_id = ?
         ORDER BY booking_date DESC, booking_time DESC, id DESC`,
        [req.user.id]
      );
    }

    const bookings = [];
    for (const row of rows) {
      bookings.push(serializeBookingForViewer(await mapBookingRow(row), req.user));
    }

    return res.status(200).json({
      success: true,
      bookings
    });
  } catch (error) {
    next(error);
  }
}

export async function payBookingWithWallet(req, res, next) {
  try {
    const bookingId = Number(req.params.id || req.body.bookingId || req.body.booking_id);
    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      throw httpError(400, "Booking id is required.");
    }

    const result = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) throw httpError(404, "Booking not found.");
      if (Number(booking.customer_user_id) !== Number(req.user.id)) {
        throw httpError(403, "You can only pay for your own booking.");
      }
      if (String(booking.payment_status || "").toLowerCase() === "paid") {
        return { mappedBooking: await mapBookingRow(booking), alreadyPaid: true };
      }
      if (["cancelled", "rejected", "completed"].includes(String(booking.status || "").toLowerCase())) {
        throw httpError(400, "This booking cannot be paid with wallet.");
      }

      const existingPayment = await getPaymentTransactionByBookingId(bookingId, client);
      if (
        existingPayment?.provider &&
        existingPayment.provider !== "wallet" &&
        ["pending", "initiated", "successful"].includes(String(existingPayment.status || "").toLowerCase())
      ) {
        throw httpError(409, "This booking already has another payment in progress.");
      }

      const amount = Number(booking.price || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw httpError(400, "Booking amount must be greater than 0.");
      }
      const { commissionAmount, barberAmount } = getBookingPaymentBreakdown(amount, "wallet");
      const paymentReference = booking.payment_reference || createReference("wallet-booking", booking.id);

      await client.run(
        `UPDATE bookings
         SET payment_method = 'wallet',
             payment_status = 'paid',
             payment_provider = 'wallet',
             payment_reference = ?,
             paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
             status = CASE WHEN status = 'payment_pending' THEN 'confirmed' ELSE status END,
             commission_amount = ?,
             barber_amount = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [paymentReference, commissionAmount, barberAmount, booking.id]
      );

      let payment = existingPayment;
      if (!payment || payment.provider !== "wallet") {
        await client.run(
          `INSERT INTO payment_transactions
           (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
           VALUES (?, ?, ?, 'booking_payment', 'wallet', ?, '', ?, '', ?, ?, ?, 'UGX', 'successful', ?)`,
          [
            booking.id,
            booking.barber_id,
            req.user.id,
            paymentReference,
            idempotencyKey,
            amount,
            commissionAmount,
            barberAmount,
            JSON.stringify({ source: "customer_wallet_pay_existing", bookingId: booking.id }),
          ]
        );
        payment = await getPaymentTransactionByBookingId(booking.id, client);
      } else {
        await client.run(
          `UPDATE payment_transactions
           SET provider = 'wallet',
               status = 'successful',
               gross_amount = ?,
               commission_amount = ?,
               net_amount = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [amount, commissionAmount, barberAmount, payment.id]
        );
      }

      await createPaymentRecord({
        client,
        bookingId: booking.id,
        barberId: booking.barber_id,
        userId: req.user.id,
        flowType: "booking",
        provider: "wallet",
        internalReference: paymentReference,
        providerReference: "",
        idempotencyKey,
        grossAmount: amount,
        commissionAmount,
        barberAmount,
        status: "successful",
        metadata: { source: "customer_wallet_pay_existing", bookingId: booking.id },
      }).catch(() => null);

      await transferWalletPayment({
        fromUserId: req.user.id,
        barberId: booking.barber_id,
        bookingId: booking.id,
        amount,
        barberAmount,
        paymentTransactionId: payment?.id || null,
        reference: paymentReference,
        client,
      });

      const updated = await getBookingById(booking.id, client);
      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, 'wallet_payment_confirmed', ?)`,
        [booking.id, req.user.id, "Customer paid with wallet"]
      );

      return { mappedBooking: await mapBookingRow(updated), alreadyPaid: false };
    });

    if (!result.alreadyPaid) {
      const customerPushResult = await sendPaymentNotification({
        userId: result.mappedBooking.customerUserId || result.mappedBooking.customer_user_id,
        title: "Payment received",
        body: "Your wallet payment was confirmed and the appointment is now secured.",
        bookingId,
        status: "paid",
        type: "payment",
      }, { persist: false }).catch(() => {});
      await sendPaymentSmsFallback({
        userId: result.mappedBooking.customerUserId || result.mappedBooking.customer_user_id,
        booking: result.mappedBooking,
        status: "paid",
        title: "Payment received",
        body: "Your wallet payment was confirmed and the appointment is now secured.",
        pushResult: customerPushResult,
      });

      const providerPushResult = await sendNotificationToBusiness(
        result.mappedBooking.barberId || result.mappedBooking.barber_id,
        "New paid booking",
        "A wallet booking was paid and added to your pending wallet balance.",
        {
          type: "booking",
          bookingId: result.mappedBooking.id,
          status: "paid",
          route: "/bookings",
        },
        { persist: false }
      ).catch(() => {});
      const providerForSms = await getBarberById(result.mappedBooking.barberId || result.mappedBooking.barber_id).catch(() => null);
      await sendPaidBookingProviderSmsFallback({
        booking: result.mappedBooking,
        providerUserId: providerForSms?.owner_user_id,
        pushResult: providerPushResult,
      });
    }

    res.status(200).json({
      success: true,
      already_paid: Boolean(result.alreadyPaid),
      booking: serializeBookingForViewer(result.mappedBooking, req.user),
      message: result.alreadyPaid ? "Booking is already paid." : "Booking paid with wallet.",
    });
  } catch (error) {
    next(error);
  }
}

/* ================= GET BARBER DAY AVAILABILITY ================= */

export async function getBarberDayAvailability(req, res, next) {
  try {
    const { barber_id, booking_date, team_member_id } = req.query;

    if (!barber_id || !booking_date) {
      return res.status(400).json({
        success: false,
        message: "barber_id and booking_date are required."
      });
    }

    const barber = await getBarberById(barber_id);
    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Barber not found."
      });
    }

    const normalizedTeamMemberId = team_member_id ? toPositiveInteger(team_member_id, "team_member_id") : null;
    if (normalizedTeamMemberId) {
      const teamMember = await getTeamMemberById(normalizedTeamMemberId, barber_id);
      if (!teamMember) {
        return res.status(400).json({
          success: false,
          message: "Selected barber is not available on this stand."
        });
      }
    }

    const day = getDayOfWeek(booking_date);
    const schedule = await getBarberScheduleForDay(barber_id, day);
    const workingWindow = resolveWorkingWindow(barber, schedule);
    const bookings = await getAvailabilityBookingsForBarberOnDate(barber_id, booking_date, normalizedTeamMemberId);

    return res.status(200).json({
      success: true,
      availability: {
        barber_id: Number(barber_id),
        booking_date,
        workingWindow,
        bookings: bookings.map((item) => ({
          id: item.id,
          booking_time: normalizeTimeInput(item.booking_time),
          service_duration_minutes: Number(item.service_duration_minutes || 30),
          status: item.status,
          team_member_id: item.team_member_id || null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ================= UPDATE BOOKING STATUS ================= */

export async function rescheduleBooking(req, res, next) {
  try {
    const bookingId = toPositiveInteger(req.params.id, "booking_id");
    const bookingDate = requireIsoDate(req.body.booking_date || req.body.date, "booking_date");
    const bookingTime = requireClockTime(
      normalizeTimeInput(req.body.booking_time || req.body.time),
      "booking_time"
    );
    const today = new Date().toISOString().split("T")[0];
    if (bookingDate < today) throw httpError(400, "Cannot reschedule to a past date.");
    if (bookingDate === today) {
      const now = new Date();
      if (toMinutes(bookingTime) <= now.getHours() * 60 + now.getMinutes()) {
        throw httpError(400, "Selected time has already passed.");
      }
    }

    const { original, mappedBooking, isBarberOwner } = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) throw httpError(404, "Booking not found.");

      const myBarber = await getMyOwnedBarber(req.user.id, client);
      const ownsStand = myBarber && Number(myBarber.id) === Number(booking.barber_id);
      const ownsBooking = Number(booking.customer_user_id) === Number(req.user.id);
      if (!ownsStand && !ownsBooking) throw httpError(403, "Not allowed to reschedule this booking.");
      if (!["pending", "confirmed"].includes(String(booking.status || "").toLowerCase())) {
        throw httpError(400, "Only pending or confirmed bookings can be rescheduled.");
      }

      const barber = await getBarberById(booking.barber_id, client);
      if (!barber || Number(barber.is_suspended || 0) === 1 || Number(barber.is_banned || 0) === 1) {
        throw httpError(403, "This business is not available for rescheduling.");
      }
      if (booking.team_member_id) {
        const teamMember = await getTeamMemberById(booking.team_member_id, booking.barber_id, client);
        if (!teamMember) throw httpError(400, "Selected provider is no longer available on this stand.");
      }

      const durationMinutes = Number(booking.service_duration_minutes || 30);
      const schedule = await getBarberScheduleForDay(booking.barber_id, getDayOfWeek(bookingDate), client);
      const workingWindow = resolveWorkingWindow(barber, schedule);
      if (!isWithinSchedule(workingWindow, bookingTime, durationMinutes)) {
        throw httpError(
          400,
          `Outside working hours. Barber works ${workingWindow?.start || "--:--"} to ${workingWindow?.end || "--:--"}.`
        );
      }

      const existing = await getActiveBookingsForBarberOnDate(
        booking.barber_id,
        bookingDate,
        booking.team_member_id || null,
        client
      );
      const conflicts = existing.filter((item) => Number(item.id) !== Number(bookingId));
      if (hasOverlap(conflicts, bookingTime, durationMinutes)) {
        throw httpError(409, "Time slot already booked.");
      }

      await client.run(
        `UPDATE bookings
         SET booking_date = ?, booking_time = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bookingDate, bookingTime, bookingId]
      );
      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, 'rescheduled', ?)`,
        [bookingId, req.user.id, `Rescheduled from ${booking.booking_date} ${booking.booking_time} to ${bookingDate} ${bookingTime}`]
      );

      const updated = await getBookingById(bookingId, client);
      return {
        original: booking,
        mappedBooking: await mapBookingRow(updated),
        isBarberOwner: Boolean(ownsStand),
      };
    });

    const barber = isBarberOwner ? null : await getBarberById(original.barber_id);
    const recipientUserId = isBarberOwner ? original.customer_user_id : barber?.owner_user_id || null;
    if (recipientUserId) {
      const body = `Booking moved to ${mappedBooking.booking_date} at ${mappedBooking.booking_time}. Please confirm the new time.`;
      await addNotification(recipientUserId, {
        title: "Booking rescheduled",
        type: "booking",
        message: body,
      }).catch(() => {});
      await sendBookingNotification({
        booking: mappedBooking,
        recipientUserId,
        title: "Booking rescheduled",
        body,
        status: "pending",
      }, { persist: false }).catch(() => {});
    }

    await logAudit(req.user.id, `Rescheduled booking #${bookingId} to ${mappedBooking.booking_date} ${mappedBooking.booking_time}`);
    return res.status(200).json({ success: true, booking: mappedBooking });
  } catch (error) {
    next(error);
  }
}

/* ================= UPDATE BOOKING STATUS ================= */

export async function updateBookingStatus(req, res, next) {
  try {
    const bookingId = req.params.id;
    const status = String(req.body.status || "").toLowerCase();
    const liveStatusInput = req.body.live_status || req.body.liveStatus || "";
    const hasLiveStatus = Boolean(String(liveStatusInput || "").trim());
    const delayMinutes = normalizeDelayMinutes(req.body.delay_minutes ?? req.body.delayMinutes ?? req.body.delay ?? 0);
    const idempotencyKey = String(req.body.idempotency_key || req.body.idempotencyKey || req.get("Idempotency-Key") || "")
      .trim()
      .slice(0, 120);

    const allowed = ["pending", "confirmed", "completed", "cancelled", "rejected", "no_show"];
    if (!hasLiveStatus && !allowed.includes(String(status))) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking status."
      });
    }

    const { booking, mappedBooking, refunded, releasedToAvailable, liveUpdate, duplicate } = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      const myBarber = await getMyOwnedBarber(req.user.id, client);
      const isBarberOwner = myBarber && Number(myBarber.id) === Number(booking.barber_id);
      const isCustomer = Number(booking.customer_user_id) === Number(req.user.id);

      if (!isBarberOwner && !isCustomer) {
        throw httpError(403, "Not allowed to update this booking.");
      }

      if (hasLiveStatus) {
        if (!isBarberOwner) {
          throw httpError(403, "Only the provider can update live appointment status.");
        }

        const transition = getLiveStatusTransition({ booking, liveStatus: liveStatusInput });
        if (!transition.ok) throw httpError(400, transition.message);
        const effectiveDelayMinutes = transition.liveStatus === "running_late" ? delayMinutes : 0;

        if (
          normalizeLiveBookingStatus(booking.live_status || "") === transition.liveStatus &&
          normalizeDelayMinutes(booking.delay_minutes) === effectiveDelayMinutes
        ) {
          return {
            booking,
            mappedBooking: await mapBookingRow(booking),
            refunded: false,
            releasedToAvailable: false,
            liveUpdate: transition,
            duplicate: true,
          };
        }

        if (idempotencyKey) {
          const existingEvent = await client.get(
            `SELECT id, event_note FROM booking_events
             WHERE booking_id = ? AND idempotency_key = ?
             LIMIT 1`,
            [bookingId, idempotencyKey]
          ).catch(() => null);
          if (existingEvent) {
            const previousNote = safeJson(existingEvent.event_note);
            if (
              normalizeLiveBookingStatus(previousNote.live_status || "") !== transition.liveStatus ||
              normalizeDelayMinutes(previousNote.delay_minutes) !== effectiveDelayMinutes
            ) {
              throw httpError(409, "This idempotency key was already used for a different live status update.");
            }
            const currentBooking = await getBookingById(bookingId, client);
            return {
              booking,
              mappedBooking: await mapBookingRow(currentBooking),
              refunded: false,
              releasedToAvailable: false,
              liveUpdate: transition,
              duplicate: true,
            };
          }
        }

        const estimatedStartTime = addMinutesToTime(booking.booking_time, effectiveDelayMinutes);
        let refunded = false;
        let releasedToAvailable = false;
        if (
          transition.lifecycleStatus === "cancelled" &&
          booking.payment_method === "wallet" &&
          booking.payment_status === "paid"
        ) {
          refunded = await refundWalletPayment({
            fromUserId: booking.customer_user_id,
            barberId: booking.barber_id,
            bookingId: booking.id,
            amount: Number(booking.price || 0),
            client,
          });
        }

        if (
          transition.lifecycleStatus === "cancelled" &&
          ["mtn_mobile_money", "airtel_money"].includes(String(booking.payment_method || "")) &&
          booking.payment_status === "paid" &&
          booking.status !== "completed"
        ) {
          await reversePendingBarberShare({
            client,
            barberId: booking.barber_id,
            bookingId: booking.id,
            amount: Number(booking.barber_amount || 0),
            reference: booking.payment_reference || `booking-${booking.id}-cancelled`,
          }).catch(() => false);
        }

        if (
          transition.lifecycleStatus === "completed" &&
          ["mtn_mobile_money", "airtel_money", "wallet"].includes(String(booking.payment_method || "")) &&
          booking.payment_status === "paid" &&
          booking.status !== "completed"
        ) {
          releasedToAvailable = await settlePendingBarberShare({
            client,
            barberId: booking.barber_id,
            bookingId: booking.id,
            amount: Number(booking.barber_amount || 0),
            reference: booking.payment_reference || `booking-${booking.id}-completed`,
          });
        }

        const nowColumn = transition.liveStatus === "ready"
          ? ", provider_ready_at = COALESCE(provider_ready_at, CURRENT_TIMESTAMP)"
          : transition.liveStatus === "service_started"
          ? ", service_started_at = COALESCE(service_started_at, CURRENT_TIMESTAMP)"
          : transition.liveStatus === "service_completed"
          ? ", service_completed_at = COALESCE(service_completed_at, CURRENT_TIMESTAMP)"
          : "";

        await client.run(
          `UPDATE bookings
           SET status = ?,
               live_status = ?,
               delay_minutes = ?,
               estimated_start_time = ?,
               payment_status = CASE
                 WHEN ? = 1 THEN 'refunded'
                 ELSE payment_status
               END,
               live_status_updated_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
               ${nowColumn}
           WHERE id = ?`,
          [transition.lifecycleStatus, transition.liveStatus, effectiveDelayMinutes, estimatedStartTime, refunded ? 1 : 0, bookingId]
        );

        await client.run(
          `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note, idempotency_key)
           VALUES (?, ?, 'live_status_changed', ?, ?)`,
          [
            bookingId,
            req.user.id,
            JSON.stringify({
              live_status: transition.liveStatus,
              label: transition.label,
              delay_minutes: effectiveDelayMinutes,
              estimated_start_time: estimatedStartTime,
              previous_live_status: normalizeLiveBookingStatus(booking.live_status || ""),
              previous_status: booking.status,
              status: transition.lifecycleStatus,
            }),
            idempotencyKey,
          ]
        );

        const updated = await getBookingById(bookingId, client);
        return {
          booking,
          mappedBooking: await mapBookingRow(updated),
          refunded,
          releasedToAvailable,
          liveUpdate: transition,
          duplicate: false,
        };
      }

      if (!canTransitionBooking({ booking, status, isBarberOwner, isCustomer })) {
        throw httpError(400, "This booking cannot move to that status.");
      }

      let refunded = false;
      let releasedToAvailable = false;
      if (
        ["cancelled", "rejected"].includes(status) &&
        booking.payment_method === "wallet" &&
        booking.payment_status === "paid"
      ) {
        refunded = await refundWalletPayment({
          fromUserId: booking.customer_user_id,
          barberId: booking.barber_id,
          bookingId: booking.id,
          amount: Number(booking.price || 0),
          client,
        });
      }

      if (
        ["cancelled", "rejected"].includes(status) &&
        ["mtn_mobile_money", "airtel_money"].includes(String(booking.payment_method || "")) &&
        booking.payment_status === "paid" &&
        booking.status !== "completed"
      ) {
        await reversePendingBarberShare({
          client,
          barberId: booking.barber_id,
          bookingId: booking.id,
          amount: Number(booking.barber_amount || 0),
          reference: booking.payment_reference || `booking-${booking.id}-cancelled`,
        }).catch(() => false);
      }

      if (
        status === "completed" &&
        ["mtn_mobile_money", "airtel_money", "wallet"].includes(String(booking.payment_method || "")) &&
        booking.payment_status === "paid" &&
        booking.status !== "completed"
      ) {
        releasedToAvailable = await settlePendingBarberShare({
          client,
          barberId: booking.barber_id,
          bookingId: booking.id,
          amount: Number(booking.barber_amount || 0),
          reference: booking.payment_reference || `booking-${booking.id}-completed`,
        });
      }

      await client.run(
        `UPDATE bookings
         SET status = ?,
             payment_status = CASE
               WHEN ? = 1 THEN 'refunded'
               ELSE payment_status
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, refunded ? 1 : 0, bookingId]
      );

      const updated = await getBookingById(bookingId, client);
      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, ?, ?)`,
        [
          bookingId,
          req.user.id,
          refunded ? "wallet_refunded" : "status_changed",
          refunded ? `Changed to ${status} and refunded wallet payment` : `Changed to ${status}`,
        ]
      );

      return {
        booking,
        mappedBooking: await mapBookingRow(updated),
        refunded,
        releasedToAvailable,
        liveUpdate: null,
        duplicate: false,
      };
    });

    const myBarber = await getMyOwnedBarber(req.user.id);
    const isBarberOwner = myBarber && Number(myBarber.id) === Number(booking.barber_id);
    const barberForNotify = isBarberOwner ? null : await getBarberById(booking.barber_id);
    const notifyUserId = isBarberOwner ? booking.customer_user_id : barberForNotify?.owner_user_id || null;
    if (notifyUserId && !duplicate) {
      if (shouldNotifyLiveStatusChange(liveUpdate, mappedBooking)) {
        const title = liveUpdate.liveStatus === "ready"
          ? "Provider ready"
          : liveUpdate.liveStatus === "running_late"
          ? "Provider running late"
          : liveUpdate.liveStatus === "no_show"
          ? "Booking marked as missed"
          : liveUpdate.liveStatus === "booking_cancelled"
          ? "Booking cancelled"
          : "Booking updated";
        const body = liveUpdate.liveStatus === "ready"
          ? "Your provider is ready for you."
          : liveUpdate.liveStatus === "running_late"
          ? `The provider is running approximately ${mappedBooking.delay_minutes || 0} minutes late.`
          : liveUpdate.liveStatus === "no_show"
          ? "This booking was marked as customer did not arrive."
          : liveUpdate.liveStatus === "booking_cancelled"
          ? "This booking was cancelled by the provider."
          : `Booking status changed to ${liveUpdate.label}.`;
        await sendBookingNotification({
          booking: mappedBooking,
          recipientUserId: notifyUserId,
          title,
          body,
          status: liveUpdate.liveStatus,
        }).catch(() => {});
      } else if (!liveUpdate) {
      await addNotification(notifyUserId, {
        title: "Booking updated",
        type: "booking",
        message: refunded
          ? `Booking status changed to ${status}. Wallet payment was refunded.`
          : releasedToAvailable
          ? `Booking completed. Barber earnings are now available for withdrawal.`
          : `Booking status changed to ${status}`
      }).catch(() => {});

      const pushResult = await sendBookingNotification({
        booking: mappedBooking,
        recipientUserId: notifyUserId,
        title:
          status === "confirmed"
            ? "Booking accepted"
            : ["cancelled", "rejected"].includes(status)
            ? "Booking status changed"
            : "Booking updated",
        body: refunded
          ? `Booking status changed to ${status}. Wallet payment was refunded.`
          : releasedToAvailable
          ? "Booking completed. Earnings are now available for withdrawal."
          : status === "confirmed"
          ? "Your booking has been accepted and confirmed."
          : `Booking status changed to ${status}.`,
        status,
      }, { persist: false }).catch(() => {});
      if (isBarberOwner) {
        await sendBookingStatusCustomerSmsFallback({
          booking: mappedBooking,
          status,
          refunded,
          pushResult,
        });
      }
      }
    }

    await logAudit(req.user.id, hasLiveStatus
      ? `Updated booking #${bookingId} live status to ${mappedBooking.live_status}${duplicate ? " (duplicate ignored)" : ""}`
      : `Updated booking #${bookingId} to ${status}`);

    return res.status(200).json({
      success: true,
      duplicate,
      booking: serializeBookingForViewer(mappedBooking, req.user)
    });
  } catch (error) {
    next(error);
  }
}

/* ================= CONFIRM CASH PAYMENT ================= */

export async function confirmCashPayment(req, res, next) {
  try {
    const bookingId = toPositiveInteger(req.params.id, "booking_id");

    const { mappedBooking } = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      const myBarber = await getMyOwnedBarber(req.user.id, client);
      const isBarberOwner = myBarber && Number(myBarber.id) === Number(booking.barber_id);
      if (!isBarberOwner) {
        throw httpError(403, "Only the barber can confirm cash payment.");
      }

      if (booking.payment_method !== "cash") {
        throw httpError(400, "Only cash bookings can be manually confirmed.");
      }

      if (booking.payment_status === "paid") {
        return {
          mappedBooking: await mapBookingRow(booking)
        };
      }

      await client.run(
        `UPDATE bookings
         SET payment_status = 'paid',
             paid_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bookingId]
      );

      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, 'cash_payment_confirmed', 'Cash payment confirmed by barber')`,
        [bookingId, req.user.id]
      );

      await client.run(
        `INSERT INTO notifications (user_id, title, type, message, read)
         VALUES (?, ?, ?, ?, 0)`,
        [booking.customer_user_id, "Payment confirmed", "booking", "Your cash payment was confirmed."]
      );

      const updated = await getBookingById(bookingId, client);
      return {
        mappedBooking: await mapBookingRow(updated)
      };
    });

    await logAudit(req.user.id, `Confirmed cash payment for booking #${bookingId}`);

    const pushResult = await sendPaymentNotification({
      userId: mappedBooking.customerUserId || mappedBooking.customer_user_id,
      title: "Payment confirmed",
      body: "Your cash payment was confirmed.",
      bookingId,
      status: "paid",
      type: "payment",
    }, { persist: false }).catch(() => {});
    await sendPaymentSmsFallback({
      userId: mappedBooking.customerUserId || mappedBooking.customer_user_id,
      booking: mappedBooking,
      status: "paid",
      title: "Payment confirmed",
      body: "Your cash payment was confirmed.",
      pushResult,
    });

    res.status(200).json({
      success: true,
      message: "Cash payment confirmed.",
      booking: serializeBookingForViewer(mappedBooking, req.user)
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyBookingPayment(req, res, next) {
  try {
    const bookingId = toPositiveInteger(req.params.id, "booking_id");

    const result = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      if (Number(booking.customer_user_id) !== Number(req.user.id)) {
        throw httpError(403, "Only the customer can verify this payment.");
      }

      if (!["mtn_mobile_money", "airtel_money"].includes(String(booking.payment_method || ""))) {
        throw httpError(400, "This booking does not use mobile money.");
      }

      return finalizeBookingPayment({
        bookingId,
        actorUserId: req.user.id,
        forceVerify: true,
        client,
      });
    });

    try {
      await sendBookingConfirmationEmails(result.booking);
    } catch {}

    const customerPushResult = await sendBookingNotification({
      booking: result.booking,
      recipientUserId: result.booking.customerUserId || result.booking.customer_user_id,
      title: "Payment received",
      body: "Your booking payment was confirmed and the appointment is now secured.",
      status: "paid",
    }, { persist: false }).catch(() => {});
    await sendPaymentSmsFallback({
      userId: result.booking.customerUserId || result.booking.customer_user_id,
      booking: result.booking,
      paymentId: result.payment?.id,
      status: "paid",
      title: "Payment received",
      body: "Your booking payment was confirmed and the appointment is now secured.",
      pushResult: customerPushResult,
    });

    const providerPushResult = await sendNotificationToBusiness(
      result.booking.barberId || result.booking.barber_id,
      "New paid booking",
      "A paid booking was confirmed and added to your pending wallet balance.",
      {
        type: "booking",
        bookingId: result.booking.id,
        status: "paid",
        route: "/bookings",
      },
      { persist: false }
    ).catch(() => {});
    const providerForSms = await getBarberById(result.booking.barberId || result.booking.barber_id).catch(() => null);
    await sendPaidBookingProviderSmsFallback({
      booking: result.booking,
      providerUserId: providerForSms?.owner_user_id,
      paymentId: result.payment?.id,
      pushResult: providerPushResult,
    });

    res.status(200).json({
      success: true,
      message: result.alreadyProcessed ? "Payment was already confirmed." : "Payment confirmed and booking secured.",
      booking: serializeBookingForViewer(result.booking, req.user),
      disbursement: result.disbursement || null,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleBookingPaymentWebhook(req, res, next) {
  try {
    const bearerToken = String(req.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const providedToken = String(
      req.get("x-webhook-token") ||
      req.get("x-callback-token") ||
      bearerToken ||
      req.body.token ||
      req.query.token ||
      ""
    ).trim();
    if (env.mobileMoneyWebhookToken && providedToken !== env.mobileMoneyWebhookToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook token.",
      });
    }

    const reference = String(
      req.body.reference ||
      req.body.payment_reference ||
      req.body.externalId ||
      req.query.reference ||
      ""
    ).trim();
    const providerReference = String(
      req.body.provider_reference ||
      req.body.providerReference ||
      req.body.referenceId ||
      req.get("x-reference-id") ||
      req.query.provider_reference ||
      ""
    ).trim();
    const status = String(req.body.status || req.body.financialTransactionStatus || req.query.status || "pending").trim().toLowerCase();
    const provider = String(req.body.provider || req.query.provider || "").trim().toLowerCase() || "unknown";
    const payload = req.body || req.query || {};

    if (!reference && !providerReference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    const result = await transaction(async (client) => {
      const webhookEvent = await recordWebhookEvent({
        client,
        provider,
        reference,
        providerReference,
        signature: String(req.get("x-signature") || ""),
        payload,
        processingStatus: "received",
      });

      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE transaction_type = 'booking_payment'
           AND (internal_reference = ? OR provider_reference = ?)
         ORDER BY id DESC
         LIMIT 1`,
        [reference, providerReference]
      );

      if (!payment) {
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "ignored",
        });
        return { unknown: true };
      }

      const booking = await getBookingById(payment.booking_id, client);
      const paymentAlreadySuccessful = String(payment.status || "").toLowerCase() === "successful";
      const bookingAlreadyPaid = String(booking?.payment_status || "").toLowerCase() === "paid";
      const callbackSuccessful = isSuccessfulPaymentStatus(status);

      if (bookingAlreadyPaid || (paymentAlreadySuccessful && !callbackSuccessful)) {
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "duplicate",
        });
        return {
          duplicate: true,
          booking: await mapBookingRow(booking),
        };
      }

      if (isFailedPaymentStatus(status)) {
        const verifiedFailure = await verifyProviderCallbackStatus({
          payment,
          providerReference,
          reference,
          expected: "failed",
        }).catch(() => ({ accepted: false }));

        if (!verifiedFailure.accepted) {
          await markWebhookEventProcessed({
            client,
            eventId: webhookEvent.id,
            processingStatus: "unverified_terminal_callback",
          });
          return {
            pending: true,
            booking: await mapBookingRow(booking),
            paymentId: payment.id,
          };
        }

        await client.run(
          `UPDATE payment_transactions
           SET status = 'failed',
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [verifiedFailure.providerReference || providerReference, JSON.stringify({ ...payload, verification: verifiedFailure.rawResponse }), payment.id]
        );
        await client.run(
          `UPDATE bookings
           SET payment_status = 'failed',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payment.booking_id]
        );
        await updatePaymentRecord({
          client,
          internalReference: payment.internal_reference,
          providerReference: verifiedFailure.providerReference || providerReference,
          status: "failed",
          metadata: { ...payload, verification: verifiedFailure.rawResponse },
        });
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "processed_failed",
        });
        return {
          failed: true,
          booking: await mapBookingRow(await getBookingById(payment.booking_id, client)),
          paymentId: payment.id,
        };
      }

      if (!isSuccessfulPaymentStatus(status)) {
        await client.run(
          `UPDATE payment_transactions
           SET status = 'pending',
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            providerReference,
            JSON.stringify(payload),
            payment.id,
          ]
        );

        await client.run(
          `UPDATE bookings
           SET payment_status = 'pending',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payment.booking_id]
        );

        await updatePaymentRecord({
          client,
          internalReference: payment.internal_reference,
          providerReference,
          status: "pending",
          metadata: payload,
        });
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "processed_pending",
        });
        return {
          pending: true,
          booking: await mapBookingRow(await getBookingById(payment.booking_id, client)),
          paymentId: payment.id,
        };
      }

      const verifiedSuccess = await verifyProviderCallbackStatus({
        payment,
        providerReference,
        reference,
        expected: "successful",
      }).catch(() => ({ accepted: false }));

      if (!verifiedSuccess.accepted) {
        await client.run(
          `UPDATE payment_transactions
           SET status = 'pending',
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            providerReference,
            JSON.stringify({ ...payload, verification: { accepted: false } }),
            payment.id,
          ]
        );
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "unverified_success_callback",
        });
        return {
          pending: true,
          booking: await mapBookingRow(await getBookingById(payment.booking_id, client)),
          paymentId: payment.id,
        };
      }

      await client.run(
        `UPDATE payment_transactions
         SET status = 'successful',
             provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
             metadata = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          verifiedSuccess.providerReference || providerReference,
          JSON.stringify({ ...payload, verification: verifiedSuccess.rawResponse }),
          payment.id,
        ]
      );

      await updatePaymentRecord({
        client,
        internalReference: payment.internal_reference,
        providerReference: verifiedSuccess.providerReference || providerReference,
        status: "successful",
        metadata: { ...payload, verification: verifiedSuccess.rawResponse },
      });

      await markWebhookEventProcessed({
        client,
        eventId: webhookEvent.id,
        processingStatus: "processed_successful",
      });

      return finalizeBookingPayment({
        bookingId: payment.booking_id,
        actorUserId: null,
        forceVerify: false,
        client,
      });
    });

    if (result?.booking && !result?.duplicate) {
      try {
        await sendBookingConfirmationEmails(result.booking);
      } catch {}
    }

    if (result?.failed && result?.booking) {
      const pushResult = await sendPaymentNotification({
        userId: result.booking.customerUserId || result.booking.customer_user_id,
        title: "Payment failed",
        body: "Your booking payment failed. Please try again or choose another payment method.",
        paymentId: result.paymentId,
        bookingId: result.booking.id,
        status: "failed",
      }).catch(() => {});
      await sendPaymentSmsFallback({
        userId: result.booking.customerUserId || result.booking.customer_user_id,
        booking: result.booking,
        paymentId: result.paymentId,
        status: "failed",
        title: "Payment failed",
        body: "Your booking payment failed. Please try again or choose another payment method.",
        pushResult,
      });
    } else if (result?.pending && result?.booking) {
      await sendPaymentNotification({
        userId: result.booking.customerUserId || result.booking.customer_user_id,
        title: "Payment pending",
        body: "Your booking payment is still pending. Please approve the mobile money prompt.",
        paymentId: result.paymentId,
        bookingId: result.booking.id,
        status: "pending",
      }).catch(() => {});
    } else if (result?.booking && !result?.duplicate) {
      const customerPushResult = await sendPaymentNotification({
        userId: result.booking.customerUserId || result.booking.customer_user_id,
        title: "Payment received",
        body: "Your booking payment was confirmed and the appointment is now secured.",
        bookingId: result.booking.id,
        status: "paid",
      }, { persist: false }).catch(() => {});
      await sendPaymentSmsFallback({
        userId: result.booking.customerUserId || result.booking.customer_user_id,
        booking: result.booking,
        status: "paid",
        title: "Payment received",
        body: "Your booking payment was confirmed and the appointment is now secured.",
        pushResult: customerPushResult,
      });
      const providerPushResult = await sendNotificationToBusiness(
        result.booking.barberId || result.booking.barber_id,
        "New paid booking",
        "A paid booking was confirmed and added to your pending wallet balance.",
        {
          type: "booking",
          bookingId: result.booking.id,
          status: "paid",
          route: "/bookings",
        },
        { persist: false }
      ).catch(() => {});
      const providerForSms = await getBarberById(result.booking.barberId || result.booking.barber_id).catch(() => null);
      await sendPaidBookingProviderSmsFallback({
        booking: result.booking,
        providerUserId: providerForSms?.owner_user_id,
        pushResult: providerPushResult,
      });
    }

    res.status(200).json({
      success: true,
      message: result?.failed
        ? "Webhook recorded failed payment."
        : result?.pending
        ? "Webhook recorded pending payment."
        : result?.duplicate
        ? "Duplicate webhook already processed."
        : result?.unknown
        ? "Webhook ignored because the payment reference was not found."
        : "Webhook processed.",
    });
  } catch (error) {
    next(error);
  }
}
