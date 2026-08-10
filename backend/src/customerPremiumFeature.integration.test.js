import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-slot-alerts-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "slot-alert-test-secret-at-least-32-characters-long";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "slot-alerts.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let server;
let baseUrl;
let premiumToken;
let freeToken;
let otherToken;
let premiumUserId;
let otherUserId;
let providerId;
let serviceId;
let alternateServiceId;
let bookingId;

function request(pathname, { method = "GET", body, token = premiumToken } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function post(pathname, body, token) {
  return request(pathname, { method: "POST", body, token });
}

async function runSql(sql, params = []) {
  await new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

async function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

async function register(username, email, password = "Passw0rd!") {
  const response = await post("/api/auth/register", { username, email, password }, "");
  const body = await response.json();
  assert.equal(response.status, 201, `register ${username}`);
  return { token: body.token, userId: body.user?.id };
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  const { initDb } = await import("./db/initDb.js");
  await initDb();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const premium = await register("slotpremium", "slot-premium@example.com");
  const free = await register("slotfree", "slot-free@example.com");
  const other = await register("slotother", "slot-other@example.com");
  premiumToken = premium.token;
  freeToken = free.token;
  otherToken = other.token;
  premiumUserId = premium.userId;
  otherUserId = other.userId;

  const providerUser = await register("slotprovider", "slot-provider@example.com");
  await runSql(`UPDATE users SET role = 'barber' WHERE id = ?`, [providerUser.userId]);
  await runSql(
    `INSERT INTO barbers
     (owner_user_id, business_name, location, business_type, price_from, business_status, is_published, is_demo, subscription_status)
     VALUES (?, 'Slot Alert Studio', 'Nakwero', 'barber', 5000, 'active', 1, 0, 'active')`,
    [providerUser.userId]
  );
  providerId = (await getSql(`SELECT id FROM barbers WHERE owner_user_id = ?`, [providerUser.userId])).id;
  await runSql(
    `INSERT INTO barber_services
     (barber_id, service_name, category, price_extra, duration_minutes, is_available)
     VALUES (?, 'Earlier Service', 'Barber', 18000, 45, 1)`,
    [providerId]
  );
  serviceId = (await getSql(`SELECT id FROM barber_services WHERE barber_id = ?`, [providerId])).id;
  await runSql(
    `INSERT INTO barber_services
     (barber_id, service_name, category, price_extra, duration_minutes, is_available)
     VALUES (?, 'Different Earlier Service', 'Barber', 28000, 30, 1)`,
    [providerId]
  );
  alternateServiceId = (await getSql(`SELECT id FROM barber_services WHERE barber_id = ? AND service_name = 'Different Earlier Service'`, [providerId])).id;
  await runSql(
    `INSERT INTO customer_subscriptions
     (user_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, expires_at, activated_at)
     VALUES (?, 'PREMIUM', 10000, 'active', 'monthly', 10000, 'UGX', 'paid', ?, CURRENT_TIMESTAMP)`,
    [premiumUserId, new Date(Date.now() + 86400000 * 30).toISOString()]
  );
  await runSql(
    `INSERT INTO bookings
     (barber_id, customer_user_id, service_name, booking_date, booking_time, price, service_duration_minutes, status, booking_details_json)
     VALUES (?, ?, 'Earlier Service', ?, '16:00', 23000, 45, 'confirmed', ?)`,
    [
      providerId,
      premiumUserId,
      new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
      JSON.stringify({ serviceId }),
    ]
  );
  bookingId = (await getSql(`SELECT id FROM bookings WHERE customer_user_id = ?`, [premiumUserId])).id;
  await runSql(
    `INSERT INTO bookings
     (barber_id, customer_user_id, service_name, booking_date, booking_time, price, service_duration_minutes, status, booking_details_json)
     VALUES (?, ?, 'Earlier Service', ?, '17:00', 23000, 45, 'confirmed', ?)`,
    [
      providerId,
      otherUserId,
      new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
      JSON.stringify({ serviceId }),
    ]
  );
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore temp cleanup locks */ }
});

function validPayload(patch = {}) {
  const targetDate = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
  return {
    existingBookingId: bookingId,
    providerId,
    serviceId,
    desiredStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    desiredEndDate: targetDate,
    preferredStartTime: "08:00",
    preferredEndTime: "15:00",
    currentBookingDate: targetDate,
    currentBookingTime: "16:00",
    notificationPreference: "in_app",
    ...patch,
  };
}

