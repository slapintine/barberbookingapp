import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlanPrice,
  getSubscriptionPlans,
  getSubscriptionTierConfig,
  normalizeProviderPlan,
} from "./paymentService.js";

test("provider plan limits make Free basic, Premium growth-focused, and Platinum advanced", () => {
  const free = getSubscriptionTierConfig("free");
  const premium = getSubscriptionTierConfig("premium");
  const platinum = getSubscriptionTierConfig("platinum");

  assert.equal(free.serviceLimit, 5);
  assert.equal(free.photoLimit, 2);
  assert.equal(free.imageUploadLimitMb, 20);
  assert.equal(free.promotionsEnabled, false);
  assert.equal(free.aiBusinessCoach, false);
  assert.equal(free.advancedAnalytics, false);

  assert.equal(premium.serviceLimit, 20);
  assert.equal(premium.photoLimit, 5);
  assert.equal(premium.imageUploadLimitMb, 50);
  assert.equal(premium.promotionsEnabled, true);
  assert.equal(premium.advancedAnalytics, true);
  assert.equal(premium.reviewInsights, true);
  assert.equal(premium.aiBusinessCoach, true);
  assert.equal(premium.verifiedBadge, false);

  assert.equal(platinum.serviceLimit, -1);
  assert.equal(platinum.photoLimit, 10);
  assert.equal(platinum.imageUploadLimitMb, 100);
  assert.equal(platinum.aiBusinessCoach, true);
  assert.equal(platinum.verifiedBadge, true);
  assert.equal(platinum.homepageFeature, true);
  assert.equal(platinum.aiWeeklyReport, true);
});

test("provider plans normalize IDs without using display labels as stored logic", () => {
  assert.equal(normalizeProviderPlan("FREE"), "FREE");
  assert.equal(normalizeProviderPlan(["pl", "us"].join("")), "");
  assert.equal(normalizeProviderPlan("Premium"), "PREMIUM");
  assert.equal(normalizeProviderPlan("PLATINUM"), "PLATINUM");
  assert.equal(normalizeProviderPlan("pro"), "");
  assert.equal(normalizeProviderPlan("standard"), "");
  assert.equal(normalizeProviderPlan("legacy"), "");
  assert.equal(normalizeProviderPlan("starter"), "");
  assert.equal(normalizeProviderPlan(""), "");
});

test("provider plan catalog exposes only current Queless plan names and prices", () => {
  const plans = getSubscriptionPlans();

  assert.deepEqual(plans.map((plan) => plan.code), ["FREE", "PREMIUM", "PLATINUM"]);
  assert.deepEqual(plans.map((plan) => plan.name), ["Free", "Premium", "Platinum"]);

  assert.equal(getPlanPrice("FREE", "monthly"), 0);
  assert.equal(getPlanPrice("PREMIUM", "monthly"), 12000);
  assert.equal(getPlanPrice("PLATINUM", "monthly"), 24000);
});
