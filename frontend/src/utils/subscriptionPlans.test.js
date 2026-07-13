import assert from "node:assert/strict";
import test from "node:test";
import {
  formatProviderPlanName,
  getPlanFeatures,
  getPlanImageCountMessage,
  getPlanImageLimits,
  getPlanUpgradeCta,
  getStandFinalAction,
  hasOpenCoachAccess,
  isProviderPlanActive,
  normalizePlanId,
  normalizePlanTier,
  PROVIDER_PLANS,
} from "./subscriptionPlans.js";

test("frontend provider plan features gate Free, Premium, and Platinum correctly", () => {
  const free = getPlanFeatures("free");
  const premium = getPlanFeatures("premium");
  const platinum = getPlanFeatures("platinum");

  assert.equal(free.maxServices, 5);
  assert.equal(free.maxPhotos, 8);
  assert.equal(free.imageUploadLimitMb, 80);
  assert.equal(free.promotions, false);
  assert.equal(free.aiBusinessCoach, false);
  assert.equal(free.reviewInsights, false);

  assert.equal(premium.maxServices, 20);
  assert.equal(premium.maxPhotos, 30);
  assert.equal(premium.imageUploadLimitMb, 300);
  assert.equal(premium.promotions, true);
  assert.equal(premium.advancedAnalytics, true);
  assert.equal(premium.reviewInsights, true);
  // Open Coach is Platinum-only, so Premium does not carry the AI coach flag.
  assert.equal(premium.aiBusinessCoach, false);

  assert.equal(platinum.maxServices, Infinity);
  assert.equal(platinum.maxPhotos, Infinity);
  assert.equal(platinum.imageUploadLimitMb, 1000);
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

test("stand publishing recognizes active provider plans without treating payment states as active", () => {
  assert.equal(isProviderPlanActive({ tier: "PLATINUM", status: "active" }, "PLATINUM"), true);
  assert.equal(isProviderPlanActive({ tier: "platinum", status: "trialing" }, "PLATINUM"), true);
  assert.equal(isProviderPlanActive({ tier: "PLATINUM", status: "manual_approved" }, "PLATINUM"), true);
  assert.equal(isProviderPlanActive({ tier: "PLATINUM", status: "pending_payment" }, "PLATINUM"), false);
  assert.equal(isProviderPlanActive({ tier: "PLATINUM", status: "expired" }, "PLATINUM"), false);
  assert.equal(isProviderPlanActive({ tier: "PREMIUM", status: "active" }, "PLATINUM"), false);
});

test("stand final CTA publishes active Platinum directly and keeps inactive paid plans in draft", () => {
  assert.deepEqual(
    getStandFinalAction({
      selectedTier: "PLATINUM",
      subscription: { tier: "PLATINUM", status: "active" },
      paymentsEnabled: false,
    }),
    { intent: "publish", label: "Publish Stand", paymentComingSoon: false }
  );
  assert.deepEqual(
    getStandFinalAction({
      selectedTier: "PREMIUM",
      subscription: { tier: "PREMIUM", status: "active" },
      paymentsEnabled: false,
    }),
    { intent: "publish", label: "Publish Stand", paymentComingSoon: false }
  );
  assert.deepEqual(
    getStandFinalAction({
      selectedTier: "PLATINUM",
      subscription: { tier: "PLATINUM", status: "pending_payment" },
      paymentsEnabled: false,
    }),
    { intent: "draft", label: "Save Draft", paymentComingSoon: true }
  );
  assert.deepEqual(
    getStandFinalAction({ selectedTier: "FREE", paymentsEnabled: false }),
    { intent: "publish", label: "Publish Stand", paymentComingSoon: false }
  );
});

test("free providers keep messaging and Open Coach is Platinum-only", () => {
  const free = PROVIDER_PLANS.find((plan) => plan.tier === "FREE");
  assert.ok(free.features.some((f) => /messaging/i.test(f)), "Free must keep customer messaging");

  const platinum = PROVIDER_PLANS.find((plan) => plan.tier === "PLATINUM");
  assert.ok(platinum.features.some((f) => /open coach/i.test(f)), "Platinum lists Open Coach");
  const premium = PROVIDER_PLANS.find((plan) => plan.tier === "PREMIUM");
  assert.ok(!premium.features.some((f) => /coach/i.test(f)), "Premium does not advertise Coach");

  // Open Coach access gate: active Platinum only.
  assert.equal(hasOpenCoachAccess({ tier: "PLATINUM", status: "active" }), true);
  assert.equal(hasOpenCoachAccess({ tier: "PREMIUM", status: "active" }), false);
  assert.equal(hasOpenCoachAccess({ tier: "PLATINUM", status: "expired" }), false);
});

test("provider plan labels and upgrade CTAs are plan-aware", () => {
  assert.equal(formatProviderPlanName("PREMIUM"), "Premium Provider");
  assert.equal(formatProviderPlanName("PLATINUM"), "Platinum Provider");
  assert.equal(formatProviderPlanName("FREE"), "Free Provider");
  assert.equal(getPlanUpgradeCta("PLATINUM"), "Upgrade to Platinum");
  assert.equal(getPlanUpgradeCta("PREMIUM"), "Upgrade to Premium");
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

test("free plan image limits keep logo, service, and portfolio counts separate", () => {
  const limits = getPlanImageLimits("FREE");
  assert.equal(limits.logoImages, 1);
  assert.equal(limits.serviceImages, 1);
  assert.equal(limits.portfolioImages, 8);
  assert.equal(limits.maxImages, limits.portfolioImages);
  assert.match(getPlanImageCountMessage("FREE", "portfolio"), /8 portfolio photos/i);
  assert.match(getPlanImageCountMessage("FREE", "service"), /each service can have one image/i);
});
