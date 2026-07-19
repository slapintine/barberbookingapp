import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntitlements } from "./entitlements.js";

test("keeps customer Premium and provider Platinum entitlements separate", () => {
  const entitlements = resolveEntitlements({
    summary: {
      customerPlan: "PREMIUM",
      providerPlan: "PLATINUM",
      customerPremiumActive: true,
      providerPlanActive: true,
      entitlements: {
        smartMatch: true,
        providerCoach: true,
        advancedReports: true,
      },
    },
  });

  assert.equal(entitlements.hasCustomerPremium, true);
  assert.equal(entitlements.hasProviderPlatinum, true);
  assert.equal(entitlements.canUseSmartMatch, true);
  assert.equal(entitlements.canUseProviderCoach, true);
  assert.equal(entitlements.canViewAdvancedReports, true);
});

test("does not infer Customer Premium from provider plan", () => {
  const entitlements = resolveEntitlements({
    summary: {
      customerPlan: "FREE",
      providerPlan: "PLATINUM",
      customerPremiumActive: false,
      providerPlanActive: true,
      entitlements: {
        providerCoach: true,
        advancedReports: true,
      },
    },
  });

  assert.equal(entitlements.hasCustomerPremium, false);
  assert.equal(entitlements.canUseSmartMatch, false);
  assert.equal(entitlements.hasProviderPlatinum, true);
  assert.equal(entitlements.canUseProviderCoach, true);
});

test("provider Premium unlocks analytics but not Provider Coach", () => {
  const entitlements = resolveEntitlements({
    summary: {
      customerPlan: "FREE",
      providerPlan: "PREMIUM",
      customerPremiumActive: false,
      providerPlanActive: true,
      entitlements: {
        providerAnalytics: true,
        providerCoach: false,
        advancedReports: false,
      },
    },
  });

  assert.equal(entitlements.hasProviderPremium, true);
  assert.equal(entitlements.hasProviderPlatinum, false);
  assert.equal(entitlements.canViewProviderAnalytics, true);
  assert.equal(entitlements.canUseProviderCoach, false);
  assert.equal(entitlements.canViewAdvancedReports, false);
});

test("missing entitlement summary resolves to free plans without paid access", () => {
  const entitlements = resolveEntitlements();

  assert.equal(entitlements.customerPlan, "FREE");
  assert.equal(entitlements.providerPlan, "FREE");
  assert.equal(entitlements.customerPremiumActive, false);
  assert.equal(entitlements.hasCustomerPremium, false);
  assert.equal(entitlements.providerPlanActive, true);
  assert.equal(entitlements.hasProviderPremium, false);
  assert.equal(entitlements.hasProviderPlatinum, false);
  assert.equal(entitlements.canUseSmartMatch, false);
  assert.equal(entitlements.canUseProviderCoach, false);
  assert.equal(entitlements.canViewAdvancedReports, false);
});

test("expired or inactive provider paid state falls back to Free Provider access", () => {
  const entitlements = resolveEntitlements({
    summary: {
      customerPlan: "FREE",
      providerPlan: "FREE",
      customerPremiumActive: false,
      providerPlanActive: true,
      entitlements: {
        providerCoach: false,
        advancedReports: false,
        providerAnalytics: false,
      },
    },
    providerSubscription: {
      tier: "PLATINUM",
      status: "expired",
    },
  });

  assert.equal(entitlements.providerPlan, "FREE");
  assert.equal(entitlements.providerPlanActive, true);
  assert.equal(entitlements.hasProviderPremium, false);
  assert.equal(entitlements.hasProviderPlatinum, false);
  assert.equal(entitlements.canUseProviderCoach, false);
  assert.equal(entitlements.canViewAdvancedReports, false);
});
