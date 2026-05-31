import AfricasTalking from "africastalking";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { env } from "../config/env.js";
import { get, run } from "../db/query.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_SEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_SEND_MAX_PER_WINDOW = 5;
let africasTalkingClient = null;

function nowIso() {
  return new Date().toISOString();
}

export function normalizePhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9 && /^[37]/.test(digits)) return `+256${digits}`;
  if (String(phone || "").trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return "";
}

export function getSmsConfig() {
  const username = env.africasTalkingUsername;
  const apiKey = env.africasTalkingApiKey;
  const shortcode = env.africasTalkingShortcode;
  const smsEnv = env.africasTalkingEnv || "sandbox";
  const configured = Boolean(username && apiKey);
  return {
    provider: "africastalking",
    username,
    shortcode,
    env: smsEnv,
    configured,
    enabled: configured && (env.nodeEnv !== "production" || smsEnv === "production" || username !== "sandbox"),
    lifecycleSmsEnabled: Boolean(env.africasTalkingLifecycleSmsEnabled),
    autoReplyEnabled: Boolean(env.africasTalkingSmsAutoReplyEnabled),
    defaultAutoReply: env.africasTalkingDefaultAutoReply,
  };
}

export function isSmsEnabled() {
  return getSmsConfig().enabled;
}

function getClient() {
  const config = getSmsConfig();
  if (!config.configured) {
    throw Object.assign(new Error("Africa's Talking SMS is not configured."), { statusCode: 503 });
  }
  if (env.nodeEnv === "production" && (config.env === "sandbox" || config.username === "sandbox")) {
    throw Object.assign(new Error("Africa's Talking sandbox credentials cannot send production SMS."), { statusCode: 503 });
  }
  if (!africasTalkingClient) {
    africasTalkingClient = AfricasTalking({
      apiKey: env.africasTalkingApiKey,
      username: env.africasTalkingUsername,
    });
  }
  return africasTalkingClient;
}

