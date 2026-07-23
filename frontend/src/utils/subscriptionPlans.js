export const BILLING_CYCLES = ["monthly", "annual"];

export const CUSTOMER_PREMIUM_PLAN = {
  tier: "PREMIUM",
  id: "customer-premium",
  name: "Customer Premium",
  monthlyPrice: 10000,
  annualPrice: 120000,
  currency: "UGX",
};

export const PROVIDER_PLANS = [
  {
    tier: "FREE",
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualSavings: 0,
    headline: "Start booking",
    summary: "Create your stand, take bookings, and chat with customers for free.",
    bestFor: "Create your stand, take bookings, and chat with customers for free.",
    trialAvailable: false,
    features: [
      "Business profile & stand",
      "Service listings",
      "Customer bookings & requests",
      "Customer messaging",
      "Basic Business Assistant help",
      "Customer reviews",
      "Map & location listing",
    ],
  },
  {
    tier: "PREMIUM",
    id: "premium",
    name: "Premium",
    monthlyPrice: 12000,
    annualPrice: 120000,
    annualSavings: 24000,
    recommended: true,
    headline: "Understand your bookings",
    summary: "Add more services and photos, then use reports and Business Assistant analytics to improve your stand.",
    bestFor: "Providers who want richer reports and practical growth guidance.",
    whyUpgrade: "Premium adds higher service and portfolio limits, a Premium badge, deeper reports, review insights, and Business Assistant analytics based on your own data.",
    trialAvailable: false,
    features: [
      "Everything in Free",
      "Premium badge",
      "Better service and portfolio capacity",
      "Up to 20 services and 30 portfolio photos",
      "Custom logo & business hours",
      "UGX price ranges",
      "Booking management",
      "Booking and review reports",
      "Business Assistant analytics",
      "Customer follow-up message drafts",
      "Can request verification",
    ],
  },
  {
    tier: "PLATINUM",
    id: "platinum",
    name: "Platinum",
    monthlyPrice: 24000,
    annualPrice: 240000,
    annualSavings: 48000,
    headline: "Go deeper with your business data",
    summary: "Higher limits, stronger visibility tools, advanced reports, and deeper Business Assistant guidance.",
    bestFor: "Providers who need more capacity and sharper business insights.",
    whyUpgrade: "Platinum adds very high service and portfolio limits, Platinum visibility eligibility, advanced report sections, deeper Business Assistant guidance, and business health insights where enough data exists.",
    trialAvailable: false,
    features: [
      "Everything in Premium",
      "Deeper Business Assistant guidance",
      "Platinum visibility eligibility",
      "Platinum badge",
      "Advanced reports and conversion insights",
      "Offer, reply, and description drafting help",
      "Business health insights",
      "Service area and mobile service",
      "Very high service and portfolio limits",
      "Future forecasting and multi-location tools when supported",
    ],
  },
];

export const PLAN_FEATURES = {
  free: {
    maxServices: 5,
    maxPhotos: 8,
    imageUploadLimitMb: 80,
    promotions: false,
    homeService: false,
    advancedAnalytics: false,
    aiBusinessCoach: true,
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
    maxPhotos: 30,
    imageUploadLimitMb: 300,
    promotions: true,
    homeService: true,
    advancedAnalytics: true,
    aiBusinessCoach: true,
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
    imageUploadLimitMb: 1000,
    promotions: true,
    homeService: true,
    advancedAnalytics: true,
    aiBusinessCoach: true,
    reviewInsights: true,
    videoUploads: false,
    verifiedBadge: true,
    homepageFeature: true,
    priorityRanking: true,
    customBanner: false,
    aiWeeklyReport: false,
  },
};

export function normalizePlanId(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["free", "premium", "platinum"].includes(normalized)) return normalized;
  const byTier = PROVIDER_PLANS.find((plan) => plan.tier === String(value || "").trim().toUpperCase());
  return byTier?.id || fallback;
}

export function normalizePlanTier(value, fallback = "") {
  const id = normalizePlanId(value);
  const plan = PROVIDER_PLANS.find((item) => item.id === id);
  return plan?.tier || fallback;
}

export function isProviderPlanActive(subscription = {}, expectedTier = "") {
  const tier = normalizePlanTier(subscription?.tier);
  const requiredTier = normalizePlanTier(expectedTier);
  const status = String(subscription?.status || "").trim().toLowerCase();
  const activeStatuses = new Set(["active", "trialing", "manual_approved", "admin_approved", "approved"]);

  return Boolean(tier && requiredTier && tier === requiredTier && activeStatuses.has(status));
}

export function getStandFinalAction({ selectedTier = "FREE", subscription = {}, paymentsEnabled = false } = {}) {
  const tier = normalizePlanTier(selectedTier, "FREE");
  const paidPlanNeedsActivation =
    tier !== "FREE" &&
    !paymentsEnabled &&
    !isProviderPlanActive(subscription, tier);

  return paidPlanNeedsActivation
    ? { intent: "draft", label: "Save Draft", paymentComingSoon: true }
    : { intent: "publish", label: "Publish Stand", paymentComingSoon: false };
}

