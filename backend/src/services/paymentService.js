export const PLATFORM_COMMISSION_RATE = 0.1;

export const SUBSCRIPTION_TIERS = {
  FREE: {
    code: "FREE",
    name: "Free",
    price: 0,
    rankingWeight: 0,
    analyticsLevel: "none",
    homepageFeatured: false,
    searchPriority: 0,
    topBarberBadge: false,
    promotionsEnabled: false,
    marketingPushEnabled: false,
    profileCustomizationLevel: "basic",
  },
  STANDARD: {
    code: "STANDARD",
    name: "Standard",
    price: 20000,
    rankingWeight: 1,
    analyticsLevel: "basic",
    homepageFeatured: false,
    searchPriority: 1,
    topBarberBadge: false,
    promotionsEnabled: false,
    marketingPushEnabled: false,
    profileCustomizationLevel: "enhanced",
  },
  PREMIUM: {
    code: "PREMIUM",
    name: "Premium",
    price: 50000,
    rankingWeight: 2,
    analyticsLevel: "advanced",
    homepageFeatured: true,
    searchPriority: 2,
    topBarberBadge: true,
    promotionsEnabled: true,
    marketingPushEnabled: true,
    profileCustomizationLevel: "full",
  },
};

export function getSubscriptionTierConfig(tier) {
  const normalized = String(tier || "FREE").trim().toUpperCase();
  return SUBSCRIPTION_TIERS[normalized] || SUBSCRIPTION_TIERS.FREE;
}

export function getTierRank(tier) {
  return Number(getSubscriptionTierConfig(tier).rankingWeight || 0);
}

export function calculateCommissionBreakdown(amount) {
  const grossAmount = Number(amount || 0);
  const commissionAmount = Number((grossAmount * PLATFORM_COMMISSION_RATE).toFixed(2));
  const barberAmount = Number((grossAmount - commissionAmount).toFixed(2));

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
