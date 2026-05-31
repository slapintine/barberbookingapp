import crypto from "crypto";
import { all, get, run } from "../db/query.js";
import { env } from "../config/env.js";
import { getSmsConfig, normalizePhoneNumber, sendAutoReply, sendSms } from "../services/smsService.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function firstValue(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function parseIncomingPayload(payload = {}) {
  const from = firstValue(payload, ["from", "sender", "msisdn", "phoneNumber", "phone_number", "sourceAddress"]);
  const to = firstValue(payload, ["to", "recipient", "shortCode", "shortcode", "linkId", "destinationAddress"]);
  const text = firstValue(payload, ["text", "message", "body", "messageText", "keyword"]);
  const providerMessageId = firstValue(payload, ["id", "messageId", "message_id", "providerMessageId", "messageUUID", "messageUuid"]);
  const dateValue = firstValue(payload, ["date", "timestamp", "time", "receivedAt", "received_at"]);
  const receivedAt = dateValue && !Number.isNaN(new Date(dateValue).getTime()) ? new Date(dateValue).toISOString() : new Date().toISOString();
  const normalizedFrom = normalizePhoneNumber(from);
  const normalizedTo = normalizePhoneNumber(to) || to;
  const dedupeSeed = providerMessageId || `${normalizedFrom || from}|${normalizedTo || to}|${text}|${receivedAt}`;
  const dedupeKey = crypto.createHash("sha256").update(dedupeSeed).digest("hex");
  return {
    from,
    to,
    text,
    providerMessageId,
    receivedAt,
    phoneNumber: normalizedFrom,
    normalizedTo,
    dedupeKey,
  };
}

function phoneVariants(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return [String(phoneNumber || "").trim()].filter(Boolean);
  const digits = normalized.replace(/\D/g, "");
  const local = digits.startsWith("256") ? `0${digits.slice(3)}` : "";
  return [...new Set([normalized, digits, local].filter(Boolean))];
}

async function matchSmsOwner(phoneNumber) {
  const variants = phoneVariants(phoneNumber);
  if (!variants.length) return { userId: null, businessId: null };

  const user = await get(
    `SELECT u.id
     FROM profiles p
     INNER JOIN users u ON u.id = p.user_id
     WHERE p.phone IN (${variants.map(() => "?").join(",")})
        OR p.normalized_phone IN (${variants.map(() => "?").join(",")})
     LIMIT 1`,
    [...variants, ...variants]
  ).catch(() => null);

  const business = await get(
    `SELECT b.id
     FROM barbers b
     INNER JOIN profiles p ON p.user_id = b.owner_user_id
     WHERE p.phone IN (${variants.map(() => "?").join(",")})
        OR p.normalized_phone IN (${variants.map(() => "?").join(",")})
     LIMIT 1`,
    [...variants, ...variants]
  ).catch(() => null);

  return {
    userId: user?.id || null,
    businessId: business?.id || null,
  };
}

function extractProviderMessageId(response) {
  const recipient =
    response?.SMSMessageData?.Recipients?.[0] ||
    response?.SMSMessageData?.recipients?.[0] ||
    response?.recipients?.[0] ||
    null;
  return String(recipient?.messageId || recipient?.message_id || response?.messageId || "").trim();
}

