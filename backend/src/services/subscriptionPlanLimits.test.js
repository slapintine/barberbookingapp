import assert from "node:assert/strict";
import test from "node:test";
import {
  getSubscriptionTierConfig,
  normalizeProviderPlan,
} from "./paymentService.js";

test("provider plan limits make Plus limited, Premium balanced, and Platinum unlimited", () => {
  const plus = getSubscriptionTierConfig("plus");
  const premium = getSubscriptionTierConfig("premium");
  const platinum = getSubscriptionTierConfig("platinum");

  assert.equal(plus.serviceLimit, 5);
  assert.equal(plus.photoLimit, 5);
  assert.equal(plus.promotionsEnabled, false);
  assert.equal(plus.aiBusinessCoach, false);
  assert.equal(plus.advancedAnalytics, false);

  assert.equal(premium.serviceLimit, 20);
  assert.equal(premium.photoLimit, 20);
  assert.equal(premium.promotionsEnabled, true);
  assert.equal(premium.advancedAnalytics, true);
  assert.equal(premium.reviewInsights, true);
  assert.equal(premium.aiBusinessCoach, false);
  assert.equal(premium.verifiedBadge, false);

  assert.equal(platinum.serviceLimit, -1);
  assert.equal(platinum.photoLimit, -1);
  assert.equal(platinum.aiBusinessCoach, true);
  assert.equal(platinum.verifiedBadge, true);
  assert.equal(platinum.homepageFeature, true);
  assert.equal(platinum.aiWeeklyReport, true);
});

test("provider plans normalize IDs without using display labels as stored logic", () => {
  assert.equal(normalizeProviderPlan("plus"), "PLUS");
  assert.equal(normalizeProviderPlan("Premium"), "PREMIUM");
  assert.equal(normalizeProviderPlan("PLATINUM"), "PLATINUM");
  assert.equal(normalizeProviderPlan("legacy"), "");
  assert.equal(normalizeProviderPlan("starter"), "");
  assert.equal(normalizeProviderPlan(""), "");
});
