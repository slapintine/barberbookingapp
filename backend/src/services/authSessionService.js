import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { get, run } from "../db/query.js";
import { generateToken } from "../utils/generateToken.js";

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function makeRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function refreshExpiry() {
  return new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000).toISOString();
}

function accessTokenFor(user, sessionId) {
  return generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    sid: sessionId,
  });
}

function publicUser(row = {}) {
  const barberId = row.barber_id || row.barberId || null;
  const providerPlan = String(row.provider_plan || row.providerPlan || row.subscription_tier || "").toUpperCase();
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    plan: row.plan || "free",
    email: row.email || "",
    emailVerified: Boolean(row.email_verified_at),
    email_verified: Boolean(row.email_verified_at),
    created_at: row.created_at,
    account_status: row.account_status || "active",
    barber_id: barberId,
    barberId,
    providerPlan: providerPlan || null,
    subscription_tier: row.subscription_tier || providerPlan || null,
  };
}

function activeProviderPlanPredicate(alias = "bs") {
  return `${alias}.is_active IS TRUE`;
}

export async function createAuthSession(user, request = {}) {
  const sessionId = crypto.randomUUID();
  const refreshToken = makeRefreshToken();
  const expiresAt = refreshExpiry();
  await run(
    `INSERT INTO auth_sessions
     (id, user_id, refresh_token_hash, expires_at, user_agent, ip_address, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      sessionId,
      user.id,
      hashRefreshToken(refreshToken),
      expiresAt,
      String(request.userAgent || "").slice(0, 500),
      String(request.ipAddress || "").slice(0, 120),
    ]
  );
  const accessToken = accessTokenFor(user, sessionId);
  return {
    token: accessToken,
    accessToken,
    refreshToken,
    session: { id: sessionId, expiresAt },
    user: publicUser(user),
  };
}

export async function rotateAuthSession(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const row = await get(
    `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at,
            u.id, u.username, u.role, u.account_status, u.disabled_at, u.blocked_at,
            u.email_verified_at, u.created_at, p.email,
            b.id AS barber_id,
            b.subscription_tier,
            COALESCE(
              (
                SELECT bs.tier
                FROM barber_subscriptions bs
                WHERE bs.barber_id = b.id
                  AND ${activeProviderPlanPredicate("bs")}
                  AND LOWER(COALESCE(bs.status, '')) IN ('active', 'trialing')
                ORDER BY bs.id DESC
                LIMIT 1
              ),
              b.subscription_tier
            ) AS provider_plan
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN barbers b ON b.owner_user_id = u.id AND b.deleted_at IS NULL
     WHERE s.refresh_token_hash = ?`,
    [tokenHash]
  );
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
    const error = new Error("Session expired. Please log in again.");
    error.statusCode = 401;
    throw error;
  }
  const status = String(row.account_status || "active").toLowerCase();
  if (["inactive", "blocked", "disabled", "suspended"].includes(status) || row.disabled_at || row.blocked_at) {
    const error = new Error("This account is not active. Please contact support.");
    error.statusCode = 403;
    throw error;
  }
  const nextRefreshToken = makeRefreshToken();
  const expiresAt = refreshExpiry();
  const rotated = await run(
    `UPDATE auth_sessions
     SET refresh_token_hash = ?, expires_at = ?, last_used_at = CURRENT_TIMESTAMP
     WHERE id = ? AND refresh_token_hash = ? AND revoked_at IS NULL`,
    [hashRefreshToken(nextRefreshToken), expiresAt, row.session_id, tokenHash]
  );
  if (!rotated.changes) {
    const error = new Error("Session was refreshed elsewhere. Please try again.");
    error.statusCode = 401;
    throw error;
  }
  const accessToken = accessTokenFor(row, row.session_id);
  return {
    token: accessToken,
    accessToken,
    refreshToken: nextRefreshToken,
    session: { id: row.session_id, expiresAt },
    user: publicUser(row),
  };
}

export async function revokeAuthSession({ refreshToken = "", sessionId = "" } = {}) {
  if (refreshToken) {
    await run(
      `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE refresh_token_hash = ? AND revoked_at IS NULL`,
      [hashRefreshToken(refreshToken)]
    );
  }
  if (sessionId) {
    await run(
      `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL`,
      [sessionId]
    );
  }
}

export function revokeAllUserSessions(userId) {
  return run(
    `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

export async function authenticateAccessToken(token) {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (!decoded.sid) {
    const error = new Error("Session expired. Please log in again.");
    error.statusCode = 401;
    throw error;
  }
  const row = await get(
    `SELECT u.id, u.username, u.role, u.account_status, u.disabled_at, u.blocked_at, u.created_at,
            p.email,
            u.email_verified_at,
            b.id AS barber_id,
            b.subscription_tier,
            COALESCE(
              (
                SELECT bs.tier
                FROM barber_subscriptions bs
                WHERE bs.barber_id = b.id
                  AND ${activeProviderPlanPredicate("bs")}
                  AND LOWER(COALESCE(bs.status, '')) IN ('active', 'trialing')
                ORDER BY bs.id DESC
                LIMIT 1
              ),
              b.subscription_tier
            ) AS provider_plan,
            s.id AS session_id, s.expires_at AS session_expires_at, s.revoked_at
     FROM users u
     JOIN auth_sessions s ON s.user_id = u.id
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN barbers b ON b.owner_user_id = u.id AND b.deleted_at IS NULL
     WHERE u.id = ? AND s.id = ?`,
    [decoded.userId, decoded.sid]
  );
  if (!row || row.revoked_at || new Date(row.session_expires_at).getTime() <= Date.now()) {
    const error = new Error("Session expired. Please log in again.");
    error.statusCode = 401;
    throw error;
  }
  row.barberId = row.barber_id || null;
  row.providerPlan = row.provider_plan || row.subscription_tier || null;
  return { user: row, sessionId: row.session_id, decoded };
}

export function refreshAccessToken(user, sessionId) {
  return accessTokenFor(user, sessionId);
}