async function logOutgoingSms({ to, message, status, response = {}, errorMessage = "", metadata = {} }) {
  const phoneNumber = normalizePhoneNumber(to);
  const providerMessageId = extractProviderMessageId(response);
  await run(
    `INSERT INTO sms_messages
     (direction, provider, provider_message_id, from_number, to_number, phone_number, message, status, raw_payload, dedupe_key, error_message, sent_at)
     VALUES ('outgoing', 'africastalking', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      providerMessageId,
      env.africasTalkingShortcode || "",
      phoneNumber || to,
      phoneNumber || to,
      message,
      status,
      safeJson({ response, metadata }),
      crypto.createHash("sha256").update(`outgoing|${phoneNumber || to}|${message}|${Date.now()}`).digest("hex"),
      errorMessage,
      status === "sent" ? new Date().toISOString() : null,
    ]
  );
}

export async function receiveIncomingSms(req, res) {
  const payload = req.body || {};
  try {
    const parsed = parseIncomingPayload(payload);
    if (!parsed.from || !parsed.text) {
      req.log?.warn({ payload }, "Malformed incoming SMS webhook payload");
      return res.status(200).json({ success: true, received: true, ignored: true });
    }

    const duplicate = await get(
      `SELECT id FROM sms_messages
       WHERE (provider_message_id <> '' AND provider_message_id = ?)
          OR (dedupe_key <> '' AND dedupe_key = ?)
       LIMIT 1`,
      [parsed.providerMessageId, parsed.dedupeKey]
    );
    if (duplicate) {
      return res.status(200).json({ success: true, received: true, duplicate: true });
    }

    const owner = await matchSmsOwner(parsed.phoneNumber || parsed.from);
    const insert = await run(
      `INSERT INTO sms_messages
       (direction, provider, provider_message_id, from_number, to_number, phone_number, message, status, user_id, business_id, raw_payload, dedupe_key, received_at)
       VALUES ('incoming', 'africastalking', ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?)`,
      [
        parsed.providerMessageId,
        parsed.phoneNumber || parsed.from,
        parsed.normalizedTo || parsed.to,
        parsed.phoneNumber || parsed.from,
        parsed.text,
        owner.userId,
        owner.businessId,
        safeJson(payload),
        parsed.dedupeKey,
        parsed.receivedAt,
      ]
    );

    if (env.africasTalkingSmsAutoReplyEnabled) {
      try {
        const autoReply = await sendAutoReply({
          to: parsed.phoneNumber || parsed.from,
          message: env.africasTalkingDefaultAutoReply,
        });
        await logOutgoingSms({
          to: parsed.phoneNumber || parsed.from,
          message: env.africasTalkingDefaultAutoReply,
          status: "sent",
          response: autoReply.response,
          metadata: { incomingSmsId: insert.lastID, source: "auto_reply" },
        });
      } catch (error) {
        req.log?.warn({ err: error, incomingSmsId: insert.lastID }, "SMS auto-reply failed");
        await logOutgoingSms({
          to: parsed.phoneNumber || parsed.from,
          message: env.africasTalkingDefaultAutoReply,
          status: "failed",
          errorMessage: error.message || "Auto-reply failed.",
          metadata: { incomingSmsId: insert.lastID, source: "auto_reply" },
        }).catch(() => {});
      }
    }

    return res.status(200).json({ success: true, received: true });
  } catch (error) {
    req.log?.error({ err: error }, "Incoming SMS webhook failed");
    return res.status(200).json({ success: true, received: true });
  }
}

export async function sendSmsFromAdmin(req, res, next) {
  try {
    const to = normalizePhoneNumber(req.body.to || req.body.phoneNumber || req.body.phone_number || "");
    const message = String(req.body.message || "").trim();
    if (!to) throw httpError(400, "Valid recipient phone number is required.");
    if (!message) throw httpError(400, "SMS message is required.");
    if (message.length > 918) throw httpError(400, "SMS message is too long.");

    try {
      const result = await sendSms({ to, message, metadata: { source: "admin_manual", adminUserId: req.user?.id } });
      await logOutgoingSms({ to, message, status: "sent", response: result.response, metadata: { source: "admin_manual", adminUserId: req.user?.id } });
      return res.status(200).json({ success: true, message: "SMS sent.", providerResponse: result.response });
    } catch (error) {
      await logOutgoingSms({ to, message, status: "failed", errorMessage: error.message || "SMS send failed.", metadata: { source: "admin_manual", adminUserId: req.user?.id } }).catch(() => {});
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export async function getAdminSmsMessages(req, res, next) {
  try {
    const direction = String(req.query.direction || "all").toLowerCase();
    const status = String(req.query.status || "all").toLowerCase();
    const search = String(req.query.search || "").trim();
    const params = [];
    const where = [];
    if (["incoming", "outgoing"].includes(direction)) {
      where.push("sm.direction = ?");
      params.push(direction);
    }
    if (status !== "all") {
      where.push("LOWER(sm.status) = ?");
      params.push(status);
    }
    if (search) {
      where.push("(sm.phone_number LIKE ? OR sm.from_number LIKE ? OR sm.to_number LIKE ? OR sm.message LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const rows = await all(
      `SELECT sm.*,
              u.username,
              p.full_name,
              b.business_name
       FROM sms_messages sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN barbers b ON b.id = sm.business_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT 300`,
      params
    );
    res.status(200).json({
      success: true,
      config: getSmsConfig(),
      messages: rows,
    });
  } catch (error) {
    next(error);
  }
}
