import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-password-reset-"));
const emailCaptureDir = path.join(tempDir, "emails");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "password-reset-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "password-reset.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "https://queless.org";
process.env.APP_PUBLIC_URL = "https://queless.org";
process.env.EMAIL_CAPTURE_DIR = emailCaptureDir;

let app;
let db;
let server;
let baseUrl;
let run;
let get;
let requestNumber = 0;

function nextIp() {
  requestNumber += 1;
  return `127.0.9.${requestNumber}`;
}

function post(pathname, body, { ip = nextIp() } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
}

function login(body) {
  return post("/api/auth/login", body);
}

function resetRequest(email, options) {
  return post("/api/auth/password-reset/request", { email }, options);
}

function resetConfirm(body, options) {
  return post("/api/auth/password-reset/confirm", body, options);
}

function clearCapturedEmails() {
  fs.rmSync(emailCaptureDir, { recursive: true, force: true });
  fs.mkdirSync(emailCaptureDir, { recursive: true });
}

function readLatestEmail() {
  const files = fs.readdirSync(emailCaptureDir).filter((file) => file.endsWith(".json")).sort();
  assert.ok(files.length > 0, "expected a captured reset email");
  return JSON.parse(fs.readFileSync(path.join(emailCaptureDir, files.at(-1)), "utf8"));
}

function readCodeFromLatestEmail() {
  const email = readLatestEmail();
  const match = String(email.text || "").match(/\b(\d{6})\b/);
  assert.ok(match, "expected a six-digit reset code");
  return { code: match[1], email };
}

async function createUser({ username, email, role = "customer", password = "Passw0rd!", status = "active" }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, ?, ?, ?)`,
    [username, passwordHash, role, status]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, ?, '', ?, '', '')`,
    [result.lastID, `${role} reset user`, email.toLowerCase()]
  );
  return { id: result.lastID, username, email, password, role };
}

async function ageResetCodes(userId) {
  await run(
    `UPDATE otp_codes
     SET created_at = datetime('now', '-61 seconds')
     WHERE user_id = ? AND purpose = 'password_reset'`,
    [userId]
  );
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
  clearCapturedEmails();
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows temp lock */ }
});

test("password reset request sends a production-safe email for existing customer and provider accounts", async () => {
  const customer = await createUser({ username: "ResetCustomer", email: "reset.customer@example.test" });
  const provider = await createUser({ username: "ResetProvider", email: "reset.provider@example.test", role: "provider", password: "Provider99" });

  for (const user of [customer, provider]) {
    clearCapturedEmails();
    const res = await resetRequest(user.email);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.message, "If an account exists for that email, we have sent password-reset instructions.");
    const email = readLatestEmail();
    assert.equal(email.to, user.email);
    assert.equal(email.subject, "Reset your Queless password");
    assert.match(email.text, /expires in 10 minutes/i);
    assert.doesNotMatch(email.text, /localhost|127\.0\.0\.1|5012/i);
  }
});

test("nonexistent email returns the same neutral response without sending email", async () => {
  clearCapturedEmails();
  const res = await resetRequest("missing.reset@example.test");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.message, "If an account exists for that email, we have sent password-reset instructions.");
  assert.deepEqual(fs.readdirSync(emailCaptureDir), []);
});

test("malformed and empty reset request inputs use safe validation messages", async () => {
  const empty = await resetRequest("");
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).message, "Enter your registered email address.");

  const malformed = await resetRequest("not-an-email");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).message, "Enter a valid email address.");
});

test("resend cooldown and account-hour limit do not create extra usable codes", async () => {
  const user = await createUser({ username: "CooldownUser", email: "cooldown.reset@example.test" });
  clearCapturedEmails();

  assert.equal((await resetRequest(user.email)).status, 200);
  const cooldown = await resetRequest(user.email);
  const cooldownBody = await cooldown.json();
  assert.equal(cooldown.status, 200);
  assert.ok(Number(cooldownBody.retryAfter) > 0);
  assert.equal(fs.readdirSync(emailCaptureDir).length, 1);

  for (let index = 0; index < 4; index += 1) {
    await ageResetCodes(user.id);
    assert.equal((await resetRequest(user.email)).status, 200);
  }
  await ageResetCodes(user.id);
  const limited = await resetRequest(user.email);
  const limitedBody = await limited.json();
  assert.equal(limited.status, 200);
  assert.ok(Number(limitedBody.retryAfter) >= 3600);
});

test("new reset code invalidates the earlier code", async () => {
  const user = await createUser({ username: "InvalidateUser", email: "invalidate.reset@example.test" });
  clearCapturedEmails();
  assert.equal((await resetRequest(user.email)).status, 200);
  const first = readCodeFromLatestEmail().code;
  await ageResetCodes(user.id);
  assert.equal((await resetRequest(user.email)).status, 200);
  const second = readCodeFromLatestEmail().code;
  assert.notEqual(first, second);

  const oldCode = await resetConfirm({ email: user.email, code: first, newPassword: "NewPass99", confirmPassword: "NewPass99" });
  assert.equal(oldCode.status, 400);
  assert.equal((await oldCode.json()).message, "This code is invalid or has expired. Request a new code.");
});

