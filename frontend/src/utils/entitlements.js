import { isCustomerPremiumActive } from "./customerPremium.js";
import { normalizePlanTier, isProviderPlanActive } from "./subscriptionPlans.js";

export const CUSTOMER_PLAN = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
};

export const PROVIDER_PLAN = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
  PLATINUM: "PLATINUM",
};

function bool(value) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
}

function normalizedCustomerPlan(summary, customerSub) {
  const explicit = String(summary?.customerPlan || summary?.customer?.plan || summary?.customer?.tier || "").toUpperCase();
  if (explicit === CUSTOMER_PLAN.PREMIUM || explicit === "PREMIUM" || explicit === "CUSTOMER_PREMIUM") return CUSTOMER_PLAN.PREMIUM;
  return isCustomerPremiumActive(customerSub || summary?.customer?.subscription) ? CUSTOMER_PLAN.PREMIUM : CUSTOMER_PLAN.FREE;
}

function normalizedProviderPlan(summary, providerSub) {
  const raw =
    summary?.providerPlan ||
    summary?.provider?.plan ||
    summary?.provider?.tier ||
    providerSub?.tier ||
    "";
  const tier = normalizePlanTier(raw, "");
  return [PROVIDER_PLAN.FREE, PROVIDER_PLAN.PREMIUM, PROVIDER_PLAN.PLATINUM].includes(tier) ? tier : PROVIDER_PLAN.FREE;
}

function providerIsActive(summary, providerSub) {
  if (typeof summary?.providerPlanActive === "boolean") return summary.providerPlanActive;
  if (typeof summary?.provider?.active === "boolean") return summary.provider.active;
  const status = String(summary?.provider?.status || providerSub?.status || "").toLowerCase();
  const tier = normalizedProviderPlan(summary, providerSub);
  if (tier === PROVIDER_PLAN.FREE && ["", "free", "active", "trialing"].includes(status)) return true;
  return ["active", "trialing", "manual_approved", "admin_approved", "approved"].includes(status);
}

export function resolveEntitlements({
  summary = null,
  customerSubscription = null,
  providerSubscription = null,
} = {}) {
  const customerPlan = normalizedCustomerPlan(summary, customerSubscription);
  const providerPlan = normalizedProviderPlan(summary, providerSubscription);
  const customerPremiumActive =
    typeof summary?.customerPremiumActive === "boolean"
      ? summary.customerPremiumActive
      : isCustomerPremiumActive(customerSubscription || summary?.customer?.subscription);
  const providerPlanActive = providerIsActive(summary, providerSubscription);
  const hasProviderPremium = providerPlanActive && [PROVIDER_PLAN.PREMIUM, PROVIDER_PLAN.PLATINUM].includes(providerPlan);
  const hasProviderPlatinum = providerPlanActive && providerPlan === PROVIDER_PLAN.PLATINUM;
  const explicit = summary?.entitlements || {};

  return {
    customerPlan,
    providerPlan,
    customerPremiumActive,
    hasCustomerPremium: customerPremiumActive && customerPlan === CUSTOMER_PLAN.PREMIUM,
    providerPlanActive,
    hasProviderPremium,
    hasProviderPlatinum,
    canUseSmartMatch: bool(explicit.smartMatch) || (customerPremiumActive && customerPlan === CUSTOMER_PLAN.PREMIUM),
    canUseProviderCoach: bool(explicit.providerCoach) || hasProviderPlatinum,
    canViewAdvancedReports: bool(explicit.advancedReports) || hasProviderPlatinum,
    canViewProviderAnalytics: bool(explicit.providerAnalytics) || hasProviderPremium,
    canUseFeaturedPlacement: bool(explicit.featuredPlacement) || hasProviderPlatinum,
  };
}

export function hasProviderPlan(subscription, tier) {
  return isProviderPlanActive(subscription, tier);
}
