import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-audit-int-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "audit-int-test-secret-at-least-32-characters";
process.env.AUDIT_LOG_SALT = "int-test-salt";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "audit-int.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let run;
let all;
let createAuthSession;
let recordAuditEvent;
let AUDIT_EVENTS;
let server;
let baseUrl;
let adminToken;
let customerToken;

function req(pathname, { method = "GET", body, token } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run, all } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  ({ recordAuditEvent, AUDIT_EVENTS } = await import("./services/auditLogService.js"));
  await initDb();

  const admin = await run(`INSERT INTO users (username, password_hash, role, account_status) VALUES ('audit_admin', 'x', 'admin', 'active')`);
  await run(`INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '', 'audit_admin@example.test', '', '')`, [admin.lastID]);
  adminToken = (await createAuthSession({ id: admin.lastID, username: "audit_admin", role: "admin" }, { userAgent: "t", ipAddress: "127.0.0.1" })).token;

  const cust = await run(`INSERT INTO users (username, password_hash, role, account_status) VALUES ('audit_cust', 'x', 'customer', 'active')`);
  await run(`INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '', 'audit_cust@example.test', '', '')`, [cust.lastID]);
  customerToken = (await createAuthSession({ id: cust.lastID, username: "audit_cust", role: "customer" }, { userAgent: "t", ipAddress: "127.0.0.1" })).token;

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("login success writes a LOGIN_SUCCESS audit row with hashed IP and no secrets", async () => {
  // Register then log in through the real routes so controller wiring is exercised.
  await req("/api/auth/register", { method: "POST", body: { username: "audit_login", email: "audit_login@example.test", password: "Password123" } });
  const res = await req("/api/auth/login", { method: "POST", body: { username: "audit_login", password: "Password123" } });
  assert.equal(res.status, 200);

  const rows = await all(`SELECT * FROM security_audit_logs WHERE event_type = ? ORDER BY id DESC`, [AUDIT_EVENTS.LOGIN_SUCCESS]);
  assert.ok(rows.length >= 1, "a login success event should be recorded");
  const row = rows[0];
  assert.equal(row.event_type, "auth.login.success");
  assert.ok(row.actor_user_id, "actor should be set");
  assert.ok(row.ip_hash && row.ip_hash !== "127.0.0.1", "ip must be hashed, not raw");
  const blob = `${row.metadata}`;
  assert.ok(!/Password123|password|token/i.test(blob), "no secrets in metadata");
});

test("a recorded admin subscription change is redacted and readable via the admin endpoint", async () => {
  await recordAuditEvent({
    eventType: AUDIT_EVENTS.ADMIN_CUSTOMER_SUBSCRIPTION_CHANGED,
    actorUserId: 1,
    actorRole: "admin",
    targetType: "customer",
    targetId: 42,
    metadata: { plan: "PREMIUM", status: "active", password: "should-not-store", token: "abc.def" },
  });

  const res = await req(`/api/admin/security-audit-logs?event_type=${AUDIT_EVENTS.ADMIN_CUSTOMER_SUBSCRIPTION_CHANGED}`, { token: adminToken });
  assert.equal(res.status, 200);
  const body = await res.json();
  const found = body.logs.find((l) => String(l.target_id) === "42");
  assert.ok(found, "the admin change should be listed");
  assert.equal(found.metadata.plan, "PREMIUM");
  assert.equal(found.metadata.status, "active");
  assert.equal(found.metadata.password, "[redacted]");
  assert.equal(found.metadata.token, "[redacted]");
  assert.ok(!/should-not-store|abc\.def/.test(JSON.stringify(body)), "raw secret values must never be returned");
});

test("non-admin cannot read the audit log", async () => {
  const res = await req("/api/admin/security-audit-logs", { token: customerToken });
  assert.equal(res.status, 403);
});

test("admin can read the audit log with pagination", async () => {
  const res = await req("/api/admin/security-audit-logs?page=1&pageSize=5", { token: adminToken });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 5);
  assert.ok(typeof body.total === "number");
  assert.ok(Array.isArray(body.logs));
  assert.ok(body.logs.length <= 5);
});

test("invalid audit-log query filters are rejected safely", async () => {
  const res = await req("/api/admin/security-audit-logs?actor_user_id=not-a-number", { token: adminToken });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.ok(!/stack|sqlite|select |node_modules/i.test(JSON.stringify(body)));
});