test("expired, incorrect, and too-many-attempt reset codes are rejected safely", async () => {
  const expiredUser = await createUser({ username: "ExpiredReset", email: "expired.reset@example.test" });
  clearCapturedEmails();
  assert.equal((await resetRequest(expiredUser.email)).status, 200);
  const expiredCode = readCodeFromLatestEmail().code;
  await run(`UPDATE otp_codes SET expires_at = datetime('now', '-1 minute') WHERE user_id = ?`, [expiredUser.id]);
  const expired = await resetConfirm({ email: expiredUser.email, code: expiredCode, newPassword: "NewPass99", confirmPassword: "NewPass99" });
  assert.equal(expired.status, 400);

  const lockedUser = await createUser({ username: "LockedReset", email: "locked.reset@example.test" });
  clearCapturedEmails();
  assert.equal((await resetRequest(lockedUser.email)).status, 200);
  for (let index = 0; index < 4; index += 1) {
    const wrong = await resetConfirm({ email: lockedUser.email, code: "000000", newPassword: "NewPass99", confirmPassword: "NewPass99" });
    assert.equal(wrong.status, 400);
  }
  const locked = await resetConfirm({ email: lockedUser.email, code: "000000", newPassword: "NewPass99", confirmPassword: "NewPass99" });
  assert.equal(locked.status, 429);
  assert.match((await locked.json()).message, /too many incorrect/i);
});

test("password reset enforces confirmation, strength, single use, session revocation, and username login", async () => {
  const user = await createUser({ username: "ResetAlias", email: "alias.reset@example.test", password: "OldPass99" });
  const oldLogin = await login({ identifier: user.username, password: "OldPass99" });
  assert.equal(oldLogin.status, 200);
  const oldSession = await oldLogin.json();

  clearCapturedEmails();
  assert.equal((await resetRequest(user.email)).status, 200);
  const { code } = readCodeFromLatestEmail();

  const mismatch = await resetConfirm({ email: user.email, code, newPassword: "NewPass99", confirmPassword: "Different99" });
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).message, "The passwords do not match.");

  const weak = await resetConfirm({ email: user.email, code, newPassword: "password", confirmPassword: "password" });
  assert.equal(weak.status, 400);
  assert.match((await weak.json()).message, /letter and a number/i);

  const success = await resetConfirm({ email: user.email, code, newPassword: "FreshPass99", confirmPassword: "FreshPass99" });
  const successBody = await success.json();
  assert.equal(success.status, 200, successBody.message);
  assert.equal(successBody.message, "Your password has been changed. You can now sign in.");

  assert.equal((await login({ identifier: user.email, password: "OldPass99" })).status, 401);
  assert.equal((await login({ identifier: " resetalias ", password: "FreshPass99" })).status, 200);

  const reused = await resetConfirm({ email: user.email, code, newPassword: "AgainPass99", confirmPassword: "AgainPass99" });
  assert.equal(reused.status, 400);

  const meWithOldToken = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${oldSession.token}` },
  });
  assert.equal(meWithOldToken.status, 401);

  const latest = await get(
    `SELECT used_at
     FROM otp_codes
     WHERE user_id = ? AND purpose = 'password_reset'
     ORDER BY id DESC
     LIMIT 1`,
    [user.id]
  );
  assert.ok(latest?.used_at, "successful reset should mark the code used");
});

test("disabled accounts receive a neutral request response and cannot reset with a guessed code", async () => {
  const user = await createUser({
    username: "DisabledReset",
    email: "disabled.reset@example.test",
    status: "disabled",
  });
  clearCapturedEmails();
  const request = await resetRequest(user.email);
  assert.equal(request.status, 200);
  assert.deepEqual(fs.readdirSync(emailCaptureDir), []);

  const confirm = await resetConfirm({ email: user.email, code: "123456", newPassword: "NewPass99", confirmPassword: "NewPass99" });
  assert.equal(confirm.status, 400);
  assert.equal((await confirm.json()).message, "This code is invalid or has expired. Request a new code.");
});

test("email delivery failure produces a safe message without provider details", async () => {
  const previousCaptureDir = process.env.EMAIL_CAPTURE_DIR;
  const user = await createUser({ username: "EmailFailReset", email: "email.fail.reset@example.test" });
  process.env.EMAIL_CAPTURE_DIR = "";
  try {
    const res = await resetRequest(user.email);
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.code, "EMAIL_DELIVERY_UNAVAILABLE");
    assert.equal(body.message, "We could not send the reset email. Please try again shortly.");
    assert.doesNotMatch(JSON.stringify(body), /resend|api key|stack|firebase|database/i);
  } finally {
    process.env.EMAIL_CAPTURE_DIR = previousCaptureDir;
  }
});
