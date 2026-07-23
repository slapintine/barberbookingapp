import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Proves auth/session responses never carry the password hash, even though the
// internal user row does. Uses createAuthSession directly so it does not consume
// the per-IP login rate-limit budget shared across the integration suite.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-auth-safety-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "auth-safety-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "auth-safety.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let db;
let run;
let createAuthSession;
let authenticateAccessToken;

test.before(async () => {
  ({ default: db } = await import("./config/db.js"));
  ({ run } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  await initDb();
  ({ authenticateAccessToken, createAuthSession } = await import("./services/authSessionService.js"));
});

test.after(async () => {
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("session response never includes password_hash", async () => {
  const res = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('hashed_user', '$2a$10$abcdefghijklmnopqrstuv', 'customer', 'active')`
  );
  const user = {
    id: res.lastID,
    username: "hashed_user",
    role: "customer",
    password_hash: "$2a$10$abcdefghijklmnopqrstuv",
  };
  const session = await createAuthSession(user, { userAgent: "test", ipAddress: "127.0.0.1" });

  const serialized = JSON.stringify(session);
  assert.ok(!serialized.includes("password_hash"), "response must not contain a password_hash key");
  assert.ok(!serialized.includes("$2a$10$"), "response must not contain the bcrypt hash value");
  assert.equal(session.user.password_hash, undefined);
  assert.ok(session.token, "session should still return an access token");
  assert.ok(session.refreshToken, "session should still return a refresh token");
});

test("access-token authentication rehydrates linked provider stand and plan", async () => {
  const res = await run(
    `INSERT INTO users (username, password_hash, role, account_status, email_verified_at)
     VALUES ('linked_provider', 'not-used', 'provider', 'active', CURRENT_TIMESTAMP)`
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, normalized_email, address, profile_photo)
     VALUES (?, 'Linked Provider', '', 'linked.provider@example.test', 'linked.provider@example.test', 'Kampala', '')`,
    [res.lastID]
  );
  const business = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, subscription_tier, selected_plan, subscription_status, business_status, is_published, admin_approved)
     VALUES (?, 'Linked Provider Studio', 'linked provider studio', 'Kampala', 'PREMIUM', 'PREMIUM', 'active', 'active', 1, 1)`,
    [res.lastID]
  );
  await run(
    `INSERT INTO barber_subscriptions
     (barber_id, tier, status, billing_cycle, amount_paid, currency, payment_status, is_active, provider, started_at, expires_at, activated_at)
     VALUES (?, 'PREMIUM', 'active', 'monthly', 10000, 'UGX', 'paid', 1, 'test', CURRENT_TIMESTAMP, datetime('now', '+30 days'), CURRENT_TIMESTAMP)`,
    [business.lastID]
  );

  const session = await createAuthSession(
    { id: res.lastID, username: "linked_provider", role: "provider" },
    { userAgent: "test", ipAddress: "127.0.0.1" }
  );
  const { user } = await authenticateAccessToken(session.token);

  assert.equal(user.barber_id, business.lastID);
  assert.equal(user.barberId, business.lastID);
  assert.equal(user.provider_plan, "PREMIUM");
  assert.equal(user.providerPlan, "PREMIUM");
  assert.equal(user.subscription_tier, "PREMIUM");
});
