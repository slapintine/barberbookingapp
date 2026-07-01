import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// End-to-end checks for the centralized validateRequest gate: bad payloads are
// rejected with a safe 400 before controller logic runs, valid/diff-only payloads
// still pass through, and no internals leak.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-reqval-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "request-validation-test-secret-at-least-32-chars";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "reqval.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let run;
let createAuthSession;
let server;
let baseUrl;
let token;
let userId;

async function req(pathname, { method = "POST", body, auth = true } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  await initDb();
  const u = await run(
    `INSERT INTO users (username, password_hash, role, account_status) VALUES ('reqval', 'x', 'customer', 'active')`
  );
  userId = u.lastID;
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '', 'reqval@example.test', '', '')`,
    [userId]
  );
  const session = await createAuthSession(
    { id: userId, username: "reqval", role: "customer" },
    { userAgent: "reqval", ipAddress: "127.0.0.1" }
  );
  token = session.token;
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("register rejects a missing password with a safe 400 (no internals)", async () => {
  const res = await req("/api/auth/register", { auth: false, body: { username: "ab", email: "x@y.z" } });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.success, false);
  assert.ok(Array.isArray(body.errors));
  const blob = JSON.stringify(body).toLowerCase();
  assert.ok(!/stack|at \/|\.js:|select |sqlite|postgres|node_modules/.test(blob), "must not leak internals");
});

test("login rejects an empty payload before reaching credential logic", async () => {
  const res = await req("/api/auth/login", { auth: false, body: {} });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("review create rejects an out-of-range rating", async () => {
  const res = await req("/api/reviews", { body: { barberId: 1, rating: 9 } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("message send rejects an empty text", async () => {
  const res = await req("/api/messages", { body: { barberId: 1, customerUsername: "reqval", text: "" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("notification register rejects a too-short token", async () => {
  const res = await req("/api/notifications/register-token", { body: { token: "short" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("display fields reject embedded HTML/script", async () => {
  const res = await req("/api/profiles/me", { method: "PUT", body: { full_name: "<script>alert(1)</script>" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("stand draft save with partial data is NOT rejected and does not erase data", async () => {
  // Create a draft with a name + location.
  const create = await req("/api/barbers/register", {
    body: { business_name: "Reqval Stand", location: "Kampala", submit_intent: "draft" },
  });
  assert.equal(create.status, 201);

  // A later diff-only save that omits business_name/location must pass validation
  // (optional fields) and must not wipe the saved values.
  const update = await req("/api/barbers/me", { method: "PATCH", body: { intro_text: "Just a note", submit_intent: "draft" } });
  assert.equal(update.status, 200, "partial draft save should be accepted");
  const after = (await update.json()).barber;
  assert.equal(after.business_name, "Reqval Stand", "name must be preserved");
  assert.equal(after.location, "Kampala", "location must be preserved");
});

test("stand draft save rejects an oversized text field safely", async () => {
  const huge = "a".repeat(6000); // intro_text cap is 5000
  const res = await req("/api/barbers/me", { method: "PATCH", body: { intro_text: huge, submit_intent: "draft" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});