export function getPlanFeatures(value) {
  return PLAN_FEATURES[normalizePlanId(value, "free")];
}

export function getPlanImageLimits(value) {
  const plan = getProviderPlan(value) || getProviderPlan("FREE");
  const features = getPlanFeatures(plan.id);
  const portfolioImages = Number(features.maxPhotos || 0);
  const portfolioTotalMb = Number(features.imageUploadLimitMb || portfolioImages * 10);
  const serviceImages = 1;
  const serviceTotalMb = 10;
  const logoImages = 1;
  const logoTotalMb = 10;
  return {
    planName: plan.name,
    tier: plan.tier,
    logoImages,
    logoTotalMb,
    logoTotalBytes: logoTotalMb * 1024 * 1024,
    portfolioImages,
    portfolioTotalMb,
    portfolioTotalBytes: portfolioTotalMb * 1024 * 1024,
    serviceImages,
    serviceTotalMb,
    serviceTotalBytes: serviceTotalMb * 1024 * 1024,
    totalPossibleMb: logoTotalMb + portfolioTotalMb + serviceTotalMb,
    maxImages: portfolioImages,
    totalMb: portfolioTotalMb,
    totalBytes: portfolioTotalMb * 1024 * 1024,
  };
}

export function getPlanImageLimitLabel(value, type = "portfolio") {
  const limits = getPlanImageLimits(value);
  if (type === "logo") return "Business logo: 1 image, up to 10MB.";
  if (type === "service") return "Upload one image for this service.";
  return `${limits.planName} plan: ${limits.portfolioImages} portfolio photos, up to ${limits.portfolioTotalMb}MB total.`;
}

export function getPlanImageCountMessage(value, type = "portfolio") {
  const limits = getPlanImageLimits(value);
  if (type === "logo") return "Business logo: 1 image, up to 10MB.";
  if (type === "service") return "Each service can have one image.";
  return `${limits.planName} plan allows up to ${limits.portfolioImages} portfolio photos.`;
}

export function getPlanImageSizeMessage(value, type = "portfolio") {
  const limits = getPlanImageLimits(value);
  if (type === "logo") return "Business logo must be 10MB or less.";
  if (type === "service") return "Service image must be 10MB or less.";
  return `${limits.planName} plan allows portfolio photos up to ${limits.portfolioTotalMb}MB total.`;
}

export function normalizeBillingCycle(value) {
  const normalized = String(value || "").toLowerCase();
  return BILLING_CYCLES.includes(normalized) ? normalized : "";
}

export function getProviderPlan(tier) {
  const normalized = String(tier || "").toUpperCase();
  return PROVIDER_PLANS.find((plan) => plan.tier === normalized || plan.id === String(tier || "").toLowerCase()) || null;
}

export function formatPlanName(tier, fallback = "Free Provider") {
  return getProviderPlan(tier)?.name || fallback;
}

/**
 * Provider-context plan label, e.g. "Premium Provider". Use this on provider
 * screens so a provider's plan is never confused with the separate
 * "Customer Premium" plan.
 */
export function formatProviderPlanName(tier, fallback = "Free Provider") {
  const plan = getProviderPlan(tier);
  return plan ? `${plan.name} Provider` : fallback;
}

/** Plan-aware upgrade CTA label, e.g. "Upgrade to Platinum". */
export function getPlanUpgradeCta(targetTier) {
  const tier = String(targetTier || "").toUpperCase();
  if (tier === "PLATINUM") return "Upgrade to Platinum";
  if (tier === "PREMIUM") return "Upgrade to Premium";
  return "Upgrade";
}

/** True when a provider has an active plan that includes Business Assistant. */
export function hasOpenCoachAccess(subscription = {}) {
  const tier = normalizePlanTier(subscription?.tier, "FREE");
  const status = String(subscription?.status || "").trim().toLowerCase();
  if (tier === "FREE") return ["", "free", "active", "trialing"].includes(status);
  return isProviderPlanActive(subscription, tier);
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
  if (state === "trial") return "Free plan";
  const cycle = normalizeBillingCycle(billingCycle);
  if (!cycle) return "Plan price unavailable";
  const amount = getPlanAmount(plan, cycle);
  if (amount === 0) return `UGX 0/${cycle === "annual" ? "year" : "month"}`;
  if (!amount || amount < 0) return "Plan price unavailable";
  return `${formatMoney(amount)} / ${cycle === "annual" ? "year" : "month"}`;
}

export function canContinueToBusinessCreation(selectedPlan, paymentStatus, trialStatus) {
  const plan = getProviderPlan(selectedPlan?.tier || selectedPlan?.id || selectedPlan);
  if (!plan) return false;
  if (plan.tier === "FREE") return true;
  return paymentStatus === "paid" || trialStatus === "active";
}
