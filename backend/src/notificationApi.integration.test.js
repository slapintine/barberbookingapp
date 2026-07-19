import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-notifications-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "notification-api-test-secret-at-least-32-chars";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "notifications.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let run;
let get;
let createAuthSession;
let server;
let baseUrl;
let token;
let userId;
let otherToken;
let otherUserId;

async function req(pathname, { method = "GET", body, authToken = token } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run, get } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  await initDb();

  const user = await run(
    `INSERT INTO users (username, password_hash, role, account_status) VALUES ('notif_user', 'x', 'customer', 'active')`
  );
  userId = user.lastID;
  const other = await run(
    `INSERT INTO users (username, password_hash, role, account_status) VALUES ('notif_other', 'x', 'customer', 'active')`
  );
  otherUserId = other.lastID;

  const session = await createAuthSession(
    { id: userId, username: "notif_user", role: "customer" },
    { userAgent: "notif", ipAddress: "127.0.0.1" }
  );
  token = session.token;
  const otherSession = await createAuthSession(
    { id: other.lastID, username: "notif_other", role: "customer" },
    { userAgent: "notif", ipAddress: "127.0.0.1" }
  );
  otherToken = otherSession.token;

  await run(
    `INSERT INTO notifications (user_id, title, type, message, barber_id, customer_user_id, customer_username, barber_owner_username, read, created_at)
     VALUES (?, 'Booking update', 'booking', 'Your booking changed.', 7, ?, 'notif_user', 'provider_one', 0, CURRENT_TIMESTAMP)`,
    [userId, userId]
  );
  await run(
    `INSERT INTO notifications (user_id, title, type, message, read, created_at)
     VALUES (?, 'Message', 'message', 'A provider sent you a message.', 0, CURRENT_TIMESTAMP)`,
    [userId]
  );
  await run(
    `INSERT INTO notifications (user_id, title, type, message, read, created_at)
     VALUES (?, 'Private', 'system', 'Other user only.', 0, CURRENT_TIMESTAMP)`,
    [other.lastID]
  );

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("notification list is scoped, paginated, and normalized", async () => {
  const res = await req("/api/notifications/me?limit=1&page=1");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.limit, 1);
  assert.equal(body.notifications.length, 1);
  assert.equal(body.unreadCount, 2);
  assert.equal(body.notifications[0].userId, userId);
  assert.ok(Object.hasOwn(body.notifications[0], "createdAt"));
  assert.ok(!JSON.stringify(body).includes("Other user only."));
});

test("unread count and mark-all-read persist for the authenticated user only", async () => {
  const count = await req("/api/notifications/unread-count");
  assert.equal(count.status, 200);
  assert.equal((await count.json()).unreadCount, 2);

  const markAll = await req("/api/notifications/read-all", { method: "PATCH" });
  assert.equal(markAll.status, 200);
  assert.equal((await markAll.json()).updated, 2);

  const nextCount = await req("/api/notifications/unread-count");
  assert.equal((await nextCount.json()).unreadCount, 0);

  const otherCount = await req("/api/notifications/unread-count", { authToken: otherToken });
  assert.equal((await otherCount.json()).unreadCount, 1);
});

test("invalid or cross-user notification IDs return calm errors", async () => {
  const invalid = await req("/api/notifications/nope/read", { method: "PATCH" });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).message, "We could not open this notification.");

  const missing = await req("/api/notifications/9999/read", { method: "PATCH" });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).message, "This notification is no longer available.");
}
);

test("notification token status is scoped to the authenticated user", async () => {
  const deviceToken = "test-device-token-12345";

  const before = await req("/api/notifications/token-status", {
    method: "POST",
    body: { token: deviceToken },
  });
  assert.equal(before.status, 200);
  assert.equal((await before.json()).registered, false);

  const register = await req("/api/notifications/register-token", {
    method: "POST",
    body: { token: deviceToken, platform: "android", browser: "Capacitor", deviceLabel: "QA phone" },
  });
  assert.equal(register.status, 200);

  const status = await req("/api/notifications/token-status", {
    method: "POST",
    body: { token: deviceToken },
  });
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.registered, true);
  assert.equal(statusBody.platform, "android");
  assert.ok(!JSON.stringify(statusBody).includes(deviceToken));

  const otherStatus = await req("/api/notifications/token-status", {
    method: "POST",
    authToken: otherToken,
    body: { token: deviceToken },
  });
  assert.equal(otherStatus.status, 200);
  const otherBody = await otherStatus.json();
  assert.equal(otherBody.registered, false);
  assert.equal(otherBody.assignedToAnotherUser, true);

  const unregister = await req("/api/notifications/unregister-token", {
    method: "POST",
    body: { token: deviceToken },
  });
  assert.equal(unregister.status, 200);

  const after = await req("/api/notifications/token-status", {
    method: "POST",
    body: { token: deviceToken },
  });
  assert.equal(after.status, 200);
  assert.equal((await after.json()).registered, false);

  const count = await get(
    `SELECT COUNT(*) AS count FROM notification_tokens WHERE token = ? AND user_id IN (?, ?)`,
    [deviceToken, userId, otherUserId]
  );
  assert.equal(count.count, 0);
});
