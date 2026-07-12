import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Follow-up validation coverage: wallet, admin, support/contact, account/password.
// Confirms the additive gate rejects clearly-invalid payloads with safe 400s,
// keeps role checks as the real security layer, and never leaks internals.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-reqval2-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "reqval2-test-secret-at-least-32-characters-long";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "reqval2.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let run;
let createAuthSession;
let server;
let baseUrl;
let customerToken;
let adminToken;

async function makeUser(username, role) {
  const u = await run(
    `INSERT INTO users (username, password_hash, role, account_status) VALUES (?, 'x', ?, 'active')`,
    [username, role]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '', ?, '', '')`,
    [u.lastID, `${username}@example.test`]
  );
  const session = await createAuthSession(
    { id: u.lastID, username, role },
    { userAgent: "reqval2", ipAddress: "127.0.0.1" }
  );
  return session.token;
}

function req(pathname, { method = "POST", body, token } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function assertNoLeak(bodyObj) {
  const blob = JSON.stringify(bodyObj).toLowerCase();
  assert.ok(!/stack|\.js:|\bat \/|select |insert |sqlite|postgres|node_modules|\/users\//.test(blob), "must not leak internals");
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  await initDb();
  customerToken = await makeUser("reqval2_customer", "customer");
  adminToken = await makeUser("reqval2_admin", "admin");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("wallet top-up rejects a non-positive amount", async () => {
  const res = await req("/api/wallet/top-up", { token: customerToken, body: { amount: -50 } });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_ERROR");
  assertNoLeak(body);
});

test("wallet top-up rejects a non-numeric amount", async () => {
  const res = await req("/api/wallet/top-up", { token: customerToken, body: { amount: "abc" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("wallet top-up with a valid amount is NOT rejected by the gate", async () => {
  const res = await req("/api/wallet/top-up", { token: customerToken, body: { amount: 5000 } });
  // The controller may return success or a coming-soon/business response, but the
  // gate must not reject a well-formed amount as a validation error.
  if (res.status === 400) {
    assert.notEqual((await res.json()).code, "VALIDATION_ERROR");
  }
});

test("non-admin cannot reach admin mutation routes (role check runs before validation)", async () => {
  const res = await req("/api/admin/businesses/1", { method: "PATCH", token: customerToken, body: { status: "active" } });
  assert.equal(res.status, 403);
});

test("admin announcement rejects HTML/script in the title", async () => {
  const res = await req("/api/admin/notifications/announcement", {
    token: adminToken,
    body: { title: "<script>alert(1)</script>", message: "Maintenance tonight" },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("admin subscription route rejects a non-numeric id param", async () => {
  const res = await req("/api/admin/customers/not-a-number/subscription", { method: "PATCH", token: adminToken, body: { plan: "PREMIUM" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("support request rejects HTML/script in the message", async () => {
  const res = await req("/api/discovery/support-requests", {
    token: customerToken,
    body: { contact: "help@example.test", message: "<script>steal()</script> please help me with this" },
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_ERROR");
  assertNoLeak(body);
});

test("support request rejects a too-short message", async () => {
  const res = await req("/api/discovery/support-requests", {
    token: customerToken,
    body: { contact: "help@example.test", message: "hi" },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("account update enforces the minimum password policy (8+ chars)", async () => {
  const res = await req("/api/auth/me", { method: "PATCH", token: customerToken, body: { currentPassword: "whatever", newPassword: "short" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});
