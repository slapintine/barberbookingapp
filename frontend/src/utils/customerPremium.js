export const DEFAULT_CUSTOMER_SUBSCRIPTION_STATE = {
  tier: "FREE",
  name: "Free",
  status: "free",
  billingCycle: "",
  price: 0,
  currency: "UGX",
  features: {
    smartMatch: false,
    rankedRecommendations: false,
  },
};

export function isCustomerPremiumActive(subscription) {
  const tier = String(subscription?.tier || "").toUpperCase();
  const status = String(subscription?.status || "").toLowerCase();
  const paymentStatus = String(subscription?.paymentStatus || subscription?.payment_status || "").toLowerCase();
  const smartMatch = Boolean(subscription?.features?.smartMatch);
  const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const notExpired = !expiresAt || (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now());
  const paid = paymentStatus === "" || paymentStatus === "paid" || paymentStatus === "successful";
  return tier === "PREMIUM" && status === "active" && paid && smartMatch && notExpired;
}

export function formatCustomerPremiumPrice(plan, billingCycle = "monthly") {
  const fallbackAmount = billingCycle === "annual" ? 120000 : 10000;
  const configuredAmount = billingCycle === "annual" ? Number(plan?.annualPrice || fallbackAmount) : Number(plan?.monthlyPrice || fallbackAmount);
  const amount = Math.max(fallbackAmount, configuredAmount);
  const currency = String(plan?.currency || "UGX").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) return "Price unavailable";
  return `${currency} ${amount.toLocaleString("en-UG")} / ${billingCycle === "annual" ? "year" : "month"}`;
}
