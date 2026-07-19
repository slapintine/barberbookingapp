import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-summary-free-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "subscription-summary-free-test-secret";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "summary-free.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let db;
let initDb;
let run;
let buildSubscriptionSummary;
let userSeq = 0;

async function createUser(role = "customer") {
  userSeq += 1;
  const username = `summary_free_${userSeq}`;
  const result = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, 'not-used', ?, 'active')`,
    [username, role]
  );
  return { id: result.lastID, username };
}

async function createProvider(userId, fields = {}) {
  const result = await run(
    `INSERT INTO barbers
       (owner_user_id, business_name, normalized_business_name, location, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, ?, ?, 'Kampala', 'draft', 0, ?, ?)`,
    [
      userId,
      fields.business_name || `Free Summary Stand ${userId}`,
      String(fields.business_name || `Free Summary Stand ${userId}`).toLowerCase(),
      fields.subscription_tier ?? null,
      fields.subscription_status || "none",
    ]
  );
  return result.lastID;
}

test.before(async () => {
  ({ default: db } = await import("./config/db.js"));
  ({ initDb } = await import("./db/initDb.js"));
  ({ run } = await import("./db/query.js"));
  ({ buildSubscriptionSummary } = await import("./services/subscriptionSummaryService.js"));
  await initDb();
});

test.after(async () => {
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("new customer resolves to Free Customer without unlocking Premium", async () => {
  const user = await createUser("customer");
  const summary = await buildSubscriptionSummary(user.id);

  assert.equal(summary.customerPlan, "FREE");
  assert.equal(summary.customerPremiumActive, false);
  assert.equal(summary.customer.displayName, "Free Customer");
  assert.equal(summary.entitlements.smartMatch, false);
  assert.deepEqual(
    summary.badges.filter((badge) => badge.scope === "customer").map((badge) => badge.label),
    ["Free Customer"]
  );
});

test("provider with no paid subscription resolves to Free Provider", async () => {
  const user = await createUser("barber");
  await createProvider(user.id);

  const summary = await buildSubscriptionSummary(user.id);

  assert.equal(summary.providerPlan, "FREE");
  assert.equal(summary.providerPlanActive, true);
  assert.equal(summary.provider.tier, "FREE");
  assert.equal(summary.provider.status, "free");
  assert.equal(summary.provider.displayName, "Free Provider");
  assert.equal(summary.entitlements.providerCoach, false);
  assert.equal(summary.entitlements.advancedReports, false);
  assert.deepEqual(
    summary.badges.filter((badge) => badge.scope === "provider").map((badge) => badge.label),
    ["Free Provider"]
  );
});

test("expired paid customer and provider plans resolve to Free without downgrading records", async () => {
  const user = await createUser("barber");
  const barberId = await createProvider(user.id, {
    subscription_tier: "PLATINUM",
    subscription_status: "active",
  });
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await run(
    `INSERT INTO customer_subscriptions
       (user_id, tier, status, payment_status, expires_at, amount_paid)
     VALUES (?, 'PREMIUM', 'active', 'paid', ?, 10000)`,
    [user.id, past]
  );
  await run(
    `INSERT INTO barber_subscriptions
       (barber_id, tier, status, payment_status, is_active, expires_at, amount_paid)
     VALUES (?, 'PLATINUM', 'active', 'paid', 1, ?, 24000)`,
    [barberId, past]
  );

  const summary = await buildSubscriptionSummary(user.id);

  assert.equal(summary.customerPlan, "FREE");
  assert.equal(summary.customerPremiumActive, false);
  assert.equal(summary.providerPlan, "FREE");
  assert.equal(summary.provider.tier, "FREE");
  assert.equal(summary.provider.status, "free");
  assert.equal(summary.provider.displayName, "Free Provider");
  assert.equal(summary.entitlements.smartMatch, false);
  assert.equal(summary.entitlements.providerCoach, false);
});

test("active paid customer and provider plans remain independent", async () => {
  const user = await createUser("barber");
  const barberId = await createProvider(user.id, {
    subscription_tier: "FREE",
    subscription_status: "free",
  });
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await run(
    `INSERT INTO customer_subscriptions
       (user_id, tier, status, payment_status, expires_at, amount_paid)
     VALUES (?, 'PREMIUM', 'active', 'paid', ?, 10000)`,
    [user.id, future]
  );
  await run(
    `INSERT INTO barber_subscriptions
       (barber_id, tier, status, payment_status, is_active, expires_at, amount_paid)
     VALUES (?, 'PLATINUM', 'active', 'paid', 1, ?, 24000)`,
    [barberId, future]
  );

  const summary = await buildSubscriptionSummary(user.id);

  assert.equal(summary.customerPlan, "PREMIUM");
  assert.equal(summary.providerPlan, "PLATINUM");
  assert.equal(summary.customerPremiumActive, true);
  assert.equal(summary.providerPlanActive, true);
  assert.equal(summary.provider.displayName, "Platinum Provider");
  assert.equal(summary.entitlements.smartMatch, true);
  assert.equal(summary.entitlements.providerCoach, true);
});
