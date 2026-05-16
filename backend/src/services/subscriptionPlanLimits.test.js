import assert from "node:assert/strict";
import test from "node:test";
import {
  getSubscriptionTierConfig,
  normalizeProviderPlan,
} from "./paymentService.js";

test("provider plan limits make Pro limited, Premium balanced, and Platinum unlimited", () => {
  const pro = getSubscriptionTierConfig("pro");
  const premium = getSubscriptionTierConfig("premium");
  const platinum = getSubscriptionTierConfig("platinum");

  assert.equal(pro.serviceLimit, 5);
  assert.equal(pro.photoLimit, 5);
  assert.equal(pro.promotionsEnabled, false);
  assert.equal(pro.aiBusinessCoach, false);
  assert.equal(pro.advancedAnalytics, false);

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
  assert.equal(normalizeProviderPlan("pro"), "PRO");
  assert.equal(normalizeProviderPlan("Premium"), "PREMIUM");
  assert.equal(normalizeProviderPlan("PLATINUM"), "PLATINUM");
  assert.equal(normalizeProviderPlan("standard"), "PRO");
  assert.equal(normalizeProviderPlan(""), "");
});
