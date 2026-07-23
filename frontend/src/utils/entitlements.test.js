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
  assert.equal(entitlements.canUseSmartMatch, true);
  assert.equal(entitlements.canUseConversationalSmartMatch, false);
  assert.equal(entitlements.hasProviderPlatinum, true);
  assert.equal(entitlements.canUseProviderCoach, true);
});

test("provider Premium unlocks analytics and the Business Assistant", () => {
  const entitlements = resolveEntitlements({
    summary: {
      customerPlan: "FREE",
      providerPlan: "PREMIUM",
      customerPremiumActive: false,
      providerPlanActive: true,
      entitlements: {
        providerAnalytics: true,
        providerCoach: true,
        advancedReports: false,
      },
    },
  });

  assert.equal(entitlements.hasProviderPremium, true);
  assert.equal(entitlements.hasProviderPlatinum, false);
  assert.equal(entitlements.canViewProviderAnalytics, true);
  assert.equal(entitlements.canUseProviderCoach, true);
  assert.equal(entitlements.canUseProviderAssistantAnalytics, true);
  assert.equal(entitlements.canViewAdvancedReports, true);
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
  assert.equal(entitlements.canUseSmartMatch, true);
  assert.equal(entitlements.canUseConversationalSmartMatch, false);
  assert.equal(entitlements.canUseProviderCoach, true);
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
        providerCoach: true,
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
  assert.equal(entitlements.canUseProviderCoach, true);
  assert.equal(entitlements.canViewAdvancedReports, false);
});

test("Customer Premium adds conversational Smart Match without weakening regular matching", () => {
  const free = resolveEntitlements({
    summary: {
      customerPlan: "FREE",
      customerPremiumActive: false,
      providerPlan: "FREE",
      providerPlanActive: true,
    },
  });
  const premium = resolveEntitlements({
    summary: {
      customerPlan: "PREMIUM",
      customerPremiumActive: true,
      providerPlan: "FREE",
      providerPlanActive: true,
    },
  });

  assert.equal(free.canUseSmartMatch, true);
  assert.equal(free.canUseConversationalSmartMatch, false);
  assert.equal(premium.canUseSmartMatch, true);
  assert.equal(premium.canUseConversationalSmartMatch, true);
});

test("Provider Platinum keeps implemented assistant capabilities without advertising forecasting yet", () => {
  const entitlements = resolveEntitlements({
    summary: {
      customerPlan: "FREE",
      customerPremiumActive: false,
      providerPlan: "PLATINUM",
      providerPlanActive: true,
    },
  });

  assert.equal(entitlements.canUseProviderCoach, true);
  assert.equal(entitlements.canUseProviderAssistantAnalytics, true);
  assert.equal(entitlements.canUseProviderAssistantForecasting, false);
});
