import { env } from "../config/env.js";
import { normalizeBillingCycle } from "./paymentService.js";

export const CUSTOMER_PREMIUM_TIER = "PREMIUM";
const PAID_PAYMENT_STATUSES = new Set(["paid", "successful"]);
const TRIAL_PAYMENT_STATUSES = new Set(["", "trial", "trialing", "free_trial"]);

function isFutureDate(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}

export function getCustomerPremiumPlan() {
  const monthlyPrice = Math.max(10000, Number(env.customerPremiumMonthlyPrice || 0));
  const annualPrice = Math.max(120000, Number(env.customerPremiumAnnualPrice || 0));
  const currency = String(env.customerPremiumCurrency || "UGX").trim().toUpperCase();
  return {
    tier: CUSTOMER_PREMIUM_TIER,
    name: "Customer Premium",
    monthlyPrice,
    annualPrice,
    currency,
    features: {
      smartMatch: true,
      rankedRecommendations: true,
      budgetMatching: true,
      availabilityMatching: true,
      paymentMatching: true,
    },
  };
}

export function getCustomerPremiumPrice(billingCycle = "monthly") {
  const plan = getCustomerPremiumPlan();
  return normalizeBillingCycle(billingCycle) === "annual" ? Number(plan.annualPrice || 0) : Number(plan.monthlyPrice || 0);
}

export function getCustomerSubscriptionEndDate(startedAt = new Date(), billingCycle = "monthly") {
  const date = startedAt instanceof Date ? new Date(startedAt) : new Date(startedAt);
  if (normalizeBillingCycle(billingCycle) === "annual") date.setFullYear(date.getFullYear() + 1);
  else date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

export function isActiveCustomerPremium(subscription, now = new Date()) {
  if (!subscription) return false;
  const tier = String(subscription.tier || "").trim().toUpperCase();
  const status = String(subscription.status || "").trim().toLowerCase();
  const paymentStatus = String(subscription.payment_status || "").trim().toLowerCase();
  if (tier !== CUSTOMER_PREMIUM_TIER) return false;
  if (!isFutureDate(subscription.expires_at, now)) return false;
  if (status === "active") return PAID_PAYMENT_STATUSES.has(paymentStatus);
  if (status === "trialing") return TRIAL_PAYMENT_STATUSES.has(paymentStatus);
  return false;
}

export async function getLatestCustomerSubscription(userId, client = null) {
  if (!client.get) {
    const query = await import("../db/query.js");
    client = { get: query.get };
  }
  return client.get(
    `SELECT *
     FROM customer_subscriptions
     WHERE user_id = ?
     ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
     LIMIT 1`,
    [userId]
  );
}

export async function getActiveCustomerPremiumSubscription(userId, client = null, now = new Date()) {
  if (!client.get) {
    const query = await import("../db/query.js");
    client = { get: query.get };
  }
  const latest = await client.get(
    `SELECT *
     FROM customer_subscriptions
     WHERE user_id = ?
       AND UPPER(tier) = ?
     ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
     LIMIT 1`,
    [userId, CUSTOMER_PREMIUM_TIER]
  );
  return isActiveCustomerPremium(latest, now) ? latest : null;
}

export async function getPendingCustomerPremiumPayment(userId, client = null) {
  if (!client.get) {
    const query = await import("../db/query.js");
    client = { get: query.get };
  }
  return client.get(
    `SELECT
       pt.*,
       cs.billing_cycle,
       cs.price,
       cs.currency,
       cs.expires_at AS subscription_expires_at
     FROM payment_transactions pt
     JOIN customer_subscriptions cs ON cs.id = pt.customer_subscription_id
     WHERE pt.user_id = ?
       AND pt.transaction_type = 'customer_subscription_payment'
       AND LOWER(pt.status) IN ('pending', 'processing', 'initiated')
       AND LOWER(cs.status) = 'pending'
       AND cs.expires_at IS NOT NULL
       AND cs.expires_at > CURRENT_TIMESTAMP
     ORDER BY pt.id DESC
     LIMIT 1`,
    [userId]
  );
}

export function mapCustomerSubscription(subscription = null) {
  const plan = getCustomerPremiumPlan();
  const active = isActiveCustomerPremium(subscription);
  if (!subscription) {
    return {
      tier: "FREE",
      name: "Free",
      status: "free",
      billingCycle: "",
      price: 0,
      currency: plan.currency,
      expires_at: null,
      activated_at: null,
      features: {
        smartMatch: false,
        rankedRecommendations: false,
      },
    };
  }

  return {
    id: subscription.id,
    tier: String(subscription.tier || CUSTOMER_PREMIUM_TIER).toUpperCase(),
    name: String(subscription.tier || "").toUpperCase() === CUSTOMER_PREMIUM_TIER ? plan.name : "Free",
    status: subscription.status || "pending",
    billingCycle: subscription.billing_cycle || "monthly",
    price: Number(subscription.price || 0),
    currency: subscription.currency || plan.currency,
    paymentStatus: subscription.payment_status || "pending",
    paymentReference: subscription.payment_reference || "",
    provider: subscription.provider || "",
    started_at: subscription.started_at || null,
    expires_at: subscription.expires_at || null,
    activated_at: subscription.activated_at || null,
    features: {
      ...plan.features,
      smartMatch: active,
      rankedRecommendations: active,
      budgetMatching: active,
      availabilityMatching: active,
      paymentMatching: active,
    },
  };
}
