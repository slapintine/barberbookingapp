import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlanFeatures,
  normalizePlanId,
  normalizePlanTier,
  PROVIDER_PLANS,
} from "./subscriptionPlans.js";

test("frontend provider plan features gate Plus, Premium, and Platinum correctly", () => {
  const plus = getPlanFeatures("plus");
  const premium = getPlanFeatures("premium");
  const platinum = getPlanFeatures("platinum");

  assert.equal(plus.maxServices, 5);
  assert.equal(plus.maxPhotos, 5);
  assert.equal(plus.promotions, false);
  assert.equal(plus.aiBusinessCoach, false);
  assert.equal(plus.reviewInsights, false);

  assert.equal(premium.maxServices, 20);
  assert.equal(premium.maxPhotos, 20);
  assert.equal(premium.promotions, true);
  assert.equal(premium.advancedAnalytics, true);
  assert.equal(premium.reviewInsights, true);
  assert.equal(premium.aiBusinessCoach, false);

  assert.equal(platinum.maxServices, Infinity);
  assert.equal(platinum.maxPhotos, Infinity);
  assert.equal(platinum.aiBusinessCoach, true);
  assert.equal(platinum.verifiedBadge, true);
  assert.equal(platinum.homepageFeature, true);
  assert.equal(platinum.aiWeeklyReport, true);
});

test("plan selection keeps normalized plan IDs and tiers stable", () => {
  assert.equal(normalizePlanId("Plus"), "plus");
  assert.equal(normalizePlanId("PREMIUM"), "premium");
  assert.equal(normalizePlanId("platinum"), "platinum");
  assert.equal(normalizePlanId("legacy"), "");
  assert.equal(normalizePlanTier("plus"), "PLUS");
  assert.equal(normalizePlanTier("Premium"), "PREMIUM");
  assert.equal(normalizePlanTier("PLATINUM"), "PLATINUM");
  assert.equal(normalizePlanTier("", "PLUS"), "PLUS");
});

test("plan comparison prices and feature order remain launch-ready", () => {
  assert.deepEqual(
    PROVIDER_PLANS.map((plan) => [plan.id, plan.monthlyPrice]),
    [
      ["plus", 6000],
      ["premium", 12000],
      ["platinum", 24000],
    ]
  );
});
