export const BILLING_CYCLES = ["monthly", "annual"];

export const PROVIDER_PLANS = [
  {
    tier: "PRO",
    id: "pro",
    name: "Pro",
    monthlyPrice: 6000,
    annualPrice: 60000,
    annualSavings: 12000,
    summary: "Basic online presence for starting providers",
    trialAvailable: true,
    features: ["Business profile", "5 services", "5 photos", "Basic bookings", "Cash payments", "Basic reports"],
  },
  {
    tier: "PREMIUM",
    id: "premium",
    name: "Premium",
    monthlyPrice: 12000,
    annualPrice: 120000,
    annualSavings: 24000,
    summary: "Best for growing businesses",
    recommended: true,
    trialAvailable: true,
    features: ["20 services", "20 photos", "Promotions", "Home service", "Booking analytics", "Priority support"],
  },
  {
    tier: "PLATINUM",
    id: "platinum",
    name: "Platinum",
    monthlyPrice: 24000,
    annualPrice: 240000,
    annualSavings: 48000,
    summary: "Best for maximum visibility",
    trialAvailable: true,
    features: ["Unlimited services", "Unlimited photos", "AI Business Coach", "Verified badge", "Homepage feature", "Top visibility"],
  },
];

export const PLAN_FEATURES = {
  pro: {
    maxServices: 5,
    maxPhotos: 5,
    promotions: false,
    homeService: false,
    advancedAnalytics: false,
    aiBusinessCoach: false,
    reviewInsights: false,
    videoUploads: false,
    verifiedBadge: false,
    homepageFeature: false,
    priorityRanking: false,
    customBanner: false,
    aiWeeklyReport: false,
  },
  premium: {
    maxServices: 20,
    maxPhotos: 20,
    promotions: true,
    homeService: true,
    advancedAnalytics: true,
    aiBusinessCoach: false,
    reviewInsights: true,
    videoUploads: false,
    verifiedBadge: false,
    homepageFeature: false,
    priorityRanking: true,
    customBanner: false,
    aiWeeklyReport: false,
  },
  platinum: {
    maxServices: Infinity,
    maxPhotos: Infinity,
    promotions: true,
    homeService: true,
    advancedAnalytics: true,
    aiBusinessCoach: true,
    reviewInsights: true,
    videoUploads: true,
    verifiedBadge: true,
    homepageFeature: true,
    priorityRanking: true,
    customBanner: true,
    aiWeeklyReport: true,
  },
};

export function normalizePlanId(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["pro", "premium", "platinum"].includes(normalized)) return normalized;
  const byTier = PROVIDER_PLANS.find((plan) => plan.tier === String(value || "").trim().toUpperCase());
  return byTier?.id || fallback;
}

export function normalizePlanTier(value, fallback = "") {
  const id = normalizePlanId(value);
  const plan = PROVIDER_PLANS.find((item) => item.id === id);
  return plan?.tier || fallback;
}

export function getPlanFeatures(value) {
  return PLAN_FEATURES[normalizePlanId(value, "pro")];
}

export function normalizeBillingCycle(value) {
  const normalized = String(value || "").toLowerCase();
  return BILLING_CYCLES.includes(normalized) ? normalized : "";
}

export function getProviderPlan(tier) {
  const normalized = String(tier || "").toUpperCase();
  return PROVIDER_PLANS.find((plan) => plan.tier === normalized || plan.id === String(tier || "").toLowerCase()) || null;
}

export function formatPlanName(tier, fallback = "No active plan") {
  return getProviderPlan(tier)?.name || fallback;
}

export function getPlanAmount(plan, billingCycle = "monthly") {
  if (!plan) return null;
  return normalizeBillingCycle(billingCycle) === "annual" ? Number(plan.annualPrice || 0) : Number(plan.monthlyPrice || 0);
}

export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

export function formatSubscriptionPrice(plan, billingCycle, state = "ready") {
  if (state === "loading") return "Loading plan details...";
  if (!plan) return "Select a plan to continue";
  if (state === "trial") return "Free trial";
  const cycle = normalizeBillingCycle(billingCycle);
  if (!cycle) return "Plan price unavailable";
  const amount = getPlanAmount(plan, cycle);
  if (!amount || amount <= 0) return "Plan price unavailable";
  return `${formatMoney(amount)} / ${cycle === "annual" ? "year" : "month"}`;
}

export function canContinueToBusinessCreation(selectedPlan, paymentStatus, trialStatus) {
  const plan = getProviderPlan(selectedPlan?.tier || selectedPlan?.id || selectedPlan);
  if (!plan) return false;
  return paymentStatus === "paid" || trialStatus === "active";
}
