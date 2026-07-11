import crypto from "node:crypto";
import { env } from "../config/env.js";
import { run } from "../db/query.js";
import { logger } from "../config/logger.js";

// Best-effort security/business audit trail.
//
// Guarantees:
//  - Never throws into the request flow (every failure is swallowed + logged).
//  - Never stores raw IP / user-agent (sha256 with a server-side salt).
//  - Never stores secrets, tokens, OTPs, passwords, payment creds, auth headers,
//    full request bodies, or message contents — metadata is redacted + capped.

export const AUDIT_EVENTS = Object.freeze({
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILURE: "auth.login.failure",
  ACCOUNT_LOCKOUT: "auth.account.lockout",
  LOGOUT: "auth.logout",
  PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  PASSWORD_RESET_CONFIRMED: "auth.password_reset.confirmed",
  PASSWORD_CHANGED: "account.password.changed",
  PROFILE_UPDATED: "account.profile.updated",
  STAND_CREATED: "stand.created",
  STAND_DRAFT_SAVED: "stand.draft_saved",
  STAND_PUBLISHED: "stand.published",
  STAND_DELETED: "stand.deleted",
  BOOKING_CREATED: "booking.created",
  BOOKING_STATUS_CHANGED: "booking.status_changed",
  REVIEW_CREATED: "review.created",
  REVIEW_UPDATED: "review.updated",
  REVIEW_DELETED: "review.deleted",
  WALLET_TOPUP_INITIATED: "wallet.topup.initiated",
  WALLET_WITHDRAW_INITIATED: "wallet.withdraw.initiated",
  SUPPORT_REQUEST_CREATED: "support.request.created",
  QUOTE_REQUEST_CREATED: "support.quote.created",
  ADMIN_ANNOUNCEMENT_CREATED: "admin.announcement.created",
  ADMIN_CUSTOMER_SUBSCRIPTION_CHANGED: "admin.customer_subscription.changed",
  ADMIN_PROVIDER_SUBSCRIPTION_CHANGED: "admin.provider_subscription.changed",
  ADMIN_BUSINESS_UPDATED: "admin.business.updated",
  ADMIN_SUPPORT_REQUEST_UPDATED: "admin.support_request.updated",
});

// Keys whose VALUES must never be stored, matched case-insensitively as a
// substring so variants (refresh_token, accessToken, api-key, …) are caught.
const REDACT_KEY = /(pass|pwd|token|otp|secret|apikey|api_key|api-key|authorization|auth|credential|cvv|\bpin\b|ssn|card|refresh|access)/i;
const MAX_STRING = 300;
const MAX_KEYS = 40;
const MAX_ARRAY = 25;
const MAX_DEPTH = 4;

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value !== "object") return undefined; // drop functions/symbols
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1)).filter((v) => v !== undefined);
  }

  const out = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (count >= MAX_KEYS) break;
    count += 1;
    if (REDACT_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    const clean = sanitize(raw, depth + 1);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

export function sanitizeAuditMetadata(metadata) {
  const result = sanitize(metadata ?? {});
  return result && typeof result === "object" && !Array.isArray(result) ? result : {};
}

function hashValue(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  return crypto.createHash("sha256").update(`${env.auditLogSalt}:${v}`).digest("hex").slice(0, 32);
}

// Hash an email for failed-login correlation without storing the plain address.
export function hashAuditEmail(email) {
  return hashValue(String(email || "").trim().toLowerCase());
}

// Records one audit event. Resolves to the inserted id, or null on any failure —
// it never rejects, so callers can `await` it safely in a request handler.
export async function recordAuditEvent({
  eventType,
  actorUserId = null,
  actorRole = null,
  targetType = null,
  targetId = null,
  metadata = {},
  req = null,
  ipHash = null,
  userAgentHash = null,
} = {}) {
  try {
    if (!eventType) return null;
    const ip = ipHash ?? (req ? hashValue(req.ip || req.headers?.["x-forwarded-for"]) : null);
    const ua = userAgentHash ?? (req ? hashValue(req.get?.("user-agent") || req.headers?.["user-agent"]) : null);
    const result = await run(
      `INSERT INTO security_audit_logs
         (event_type, actor_user_id, actor_role, target_type, target_id, ip_hash, user_agent_hash, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(eventType).slice(0, 120),
        actorUserId ?? null,
        actorRole ? String(actorRole).slice(0, 40) : null,
        targetType ? String(targetType).slice(0, 60) : null,
        targetId !== null && targetId !== undefined ? String(targetId).slice(0, 120) : null,
        ip,
        ua,
        JSON.stringify(sanitizeAuditMetadata(metadata)),
      ]
    );
    return result?.lastID ?? null;
  } catch (error) {
    // Best-effort: never break the user's request because audit logging failed.
    logger.warn({ err: error, eventType }, "audit log write failed");
    return null;
  }
}
