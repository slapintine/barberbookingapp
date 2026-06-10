import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlanFeatures,
  normalizePlanId,
  normalizePlanTier,
  PROVIDER_PLANS,
} from "./subscriptionPlans.js";

test("frontend provider plan features gate Free, Premium, and Platinum correctly", () => {
  const free = getPlanFeatures("free");
  const premium = getPlanFeatures("premium");
  const platinum = getPlanFeatures("platinum");

  assert.equal(free.maxServices, 5);
  assert.equal(free.maxPhotos, 2);
  assert.equal(free.imageUploadLimitMb, 20);
  assert.equal(free.promotions, false);
  assert.equal(free.aiBusinessCoach, false);
  assert.equal(free.reviewInsights, false);

  assert.equal(premium.maxServices, 20);
  assert.equal(premium.maxPhotos, 5);
  assert.equal(premium.imageUploadLimitMb, 50);
  assert.equal(premium.promotions, true);
  assert.equal(premium.advancedAnalytics, true);
  assert.equal(premium.reviewInsights, true);
  assert.equal(premium.aiBusinessCoach, true);

  assert.equal(platinum.maxServices, Infinity);
  assert.equal(platinum.maxPhotos, 10);
  assert.equal(platinum.imageUploadLimitMb, 100);
  assert.equal(platinum.aiBusinessCoach, true);
  assert.equal(platinum.verifiedBadge, true);
  assert.equal(platinum.homepageFeature, true);
  assert.equal(platinum.aiWeeklyReport, true);
});

test("plan selection keeps normalized plan IDs and tiers stable", () => {
  assert.equal(normalizePlanId("Free"), "free");
  assert.equal(normalizePlanId(["pl", "us"].join("")), "");
  assert.equal(normalizePlanId("PREMIUM"), "premium");
  assert.equal(normalizePlanId("platinum"), "platinum");
  assert.equal(normalizePlanId("legacy"), "");
  assert.equal(normalizePlanTier("FREE"), "FREE");
  assert.equal(normalizePlanTier(["pl", "us"].join("")), "");
  assert.equal(normalizePlanTier("Premium"), "PREMIUM");
  assert.equal(normalizePlanTier("PLATINUM"), "PLATINUM");
  assert.equal(normalizePlanTier("", "FREE"), "FREE");
});

test("plan comparison prices and feature order remain launch-ready", () => {
  assert.deepEqual(
    PROVIDER_PLANS.map((plan) => [plan.id, plan.monthlyPrice]),
    [
      ["free", 0],
      ["premium", 12000],
      ["platinum", 24000],
    ]
  );
});