export async function sendSms({ to, message, metadata = {} }) {
  const phoneNumber = normalizePhoneNumber(to);
  const text = String(message || "").trim();
  if (!phoneNumber) throw Object.assign(new Error("Valid recipient phone number is required."), { statusCode: 400 });
  if (!text) throw Object.assign(new Error("SMS message is required."), { statusCode: 400 });
  if (text.length > 918) throw Object.assign(new Error("SMS message is too long."), { statusCode: 400 });

  const config = getSmsConfig();
  const sms = getClient().SMS;
  const options = {
    to: [phoneNumber],
    message: text,
    enqueue: true,
  };
  if (config.shortcode) {
    options.from = config.shortcode;
    options.senderId = config.shortcode;
  }

  const response = await sms.send(options);
  return {
    provider: "africastalking",
    to: phoneNumber,
    message: text,
    response,
    metadata,
  };
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function extractProviderMessageId(response) {
  const recipient =
    response?.SMSMessageData?.Recipients?.[0] ||
    response?.SMSMessageData?.recipients?.[0] ||
    response?.recipients?.[0] ||
    null;
  return String(recipient?.messageId || recipient?.message_id || response?.messageId || "").trim();
}

function buildDedupeKey({ to, message, metadata = {} }) {
  const stableSeed =
    metadata.dedupeKey ||
    metadata.eventKey ||
    metadata.lifecycleEventKey ||
    `outgoing|${normalizePhoneNumber(to) || to}|${message}`;
  return crypto.createHash("sha256").update(String(stableSeed)).digest("hex");
}

export async function logOutgoingSms({
  to,
  message,
  status,
  response = {},
  errorMessage = "",
  metadata = {},
  userId = null,
  businessId = null,
  bookingId = null,
  paymentId = null,
  subscriptionId = null,
  dedupeKey = "",
  existingMessageId = null,
}) {
  const phoneNumber = normalizePhoneNumber(to);
  const providerMessageId = extractProviderMessageId(response);
  const rawPayload = safeJson({ response, metadata });
  const resolvedDedupeKey = dedupeKey || buildDedupeKey({ to, message, metadata });

  if (existingMessageId) {
    await run(
      `UPDATE sms_messages
       SET provider_message_id = COALESCE(NULLIF(?, ''), provider_message_id),
           from_number = ?,
           to_number = ?,
           phone_number = ?,
           message = ?,
           status = ?,
           user_id = COALESCE(?, user_id),
           business_id = COALESCE(?, business_id),
           booking_id = COALESCE(?, booking_id),
           payment_id = COALESCE(?, payment_id),
           subscription_id = COALESCE(?, subscription_id),
           raw_payload = ?,
           error_message = ?,
           sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        providerMessageId,
        env.africasTalkingShortcode || "",
        phoneNumber || to,
        phoneNumber || to,
        message,
        status,
        userId,
        businessId,
        bookingId,
        paymentId,
        subscriptionId,
        rawPayload,
        errorMessage,
        status,
        existingMessageId,
      ]
    );
    return existingMessageId;
  }

  const insert = await run(
    `INSERT INTO sms_messages
     (direction, provider, provider_message_id, from_number, to_number, phone_number, message, status, user_id, business_id, booking_id, payment_id, subscription_id, raw_payload, dedupe_key, error_message, sent_at)
     VALUES ('outgoing', 'africastalking', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      providerMessageId,
      env.africasTalkingShortcode || "",
      phoneNumber || to,
      phoneNumber || to,
      message,
      status,
      userId,
      businessId,
      bookingId,
      paymentId,
      subscriptionId,
      rawPayload,
      resolvedDedupeKey,
      errorMessage,
      status === "sent" ? new Date().toISOString() : null,
    ]
  );
  return insert?.lastID || null;
}

export async function sendLoggedSms({
  to,
  message,
  metadata = {},
  userId = null,
  businessId = null,
  bookingId = null,
  paymentId = null,
  subscriptionId = null,
  dedupeKey = "",
}) {
  const phoneNumber = normalizePhoneNumber(to);
  const text = String(message || "").trim();
  if (!phoneNumber) throw Object.assign(new Error("Valid recipient phone number is required."), { statusCode: 400 });
  if (!text) throw Object.assign(new Error("SMS message is required."), { statusCode: 400 });

  const resolvedDedupeKey = dedupeKey || buildDedupeKey({ to: phoneNumber, message: text, metadata });
  const duplicate = resolvedDedupeKey
    ? await get(
        `SELECT id, status FROM sms_messages
         WHERE direction = 'outgoing'
           AND provider = 'africastalking'
           AND dedupe_key = ?
         ORDER BY id DESC
         LIMIT 1`,
        [resolvedDedupeKey]
      )
    : null;

  if (duplicate && ["queued", "sent"].includes(String(duplicate.status || "").toLowerCase())) {
    return { skipped: true, duplicate: true, messageId: duplicate.id, status: duplicate.status };
  }

  let messageId = duplicate?.id || null;
  if (!messageId) {
    try {
      messageId = await logOutgoingSms({
        to: phoneNumber,
        message: text,
        status: "queued",
        metadata,
        userId,
        businessId,
        bookingId,
        paymentId,
        subscriptionId,
        dedupeKey: resolvedDedupeKey,
      });
    } catch (error) {
      if (resolvedDedupeKey && /unique|duplicate/i.test(String(error.message || ""))) {
        return { skipped: true, duplicate: true, status: "queued" };
      }
      throw error;
    }
  } else {
    await logOutgoingSms({
      to: phoneNumber,
      message: text,
      status: "queued",
      metadata,
      userId,
      businessId,
      bookingId,
      paymentId,
      subscriptionId,
      dedupeKey: resolvedDedupeKey,
      existingMessageId: messageId,
    });
  }

  try {
    const result = await sendSms({ to: phoneNumber, message: text, metadata });
    await logOutgoingSms({
      to: phoneNumber,
      message: text,
      status: "sent",
      response: result.response,
      metadata,
      userId,
      businessId,
      bookingId,
      paymentId,
      subscriptionId,
      dedupeKey: resolvedDedupeKey,
      existingMessageId: messageId,
    });
    return { ...result, messageId, dedupeKey: resolvedDedupeKey, status: "sent" };
  } catch (error) {
    await logOutgoingSms({
      to: phoneNumber,
      message: text,
      status: "failed",
      errorMessage: error.message || "SMS send failed.",
      metadata,
      userId,
      businessId,
      bookingId,
      paymentId,
      subscriptionId,
      dedupeKey: resolvedDedupeKey,
      existingMessageId: messageId,
    }).catch(() => {});
    throw error;
  }
}

export function sendAutoReply({ to, message }) {
  return sendSms({
    to,
    message: message || env.africasTalkingDefaultAutoReply,
    metadata: { source: "sms_auto_reply" },
  });
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function enforceOtpSendLimit(phoneNumber, purpose) {
  const latest = await get(
    `SELECT created_at
     FROM otp_codes
     WHERE channel = 'sms'
       AND destination = ?
       AND purpose = ?
     ORDER BY id DESC
     LIMIT 1`,
    [phoneNumber, purpose]
  );
  if (latest?.created_at && Date.now() - new Date(latest.created_at).getTime() < OTP_SEND_COOLDOWN_MS) {
    throw Object.assign(new Error("Please wait before requesting another code."), { statusCode: 429 });
  }

  const recent = await get(
    `SELECT COUNT(*) AS count
     FROM otp_codes
     WHERE channel = 'sms'
       AND destination = ?
       AND purpose = ?
       AND created_at >= ?`,
    [phoneNumber, purpose, new Date(Date.now() - OTP_SEND_WINDOW_MS).toISOString()]
  );
  if (Number(recent?.count || 0) >= OTP_SEND_MAX_PER_WINDOW) {
    throw Object.assign(new Error("Too many verification codes requested. Please try again later."), { statusCode: 429 });
  }
}

export async function sendOtpSms({ phone, purpose = "phone_verification", userId = null }) {
  const phoneNumber = normalizePhoneNumber(phone);
  if (!phoneNumber) throw Object.assign(new Error("Valid phone number is required."), { statusCode: 400 });

  await enforceOtpSendLimit(phoneNumber, purpose);
  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await run(
    `INSERT INTO otp_codes (user_id, channel, destination, purpose, code_hash, expires_at)
     VALUES (?, 'sms', ?, ?, ?, ?)`,
    [userId, phoneNumber, purpose, codeHash, expiresAt]
  );

  const message = `Your Queless verification code is ${code}. It expires in 10 minutes.`;
  const result = await sendSms({ to: phoneNumber, message, metadata: { purpose, source: "otp" } });
  return { ...result, phoneNumber, expiresAt };
}

export async function verifyOtp({ phone, code, purpose = "phone_verification" }) {
  const phoneNumber = normalizePhoneNumber(phone);
  const value = String(code || "").trim();
  if (!phoneNumber || !value) {
    throw Object.assign(new Error("Phone number and verification code are required."), { statusCode: 400 });
  }

  const row = await get(
    `SELECT *
     FROM otp_codes
     WHERE channel = 'sms'
       AND destination = ?
       AND purpose = ?
       AND verified_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [phoneNumber, purpose]
  );

  if (!row) throw Object.assign(new Error("Verification code not found."), { statusCode: 404 });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("Verification code expired."), { statusCode: 400 });
  }
  if (Number(row.attempts || 0) >= Number(row.max_attempts || 5)) {
    throw Object.assign(new Error("Too many verification attempts."), { statusCode: 429 });
  }

  const matches = await bcrypt.compare(value, row.code_hash);
  if (!matches) {
    await run(`UPDATE otp_codes SET attempts = attempts + 1, updated_at = ? WHERE id = ?`, [nowIso(), row.id]);
    throw Object.assign(new Error("Invalid verification code."), { statusCode: 400 });
  }

  await run(`UPDATE otp_codes SET verified_at = CURRENT_TIMESTAMP, used_at = CURRENT_TIMESTAMP, updated_at = ? WHERE id = ?`, [nowIso(), row.id]);
  return true;
}
