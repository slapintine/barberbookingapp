import test from "node:test";
import assert from "node:assert/strict";
import { getActiveCustomerPremiumSubscription, isActiveCustomerPremium, mapCustomerSubscription } from "./customerSubscriptionService.js";
import { isActiveProviderPlatinum } from "./providerSubscriptionAccess.js";

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
