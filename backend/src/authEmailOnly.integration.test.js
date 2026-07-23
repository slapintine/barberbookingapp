import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-email-auth-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "email-auth-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "email-auth.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";
process.env.RESEND_API_KEY = "";
process.env.SMS_ENABLED = "false";

let app;
let db;
let run;
let get;
let server;
let baseUrl;
let token;
let user;

function request(pathname, { method = "GET", body, auth = token } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run, get } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  await initDb();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("customer signup accepts email and password without username or phone", async () => {
  const res = await request("/api/auth/register", {
    method: "POST",
    auth: "",
    body: { email: "emailonly.customer@example.test", password: "Passw0rd!" },
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.emailVerificationRequired, true);
  assert.ok(body.user?.username, "server should create an internal username");
  assert.ok(body.token);
  token = body.token;
  user = body.user;

  const profile = await get(`SELECT phone, email FROM profiles WHERE user_id = ?`, [user.id]);
  assert.equal(profile.email, "emailonly.customer@example.test");
  assert.equal(profile.phone, "");
});

test("login uses email only and ignores legacy phone verification state", async () => {
  await run(`UPDATE profiles SET phone = '+256700000000' WHERE user_id = ?`, [user.id]);
  const res = await request("/api/auth/login", {
    method: "POST",
    auth: "",
    body: { email: " EMAILONLY.CUSTOMER@example.test ", password: "Passw0rd!" },
  });
  assert.equal(res.status, 200);
});

test("provider login response includes linked stand and plan", async () => {
  const passwordHash = await bcrypt.hash("ProviderPass123", 4);
  const provider = await run(
    `INSERT INTO users (username, password_hash, role, account_status, email_verified_at)
     VALUES ('email_provider', ?, 'provider', 'active', CURRENT_TIMESTAMP)`,
    [passwordHash]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, normalized_email, address, profile_photo)
     VALUES (?, 'Email Provider', '', 'email.provider@example.test', 'email.provider@example.test', 'Kampala', '')`,
    [provider.lastID]
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, subscription_tier, selected_plan, subscription_status, business_status, is_published, admin_approved)
     VALUES (?, 'Email Provider Studio', 'email provider studio', 'Kampala', 'PLATINUM', 'PLATINUM', 'active', 'active', 1, 1)`,
    [provider.lastID]
  );
  await run(
    `INSERT INTO barber_subscriptions
     (barber_id, tier, status, billing_cycle, amount_paid, currency, payment_status, is_active, provider, started_at, expires_at, activated_at)
     VALUES (?, 'PLATINUM', 'active', 'monthly', 20000, 'UGX', 'paid', 1, 'test', CURRENT_TIMESTAMP, datetime('now', '+30 days'), CURRENT_TIMESTAMP)`,
    [stand.lastID]
  );

  const res = await request("/api/auth/login", {
    method: "POST",
    auth: "",
    body: { email: "email.provider@example.test", password: "ProviderPass123" },
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.user.barber_id, stand.lastID);
  assert.equal(body.user.barberId, stand.lastID);
  assert.equal(body.user.providerPlan, "PLATINUM");
  assert.equal(body.user.subscription_tier, "PLATINUM");
});

test("email-unverified account status does not block basic login", async () => {
  await run(`UPDATE users SET account_status = 'pending_verification' WHERE id = ?`, [user.id]);
  const res = await request("/api/auth/login", {
    method: "POST",
    auth: "",
    body: { email: "emailonly.customer@example.test", password: "Passw0rd!" },
  });
  assert.equal(res.status, 200);
  await run(`UPDATE users SET account_status = 'active' WHERE id = ?`, [user.id]);
});

test("phone OTP authentication endpoint is unavailable", async () => {
  const res = await request("/api/auth/send-phone-otp", {
    method: "POST",
    body: { phone: "+256700000000" },
  });
  assert.equal(res.status, 404);
});

test("SMS channel verification is retired even if posted to the compatibility verifier", async () => {
  const res = await request("/api/auth/verify-otp", {
    method: "POST",
    body: { channel: "sms", destination: "+256700000000", code: "123456" },
  });
  const body = await res.json();
  assert.equal(res.status, 410);
  assert.equal(body.code, "PHONE_VERIFICATION_RETIRED");
});

test("email verification codes are single use", async () => {
  const code = "123456";
  const hash = await bcrypt.hash(code, 4);
  await run(
    `INSERT INTO otp_codes (user_id, channel, destination, purpose, code_hash, expires_at)
     VALUES (?, 'email', ?, 'account_verification', ?, ?)`,
    [user.id, "emailonly.customer@example.test", hash, new Date(Date.now() + 600000).toISOString()]
  );
  const first = await request("/api/auth/verify-otp", {
    method: "POST",
    body: { channel: "email", destination: "emailonly.customer@example.test", code },
  });
  assert.equal(first.status, 200);
  const used = await get(
    `SELECT used_at, verified_at FROM otp_codes WHERE channel = 'email' AND destination = ? AND purpose = 'account_verification' AND code_hash = ?`,
    ["emailonly.customer@example.test", hash]
  );
  assert.ok(used?.used_at, "verified code should be marked used");
  assert.ok(used?.verified_at, "verified code should be marked verified");
  const second = await request("/api/auth/verify-otp", {
    method: "POST",
    body: { channel: "email", destination: "emailonly.customer@example.test", code },
  });
  assert.notEqual(second.status, 200);
});

test("password reset remains email-only", async () => {
  const requestRes = await request("/api/auth/password-reset/request", {
    method: "POST",
    auth: "",
    body: { email: "emailonly.customer@example.test" },
  });
  assert.equal(requestRes.status, 503, "local email provider is intentionally not configured");

  const code = "654321";
  const hash = await bcrypt.hash(code, 4);
  await run(
    `INSERT INTO otp_codes (user_id, channel, destination, purpose, code_hash, expires_at)
     VALUES (?, 'email', ?, 'password_reset', ?, ?)`,
    [user.id, "emailonly.customer@example.test", hash, new Date(Date.now() + 600000).toISOString()]
  );
  const confirm = await request("/api/auth/password-reset/confirm", {
    method: "POST",
    auth: "",
    body: { email: "emailonly.customer@example.test", code, newPassword: "NewPass99" },
  });
  assert.equal(confirm.status, 200);
  const login = await request("/api/auth/login", {
    method: "POST",
    auth: "",
    body: { email: "emailonly.customer@example.test", password: "NewPass99" },
  });
  assert.equal(login.status, 200);
});
