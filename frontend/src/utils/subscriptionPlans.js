export const BILLING_CYCLES = ["monthly", "annual"];

export const PROVIDER_PLANS = [
  {
    tier: "FREE",
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualSavings: 0,
    summary: "Start accepting bookings and make your business visible to customers.",
    bestFor: "Start accepting bookings and make your business visible to customers.",
    trialAvailable: false,
    features: ["Business profile", "Basic service listing", "Customer bookings", "Customer reviews", "Basic location display"],
  },
  {
    tier: "PREMIUM",
    id: "premium",
    name: "Premium",
    monthlyPrice: 12000,
    annualPrice: 120000,
    annualSavings: 24000,
    summary: "Grow your visibility and attract more customers with better provider tools.",
    bestFor: "Grow your visibility and attract more customers with better provider tools.",
    recommended: true,
    trialAvailable: false,
    features: ["Everything in Free", "More service listings", "Priority visibility", "Smart Match eligibility", "Basic analytics", "Provider Coach: 5 tips/month"],
  },
  {
    tier: "PLATINUM",
    id: "platinum",
    name: "Platinum",
    monthlyPrice: 24000,
    annualPrice: 240000,
    annualSavings: 48000,
    summary: "Unlock advanced tools for providers who want maximum visibility and control.",
    bestFor: "Unlock advanced tools for providers who want maximum visibility and control.",
    trialAvailable: false,
    features: ["Everything in Premium", "Featured placement", "Unlimited Provider Coach", "Advanced analytics", "Review blocking up to 10 reviews", "Priority support"],
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
