import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { getSmsConfig, normalizePhoneNumber, sendLoggedSms } from "./smsService.js";
import { get } from "../db/query.js";

function compact(value, maxLength = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `UGX ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function hasPushDelivery(pushResult) {
  if (Array.isArray(pushResult)) {
    return pushResult.some(hasPushDelivery);
  }
  return Number(pushResult?.sent || 0) > 0;
}

async function getUserPhone(userId) {
  if (!userId) return "";
  const profile = await get(
    `SELECT phone, normalized_phone FROM profiles WHERE user_id = ? LIMIT 1`,
    [userId]
  ).catch(() => null);
  return normalizePhoneNumber(profile?.normalized_phone || profile?.phone || "");
}

async function resolveProviderUserId(userId, businessId) {
  if (userId) return userId;
  if (!businessId) return null;
  const barber = await get(`SELECT owner_user_id FROM barbers WHERE id = ? LIMIT 1`, [businessId]).catch(() => null);
  return barber?.owner_user_id || null;
}

function shouldSendFallback(pushResult) {
  const config = getSmsConfig();
  return Boolean(env.africasTalkingLifecycleSmsEnabled && config.enabled && !hasPushDelivery(pushResult));
}

async function sendLifecycleFallback({
  userId,
  businessId = null,
  bookingId = null,
  paymentId = null,
  subscriptionId = null,
  eventKey,
  message,
  metadata = {},
  pushResult = null,
}) {
  if (!shouldSendFallback(pushResult)) {
    return { skipped: true, reason: hasPushDelivery(pushResult) ? "push_delivered" : "sms_disabled" };
  }

  const resolvedUserId = await resolveProviderUserId(userId, businessId);
  const phone = await getUserPhone(resolvedUserId);
  if (!phone) {
    return { skipped: true, reason: "missing_phone" };
  }

  const body = compact(message);
  if (!body) return { skipped: true, reason: "empty_message" };

  const dedupeKey = `lifecycle:${eventKey}`;
  try {
    return await sendLoggedSms({
      to: phone,
      message: body,
      userId: resolvedUserId,
      businessId,
      bookingId,
      paymentId,
      subscriptionId,
      dedupeKey,
      metadata: {
        ...metadata,
        source: "lifecycle_sms_fallback",
        eventKey,
      },
    });
  } catch (error) {
    logger.warn({ err: error, userId, eventKey }, "Lifecycle SMS fallback failed");
    return { skipped: false, failed: true, error: error.message || "SMS failed" };
  }
}

export async function sendBookingCreatedProviderSmsFallback({ booking, providerUserId, pushResult }) {
  return sendLifecycleFallback({
    userId: providerUserId,
    businessId: booking?.barber_id || booking?.barberId || null,
    bookingId: booking?.id || null,
    eventKey: `booking:${booking?.id}:provider_created`,
    message: `Queless: New booking request from ${booking?.customer_full_name || booking?.customer_username || "a customer"} for ${booking?.service_name || "a service"} on ${booking?.booking_date || "the selected date"} at ${booking?.booking_time || "the selected time"}. Open Queless to accept or reject.`,
    metadata: { channel: "booking", event: "provider_created" },
    pushResult,
  });
}

export async function sendBookingStatusCustomerSmsFallback({ booking, status, pushResult, refunded = false }) {
  const normalizedStatus = String(status || booking?.status || "").toLowerCase();
  const accepted = normalizedStatus === "confirmed";
  const rejected = normalizedStatus === "rejected";
  const cancelled = normalizedStatus === "cancelled";
  const completed = normalizedStatus === "completed";
  const message = accepted
    ? `Queless: Your booking for ${booking?.service_name || "your service"} on ${booking?.booking_date || "the selected date"} at ${booking?.booking_time || "the selected time"} was accepted.`
    : rejected
    ? `Queless: Your booking for ${booking?.service_name || "your service"} was rejected.${refunded ? " Any wallet payment was refunded." : ""}`
    : cancelled
    ? `Queless: Your booking for ${booking?.service_name || "your service"} was cancelled.${refunded ? " Any wallet payment was refunded." : ""}`
    : completed
    ? `Queless: Your booking for ${booking?.service_name || "your service"} was completed. Thank you.`
    : `Queless: Your booking status changed to ${normalizedStatus || "updated"}.${refunded ? " Any wallet payment was refunded." : ""}`;

  return sendLifecycleFallback({
    userId: booking?.customer_user_id || booking?.customerUserId,
    businessId: booking?.barber_id || booking?.barberId || null,
    bookingId: booking?.id || null,
    eventKey: `booking:${booking?.id}:customer_status:${normalizedStatus}`,
    message,
    metadata: { channel: "booking", event: "customer_status", status: normalizedStatus },
    pushResult,
  });
}

export async function sendPaymentSmsFallback({ userId, booking = null, paymentId = null, status, title, body, pushResult, type = "payment" }) {
  return sendLifecycleFallback({
    userId,
    businessId: booking?.barber_id || booking?.barberId || null,
    bookingId: booking?.id || null,
    paymentId,
    eventKey: `${type}:${paymentId || booking?.id || userId}:${status}`,
    message: `Queless: ${body || title || `Payment ${status}`}`,
    metadata: { channel: type, event: "payment_status", status },
    pushResult,
  });
}

export async function sendBusinessPaymentSmsFallback({ businessId, paymentId = null, status, title, body, pushResult, type = "wallet" }) {
  return sendLifecycleFallback({
    userId: null,
    businessId,
    paymentId,
    eventKey: `${type}:business:${businessId}:${paymentId || "latest"}:${status}`,
    message: `Queless: ${body || title || `Payment ${status}`}`,
    metadata: { channel: type, event: "business_payment_status", status },
    pushResult,
  });
}

export async function sendPaidBookingProviderSmsFallback({ booking, providerUserId, paymentId = null, pushResult }) {
  const amount = money(booking?.barber_amount || booking?.price);
  return sendLifecycleFallback({
    userId: providerUserId,
    businessId: booking?.barber_id || booking?.barberId || null,
    bookingId: booking?.id || null,
    paymentId,
    eventKey: `booking:${booking?.id}:provider_paid`,
    message: `Queless: Paid booking confirmed for ${booking?.service_name || "a service"} on ${booking?.booking_date || "the selected date"} at ${booking?.booking_time || "the selected time"}.${amount ? ` Expected earnings: ${amount}.` : ""}`,
    metadata: { channel: "booking", event: "provider_paid" },
    pushResult,
  });
}
