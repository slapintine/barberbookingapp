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
    headline: "Start selling",
    summary: "Create your stand, take bookings, and chat with customers for free.",
    bestFor: "Create your stand, take bookings, and chat with customers for free.",
    trialAvailable: false,
    features: [
      "Business profile & stand",
      "Service listings",
      "Customer bookings & requests",
      "Customer messaging",
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
    headline: "Look professional and get discovered",
    summary: "Stand out, rank higher, and understand your customers.",
    bestFor: "Stand out, rank higher, and understand your customers.",
    whyUpgrade: "No ads, a Premium badge, higher ranking, more services & photos, and basic analytics so more customers find and trust you.",
    trialAvailable: false,
    features: [
      "Everything in Free",
      "No ads",
      "Premium badge",
      "Higher search & category ranking",
      "More services & portfolio photos",
      "Custom logo & business hours",
      "UGX price ranges",
      "Booking management",
      "Basic analytics (views, bookings, profile clicks)",
      "Limited offers",
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
    headline: "Grow, manage, and dominate your category",
    summary: "The full growth toolkit: Open Coach, top ranking, and advanced insights.",
    bestFor: "The full growth toolkit: Open Coach, top ranking, and advanced insights.",
    whyUpgrade: "Unlimited Open Coach, top priority placement, advanced analytics, AI offer/reply/description helpers, a weekly report and business health score, plus 'Recommended by Queless' eligibility once verified.",
    trialAvailable: false,
    features: [
      "Everything in Premium",
      "Open Coach (unlimited)",
      "Top priority ranking & placement",
      "Platinum badge",
      "Advanced analytics & conversion insights",
      "AI offer generator & reply assistant",
      "AI service description helper",
      "Weekly business report & health score",
      "Service area, delivery & mobile service",
      "Largest photo allowance",
      "'Recommended by Queless' eligibility (after verification)",
      "VIP support",
    ],
  },
];

export const PLAN_FEATURES = {
  free: {
    maxServices: 5,
    maxPhotos: 2,
    imageUploadLimitMb: 20,
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
    maxPhotos: 5,
    imageUploadLimitMb: 50,
    promotions: true,
    homeService: true,
    advancedAnalytics: true,
    // Open Coach is a Platinum-only growth tool, not a Premium feature.
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
    maxPhotos: 10,
    imageUploadLimitMb: 100,
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

export function formatPlanName(tier, fallback = "No active plan") {
  return getProviderPlan(tier)?.name || fallback;
}

/**
 * Provider-context plan label, e.g. "Premium Provider". Use this on provider
 * screens so a provider's plan is never confused with the separate
 * "Customer Premium" plan.
 */
export function formatProviderPlanName(tier, fallback = "No active plan") {
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

/** True only for an active Platinum provider — the gate for Open Coach. */
export function hasOpenCoachAccess(subscription = {}) {
  return isProviderPlanActive(subscription, "PLATINUM");
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
