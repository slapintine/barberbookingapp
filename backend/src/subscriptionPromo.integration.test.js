import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-subscription-promo-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "subscription-promo-test-secret-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "subscription-promo.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DEV_CLIENT_URL = "http://127.0.0.1:5173";
process.env.PROVIDER_PROMO_FREE_CODE = "FREE100";
process.env.PROVIDER_PROMO_20_CODE = "TWENTY20";
process.env.CUSTOMER_PREMIUM_PROMO_FREE_CODE = "CUSTOMER100";

let app;
let db;
let env;
let initDb;
let run;
let get;
let createAuthSession;
let server;
let baseUrl;
let userIndex = 0;

async function request(pathname, { token = "", ...options } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function createProvider() {
  userIndex += 1;
  const username = `promo_provider_${userIndex}`;
  const userResult = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, 'not-used', 'customer', 'active')`,
    [username]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, '', '+256700123456', ?, '', '')`,
    [userResult.lastID, `${username}@example.test`]
  );
  const session = await createAuthSession(
    { id: userResult.lastID, username, role: "customer" },
    { userAgent: "subscription promo integration test", ipAddress: "127.0.0.1" }
  );
  const createResponse = await request("/api/barbers/register", {
    token: session.token,
    method: "POST",
    body: JSON.stringify({
      business_name: `Promo Stand ${userIndex}`,
      phone: "+256700123456",
      submit_intent: "draft",
    }),
  });
  assert.equal(createResponse.status, 201);
  return { token: session.token, userId: userResult.lastID };
}

async function upgrade(token, payload) {
  return request("/api/subscriptions/upgrade", {
    token,
    method: "POST",
    body: JSON.stringify({
      billingCycle: "monthly",
      provider: "promo",
      method: "promo",
      ...payload,
    }),
  });
}

async function latestSubscription(userId) {
  return get(
    `SELECT bs.*
     FROM barber_subscriptions bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.owner_user_id = ?
     ORDER BY bs.id DESC
     LIMIT 1`,
    [userId]
  );
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ env } = await import("./config/env.js"));
  ({ initDb } = await import("./db/initDb.js"));
  ({ run, get } = await import("./db/query.js"));
  ({ createAuthSession } = await import("./services/authSessionService.js"));

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

test("invalid provider promo code returns a clear validation failure", async () => {
  const provider = await createProvider();
  const response = await upgrade(provider.token, {
    tier: "PREMIUM",
    planId: "PREMIUM",
    promoCode: "NOPE",
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.code, "INVALID_PROMO_CODE");
  assert.match(body.message, /invalid promo code/i);
  assert.equal(await latestSubscription(provider.userId), null);
});

test("partial provider promo reports remaining balance and does not activate", async () => {
  const provider = await createProvider();
  const response = await upgrade(provider.token, {
    tier: "PREMIUM",
    planId: "PREMIUM",
    promoCode: "TWENTY20",
  });
  assert.equal(response.status, 402);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.code, "PARTIAL_PROMO_PAYMENT_COMING_SOON");
  assert.equal(body.details.fullyCovered, false);
  assert.equal(body.details.originalAmount, 12000);
  assert.equal(body.details.discountAmount, 2400);
  assert.equal(body.details.remainingAmount, 9600);
  assert.match(body.message, /remaining balance UGX 9,600/i);
  assert.equal(await latestSubscription(provider.userId), null);
});

test("100 percent provider promo activates selected paid plan immediately", async () => {
  const provider = await createProvider();
  const response = await upgrade(provider.token, {
    tier: "PLATINUM",
    planId: "PLATINUM",
    promoCode: "FREE100",
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.subscription.tier, "PLATINUM");
  assert.equal(body.subscription.status, "active");
  assert.equal(body.payment.provider, "promo");
  assert.equal(body.payment.amount, 0);
  assert.equal(body.promo.fullyCovered, true);
  assert.equal(body.activation.activatedImmediately, true);

  const subscription = await latestSubscription(provider.userId);
  assert.equal(subscription.tier, "PLATINUM");
  assert.equal(subscription.status, "active");
  assert.equal(Number(subscription.amount_paid), 0);
});

test("expired provider promo returns a specific friendly failure", async () => {
  const provider = await createProvider();
  const previousExpiry = env.providerPromoExpiresAt;
  env.providerPromoExpiresAt = "2020-01-01T00:00:00.000Z";
  try {
    const response = await upgrade(provider.token, {
      tier: "PREMIUM",
      planId: "PREMIUM",
      promoCode: "FREE100",
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "PROMO_CODE_EXPIRED");
    assert.match(body.message, /expired/i);
  } finally {
    env.providerPromoExpiresAt = previousExpiry;
  }
});

test("selected plan price mismatch is rejected before promo activation", async () => {
  const provider = await createProvider();
  const response = await upgrade(provider.token, {
    tier: "PREMIUM",
    planId: "PREMIUM",
    price: 1,
    promoCode: "FREE100",
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, "PLAN_PRICE_MISMATCH");
  assert.match(body.message, /choose a plan again/i);
  assert.equal(await latestSubscription(provider.userId), null);
});
