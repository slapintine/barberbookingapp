import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-customer-subscription-"));
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "customer-subscription.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.JWT_SECRET = "customer-subscription-test-secret-32-characters";

let db;
let getActiveCustomerPremiumSubscription;
let isActiveCustomerPremium;
let mapCustomerSubscription;
let isActiveProviderPlatinum;

test.before(async () => {
  ({ default: db } = await import("../config/db.js"));
  const subscriptionService = await import("./customerSubscriptionService.js");
  const providerSubscriptionAccess = await import("./providerSubscriptionAccess.js");
  getActiveCustomerPremiumSubscription = subscriptionService.getActiveCustomerPremiumSubscription;
  isActiveCustomerPremium = subscriptionService.isActiveCustomerPremium;
  mapCustomerSubscription = subscriptionService.mapCustomerSubscription;
  isActiveProviderPlatinum = providerSubscriptionAccess.isActiveProviderPlatinum;
  const { initDb } = await import("../db/initDb.js");
  await initDb();
});

test.after(async () => {
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore temp cleanup locks */ }
});

test("customer Premium requires active paid Premium subscription", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isActiveCustomerPremium({ tier: "PREMIUM", status: "active", payment_status: "paid", expires_at: future }), true);
  assert.equal(isActiveCustomerPremium({ tier: "PREMIUM", status: "pending", payment_status: "pending", expires_at: future }), false);
  assert.equal(isActiveCustomerPremium({ tier: "PLATINUM", status: "active", payment_status: "paid", expires_at: future }), false);
  assert.equal(isActiveCustomerPremium({ tier: "PREMIUM", status: "active", payment_status: "pending", expires_at: future }), false);
  assert.equal(isActiveCustomerPremium({ tier: "PREMIUM", status: "active", payment_status: "paid", expires_at: past }), false);
  assert.equal(isActiveCustomerPremium({ tier: "PREMIUM", status: "active", payment_status: "paid", expires_at: null }), false);
  assert.equal(isActiveCustomerPremium({ tier: "PREMIUM", status: "trialing", payment_status: "trial", expires_at: future }), true);
});

test("free customer state does not unlock Smart Match", () => {
  const mapped = mapCustomerSubscription(null);
  assert.equal(mapped.tier, "FREE");
  assert.equal(mapped.features.smartMatch, false);
});

test("customer Premium lookup tolerates omitted database client", async () => {
  const subscription = await getActiveCustomerPremiumSubscription(-1);
  assert.equal(subscription, null);
});

test("provider Platinum check is separate from customer Premium", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isActiveProviderPlatinum({ selected_plan: "PLATINUM" }, { tier: "PLATINUM", status: "active", payment_status: "paid", is_active: 1, expires_at: future }), true);
  assert.equal(isActiveProviderPlatinum({ selected_plan: "PREMIUM" }, { tier: "PREMIUM", status: "active", is_active: 1, expires_at: future }), false);
  assert.equal(isActiveProviderPlatinum({ subscription_tier: "PLATINUM", subscription_status: "active", subscription_expires_at: future }, null), false);
  assert.equal(isActiveProviderPlatinum({}, { tier: "PLATINUM", status: "active", payment_status: "pending", is_active: 1, expires_at: future }), false);
  assert.equal(isActiveProviderPlatinum({}, { tier: "PLATINUM", status: "active", payment_status: "paid", is_active: 0, expires_at: future }), true);
  assert.equal(isActiveProviderPlatinum({}, { tier: "PLATINUM", status: "active", payment_status: "paid", is_active: 1, expires_at: past }), false);
  assert.equal(isActiveProviderPlatinum({}, { tier: "PLATINUM", status: "trialing", payment_status: "trial", trial_status: "active", expires_at: future }), true);
});
