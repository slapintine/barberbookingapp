import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-security-"));
const dbPath = path.join(tempDir, "security.sqlite");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-security-secret-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = dbPath;
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DEV_CLIENT_URL = "http://127.0.0.1:5173";
process.env.MOBILE_MONEY_WEBHOOK_TOKEN = "test-webhook-token-at-least-32-chars";

let app;
let db;
let initDb;
let run;
let createAuthSession;
let server;
let baseUrl;
let fixtures;

async function insertUser(username, role) {
  const result = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, ?, ?, 'active')`,
    [username, "not-used-in-route-tests", role]
  );
  const user = {
    id: result.lastID,
    username,
    role,
  };
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, ?, ?, ?, '', '')`,
    [user.id, username, `07720000${user.id}`, `${username}@example.test`]
  );
  return user;
}

async function insertBusiness(owner, name) {
  const result = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, business_type, map_icon_type, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, ?, ?, 'Kampala', 'Services', 'services', 'active', 1, 'FREE', 'active')`,
    [owner.id, name, name.toLowerCase()]
  );
  return {
    id: result.lastID,
    owner_user_id: owner.id,
    business_name: name,
  };
}

async function seed() {
  const customerOne = await insertUser("customer_one", "customer");
  const customerTwo = await insertUser("customer_two", "customer");
  const providerOne = await insertUser("provider_one", "provider");
  const providerTwo = await insertUser("provider_two", "provider");
  const admin = await insertUser("admin_one", "admin");
  const businessOne = await insertBusiness(providerOne, "Provider One Services");
  const businessTwo = await insertBusiness(providerTwo, "Provider Two Services");

  await run(
    `INSERT INTO messages (barber_id, customer_user_id, sender_user_id, text)
     VALUES (?, ?, ?, ?)`,
    [businessOne.id, customerOne.id, customerOne.id, "Hello provider"]
  );

  fixtures = {
    customerOne,
    customerTwo,
    providerOne,
    providerTwo,
    admin,
    businessOne,
    businessTwo,
    tokens: {},
  };
  for (const user of [customerOne, customerTwo, providerOne, providerTwo, admin]) {
    const session = await createAuthSession(user, {
      userAgent: "Queless security integration test",
      ipAddress: "127.0.0.1",
    });
    fixtures.tokens[user.username] = session.token;
  }
}

function authHeaders(username) {
  return {
    Authorization: `Bearer ${fixtures.tokens[username]}`,
  };
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ initDb } = await import("./db/initDb.js"));
  ({ run } = await import("./db/query.js"));
  ({ createAuthSession } = await import("./services/authSessionService.js"));

  await initDb();
  await seed();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("guest public marketplace route loads without auth", async () => {
  const response = await request("/api/marketplace/categories");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.categories));
});

test("public provider discovery does not expose contact or owner ids", async () => {
  const response = await request("/api/marketplace/providers");
  assert.equal(response.status, 200);
  const body = await response.json();
  const provider = body.providers.find((item) => item.id === fixtures.businessOne.id);
  assert.ok(provider);
  assert.equal(Object.hasOwn(provider, "phone"), false);
  assert.equal(Object.hasOwn(provider, "email"), false);
  assert.equal(Object.hasOwn(provider, "user_id"), false);
});

test("unauthenticated private route returns 401", async () => {
  const response = await request("/api/bookings/me");
  assert.equal(response.status, 401);
});

test("customer cannot access provider wallet route", async () => {
  const response = await request("/api/wallet/me", {
    headers: authHeaders("customer_one"),
  });
  assert.equal(response.status, 403);
});

test("provider cannot manage another provider's reviews", async () => {
  const response = await request(`/api/reviews/barber/${fixtures.businessOne.id}/manage`, {
    headers: authHeaders("provider_two"),
  });
  assert.equal(response.status, 403);
});

test("customer cannot access another customer's messages", async () => {
  const response = await request(
    `/api/messages?barberId=${fixtures.businessOne.id}&customerUsername=customer_one`,
    {
      headers: authHeaders("customer_two"),
    }
  );
  assert.equal(response.status, 403);
});

test("payment webhook without trusted token is rejected", async () => {
  const response = await request("/api/payments/webhooks/mtn", {
    method: "POST",
    body: JSON.stringify({
      reference: "booking-test-reference",
      status: "successful",
    }),
  });
  assert.equal(response.status, 401);
});
