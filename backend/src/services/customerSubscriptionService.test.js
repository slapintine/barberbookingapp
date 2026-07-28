import test from "node:test";
import assert from "node:assert/strict";
import { getActiveCustomerPremiumSubscription, isActiveCustomerPremium, mapCustomerSubscription } from "./customerSubscriptionService.js";
import { buildCustomerEntitlementSnapshot, CUSTOMER_ENTITLEMENTS } from "./entitlementService.js";
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

test("customer entitlement snapshot keeps Free limited and Premium expanded", () => {
  const free = buildCustomerEntitlementSnapshot(null);
  assert.equal(free.plan, "FREE");
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.SMART_MATCH_PREVIEW], true);
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.SMART_MATCH_FULL], false);
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE], false);
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.FAVOURITES_BASIC], true);
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.FAVOURITES_EXPANDED], false);
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.SMART_REBOOKING], false);
  assert.equal(free.entitlements[CUSTOMER_ENTITLEMENTS.EARLIER_SLOT_ALERTS], false);
  assert.equal(free.limits.favourites, 3);
  assert.equal(free.limits.comparisonProviders, 0);

  const premium = buildCustomerEntitlementSnapshot({ id: 1 });
  assert.equal(premium.plan, "PREMIUM");
  assert.equal(premium.entitlements[CUSTOMER_ENTITLEMENTS.SMART_MATCH_FULL], true);
  assert.equal(premium.entitlements[CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE], true);
  assert.equal(premium.entitlements[CUSTOMER_ENTITLEMENTS.FAVOURITES_EXPANDED], true);
  assert.equal(premium.entitlements[CUSTOMER_ENTITLEMENTS.SMART_REBOOKING], true);
  assert.equal(premium.entitlements[CUSTOMER_ENTITLEMENTS.EARLIER_SLOT_ALERTS], true);
  assert.equal(premium.limits.favourites > free.limits.favourites, true);
  assert.equal(premium.limits.comparisonProviders, 3);
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
