import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-services-only-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "services-only-test-secret-at-least-32-chars";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "services-only.sqlite");
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

async function req(pathname, { method = "GET", body, auth = true } = {}) {
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
  ({ run, get } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  await initDb();
  const user = await run(
    `INSERT INTO users (username, password_hash, role, account_status) VALUES ('services_only', 'x', 'customer', 'active')`
  );
  userId = user.lastID;
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '+256700000000', 'services-only@example.test', 'Kampala', '')`,
    [userId]
  );
  const session = await createAuthSession(
    { id: userId, username: "services_only", role: "customer" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
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

test("product service-commerce endpoints are not mounted", async () => {
  for (const pathname of ["/api/products", "/api/product-orders", "/api/product-inquiries"]) {
    const response = await req(pathname, { auth: false });
    assert.equal(response.status, 404, `${pathname} should return 404`);
  }
});

test("provider registration rejects current product or hybrid submissions", async () => {
  const response = await req("/api/barbers/register", {
    method: "POST",
    body: {
      business_name: "Services Only Stand",
      business_type: "Home Services",
      location: "Kampala",
      phone: "+256700000000",
      stand_type: "shop",
      marketplace_mode: "hybrid",
      services: [{ service_name: "Consultation", price_extra: 15000, duration_minutes: 30 }],
      submit_intent: "draft",
    },
  });
  assert.equal(response.status, 400);
});

test("provider registration creates service-only providers without product requirements", async () => {
  const response = await req("/api/barbers/register", {
    method: "POST",
    body: {
      business_name: "Services Only Stand",
      business_type: "Home Services",
      location: "Kampala",
      phone: "+256700000000",
      services: [{ service_name: "Consultation", price_extra: 15000, duration_minutes: 30 }],
      submit_intent: "draft",
    },
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(Object.hasOwn(body.barber, "marketplace_mode"), false);
  assert.equal(Object.hasOwn(body.barber, "marketplaceMode"), false);
  assert.equal(body.barber.stand_type, "individual");

  const saved = await get(`SELECT marketplace_mode, stand_type FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.equal(saved.marketplace_mode, "service");
  assert.equal(saved.stand_type, "individual");
});

test("subscription tier definitions contain no product limits", async () => {
  const { SUBSCRIPTION_TIERS } = await import("./services/paymentService.js");
  const blob = JSON.stringify(SUBSCRIPTION_TIERS);
  assert.equal(/productLimit|productImageLimit|product listing|product publishing/i.test(blob), false);
});