test("eligible Customer Premium booking can create and list an earlier-slot alert", async () => {
  const response = await post("/api/customer-premium/slot-alerts", validPayload());
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(Number(body.alert.provider_id), providerId);
  assert.equal(Number(body.alert.service_id), serviceId);
  assert.equal(Number(body.alert.existing_booking_id), bookingId);
  assert.equal(body.delivery, "in_app");

  const listResponse = await request("/api/customer-premium/slot-alerts");
  const listBody = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listBody.alerts.length, 1);
});

test("duplicate active alert is rejected safely", async () => {
  const response = await post("/api/customer-premium/slot-alerts", validPayload());
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.code, "DUPLICATE_ALERT");
});

test("Free customer cannot create premium earlier-slot alert", async () => {
  const response = await post("/api/customer-premium/slot-alerts", validPayload({ desiredStartDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10) }), freeToken);
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "CUSTOMER_PREMIUM_REQUIRED");
});

test("non-owner cannot attach an alert to another customer's booking", async () => {
  await runSql(
    `INSERT INTO customer_subscriptions
     (user_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, expires_at, activated_at)
     VALUES (?, 'PREMIUM', 10000, 'active', 'monthly', 10000, 'UGX', 'paid', ?, CURRENT_TIMESTAMP)`,
    [otherUserId, new Date(Date.now() + 86400000 * 30).toISOString()]
  );
  const response = await post("/api/customer-premium/slot-alerts", validPayload({ preferredStartTime: "09:00" }), otherToken);
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.match(body.message, /own bookings/i);
});

test("invalid time window is rejected before persistence", async () => {
  const response = await post("/api/customer-premium/slot-alerts", validPayload({
    preferredStartTime: "15:00",
    preferredEndTime: "15:00",
  }));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.message, /end time/i);
});

test("service context must match the selected booking", async () => {
  const response = await post("/api/customer-premium/slot-alerts", validPayload({
    serviceId: alternateServiceId,
    desiredStartDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
  }));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, "SERVICE_CONTEXT_MISMATCH");
});

test("active earlier-slot alert limit is enforced", async () => {
  await runSql(`UPDATE customer_slot_alerts SET status = 'cancelled' WHERE customer_user_id = ?`, [premiumUserId]);
  const targetDate = new Date(Date.now() + 86400000 * 9).toISOString().slice(0, 10);
  for (let index = 0; index < 10; index += 1) {
    await runSql(
      `INSERT INTO customer_slot_alerts
       (customer_user_id, existing_booking_id, provider_id, service_id, desired_start_date, desired_end_date,
        preferred_time_start, preferred_time_end, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`,
      [
        premiumUserId,
        bookingId,
        providerId,
        serviceId,
        new Date(Date.now() + 86400000 * (2 + index)).toISOString().slice(0, 10),
        targetDate,
        `${String(7 + index).padStart(2, "0")}:00`,
        `${String(8 + index).padStart(2, "0")}:00`,
        `${targetDate}T20:00:00+03:00`,
      ]
    );
  }

  const response = await post("/api/customer-premium/slot-alerts", validPayload({
    preferredStartTime: "06:00",
    preferredEndTime: "07:00",
  }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "ALERT_LIMIT_REACHED");
});

test("alert can be cancelled and no longer counts as active duplicate", async () => {
  await runSql(`UPDATE customer_slot_alerts SET status = 'cancelled' WHERE customer_user_id = ?`, [premiumUserId]);
  const seedResponse = await post("/api/customer-premium/slot-alerts", validPayload());
  assert.equal(seedResponse.status, 201);
  const seeded = await getSql(`SELECT id FROM customer_slot_alerts WHERE customer_user_id = ? AND status = 'active' ORDER BY id DESC`, [premiumUserId]);
  const cancelResponse = await request(`/api/customer-premium/slot-alerts/${seeded.id}`, { method: "DELETE" });
  const cancelBody = await cancelResponse.json();
  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.alert.status, "cancelled");

  const recreateResponse = await post("/api/customer-premium/slot-alerts", validPayload());
  assert.equal(recreateResponse.status, 201);
});
