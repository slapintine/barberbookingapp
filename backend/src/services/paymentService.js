export const PLATFORM_COMMISSION_RATE = 0.1;
export const FREE_TRIAL_DAYS = 30;
export const VALID_BILLING_CYCLES = ["monthly", "annual"];

export const SUBSCRIPTION_TIERS = {
  FREE: {
    code: "FREE",
    id: "free",
    name: "Free",
    price: 0,
    monthlyPrice: 0,
    annualPrice: 0,
    annualSavings: 0,
    currency: "UGX",
    trialAvailable: false,
    trialDurationDays: FREE_TRIAL_DAYS,
    rankingWeight: 1,
    analyticsLevel: "basic",
    homepageFeatured: false,
    searchPriority: 1,
    topBarberBadge: false,
    verifiedBadge: false,
    adsPlacement: false,
    promotionsEnabled: false,
    marketingPushEnabled: false,
    homeServiceEnabled: false,
    profileCustomizationLevel: "enhanced",
    visibilityLabel: "Basic visibility",
    supportLevel: "Normal support",
    serviceLimit: 5,
    photoLimit: 2,
    imageUploadLimitMb: 20,
    videoLimit: 0,
    reviewsEnabled: true,
    earningsTracking: true,
    bookingAnalytics: false,
    customBrandingHighlight: false,
    portfolioEnabled: true,
    beforeAfterGalleryEnabled: true,
    advancedAnalytics: false,
    aiBusinessCoach: false,
    reviewInsights: false,
    videoUploads: false,
    homepageFeature: false,
    priorityRanking: false,
    customBanner: false,
    aiWeeklyReport: false,
  },
  PREMIUM: {
    code: "PREMIUM",
    id: "premium",
    name: "Premium",
    price: 12000,
    monthlyPrice: 12000,
    annualPrice: 120000,
    annualSavings: 24000,
    currency: "UGX",
    recommended: true,
    trialAvailable: false,
    trialDurationDays: FREE_TRIAL_DAYS,
    rankingWeight: 2,
    analyticsLevel: "growth",
    homepageFeatured: false,
    searchPriority: 2,
    topBarberBadge: false,
    verifiedBadge: false,
    adsPlacement: false,
    promotionsEnabled: true,
    marketingPushEnabled: true,
    homeServiceEnabled: true,
    profileCustomizationLevel: "full",
    visibilityLabel: "Priority visibility",
    supportLevel: "Priority support",
    serviceLimit: 20,
    photoLimit: 5,
    imageUploadLimitMb: 50,
    videoLimit: 0,
    reviewsEnabled: true,
    earningsTracking: true,
    bookingAnalytics: true,
    customBrandingHighlight: false,
    portfolioEnabled: true,
    beforeAfterGalleryEnabled: true,
    advancedAnalytics: true,
    aiBusinessCoach: true,
    reviewInsights: true,
    videoUploads: false,
    homepageFeature: false,
    priorityRanking: true,
    customBanner: false,
    aiWeeklyReport: false,
  },
  PLATINUM: {
    code: "PLATINUM",
    id: "platinum",
    name: "Platinum",
    price: 24000,
    monthlyPrice: 24000,
    annualPrice: 240000,
    annualSavings: 48000,
    currency: "UGX",
    trialAvailable: false,
    trialDurationDays: FREE_TRIAL_DAYS,
    rankingWeight: 3,
    analyticsLevel: "advanced_plus",
    homepageFeatured: true,
    searchPriority: 3,
    topBarberBadge: true,
    verifiedBadge: true,
    adsPlacement: true,
    promotionsEnabled: true,
    marketingPushEnabled: true,
    homeServiceEnabled: true,
    profileCustomizationLevel: "signature",
    visibilityLabel: "Homepage feature",
    supportLevel: "Dedicated support",
    serviceLimit: -1,
    photoLimit: 10,
    imageUploadLimitMb: 100,
    videoLimit: -1,
    reviewsEnabled: true,
    earningsTracking: true,
    bookingAnalytics: true,
    customBrandingHighlight: true,
    portfolioEnabled: true,
    beforeAfterGalleryEnabled: true,
    advancedAnalytics: true,
    aiBusinessCoach: true,
    reviewInsights: true,
    videoUploads: true,
    homepageFeature: true,
    priorityRanking: true,
    customBanner: true,
    aiWeeklyReport: true,
  },
};

export function getSubscriptionTierConfig(tier) {
  const normalized = String(tier || "FREE").trim().toUpperCase();
  return SUBSCRIPTION_TIERS[normalized] || SUBSCRIPTION_TIERS.FREE;
}

export function getSubscriptionPlans() {
  return ["FREE", "PREMIUM", "PLATINUM"].map((tier) => getSubscriptionTierConfig(tier));
}

export function normalizeBillingCycle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_BILLING_CYCLES.includes(normalized) ? normalized : "";
}

export function getPlanPrice(tier, billingCycle = "monthly") {
  const plan = getSubscriptionTierConfig(tier);
  const cycle = normalizeBillingCycle(billingCycle) || "monthly";
  return cycle === "annual" ? Number(plan.annualPrice || 0) : Number(plan.monthlyPrice || plan.price || 0);
}

export function getSubscriptionEndDate(startedAt = new Date(), billingCycle = "monthly") {
  const date = startedAt instanceof Date ? new Date(startedAt) : new Date(startedAt);
  if (normalizeBillingCycle(billingCycle) === "annual") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString();
}

export function getTierRank(tier) {
  return Number(getSubscriptionTierConfig(tier).rankingWeight || 0);
}

export function normalizeMoneyAmount(amount, fieldName = "amount", { minimum = 1, maximum = null } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error(`${fieldName} must be greater than 0.`), { statusCode: 400 });
  }
  if (!Number.isInteger(value)) {
    throw Object.assign(new Error(`${fieldName} must be a whole UGX amount.`), { statusCode: 400 });
  }
  if (value < minimum) {
    throw Object.assign(new Error(`${fieldName} must be at least UGX ${minimum.toLocaleString()}.`), { statusCode: 400 });
  }
  if (maximum !== null && value > maximum) {
    throw Object.assign(new Error(`${fieldName} cannot exceed UGX ${maximum.toLocaleString()}.`), { statusCode: 400 });
  }
  return value;
}

export function normalizeProviderPlan(tier) {
  const normalized = String(tier || "").trim().toUpperCase();
  return ["FREE", "PREMIUM", "PLATINUM"].includes(normalized) ? normalized : "";
}

export function isValidProviderPlan(tier) {
  return Boolean(normalizeProviderPlan(tier));
}

export function calculateCommissionBreakdown(amount) {
  const grossAmount = normalizeMoneyAmount(amount, "Payment amount");
  const commissionAmount = Math.round(grossAmount * PLATFORM_COMMISSION_RATE);
  const barberAmount = grossAmount - commissionAmount;

  return {
    grossAmount,
    commissionAmount,
    barberAmount,
  };
}

export function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

export function normalizeUgandaPhoneNumber(value) {
  const normalized = normalizePhoneNumber(value);
  if (/^\+256[37]\d{8}$/.test(normalized)) {
    return normalized;
  }
  return "";
}

export function createReference(prefix, entityId) {
  const safePrefix = String(prefix || "txn").toLowerCase();
  const safeEntity = String(entityId || "na");
  return `${safePrefix}-${safeEntity}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getMobileMoneyProviderLabel(provider) {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === "mtn_mobile_money") return "MTN Mobile Money";
  if (normalized === "airtel_money") return "Airtel Money";
  return "Mobile Money";
}
