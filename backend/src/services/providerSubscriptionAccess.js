import { normalizeProviderPlan } from "./paymentService.js";

const PAID_PAYMENT_STATUSES = new Set(["paid", "successful"]);
const TRIAL_PAYMENT_STATUSES = new Set(["trial", "trialing", "free_trial"]);

function isFutureDate(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}

export async function getLatestProviderSubscription(businessId, client = null) {
  if (!client?.get) {
    const query = await import("../db/query.js");
    client = { get: query.get };
  }
  return client.get(
    `SELECT *
     FROM barber_subscriptions
     WHERE barber_id = ?
     ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
     LIMIT 1`,
    [businessId]
  );
}

export function isActiveProviderPlatinum(business, subscription, now = new Date()) {
  if (!subscription) return false;
  const tier = normalizeProviderPlan(subscription.tier);
  if (tier !== "PLATINUM") return false;

  const status = String(subscription?.status || "").trim().toLowerCase();
  const paymentStatus = String(subscription?.payment_status || "").trim().toLowerCase();
  const trialStatus = String(subscription?.trial_status || business?.trial_status || "").trim().toLowerCase();
  const expiry = subscription?.expires_at;
  const trialExpiry = subscription?.trial_ends_at || business?.trial_ends_at;

  if (status === "active") {
    return PAID_PAYMENT_STATUSES.has(paymentStatus) && (expiry ? isFutureDate(expiry, now) : true);
  }

  if (status === "trialing") {
    const validTrialState = trialStatus === "active" || trialStatus === "trialing" || TRIAL_PAYMENT_STATUSES.has(paymentStatus);
    return validTrialState && isFutureDate(trialExpiry || expiry, now);
  }

  return false;
}

export function getProviderCoachPlan(business, subscription, now = new Date()) {
  const subscriptionTier = normalizeProviderPlan(subscription?.tier);
  const businessTier = normalizeProviderPlan(
    business?.subscription_tier || business?.selected_plan || "FREE"
  );
  const tier = subscriptionTier || businessTier || "FREE";

  if (tier === "FREE") {
    return { plan: "free", active: true, unlimited: false };
  }

  const status = String(subscription?.status || business?.subscription_status || "").trim().toLowerCase();
  const paymentStatus = String(subscription?.payment_status || "").trim().toLowerCase();
  const trialStatus = String(subscription?.trial_status || business?.trial_status || "").trim().toLowerCase();
  const expiry = subscription?.expires_at || business?.subscription_expires_at;
  const trialExpiry = subscription?.trial_ends_at || business?.trial_ends_at;

  // If expires_at is present, require it to be in the future.
  // If expires_at is missing (e.g. admin-provisioned or data gap), trust status+payment_status.
  const paidActive =
    status === "active" &&
    PAID_PAYMENT_STATUSES.has(paymentStatus) &&
    (expiry ? isFutureDate(expiry, now) : true);
  const trialActive =
    status === "trialing" &&
    (trialStatus === "active" || trialStatus === "trialing" || TRIAL_PAYMENT_STATUSES.has(paymentStatus)) &&
    isFutureDate(trialExpiry || expiry, now);
  const adminActive =
    ["manual_approved", "admin_approved", "approved"].includes(status) ||
    Number(business?.admin_approved || 0) === 1;

  if (tier === "PLATINUM") {
    return { plan: "platinum", active: paidActive || trialActive || adminActive, unlimited: true };
  }

  if (tier === "PREMIUM") {
    return { plan: "premium", active: paidActive || trialActive || adminActive, unlimited: false };
  }

  return { plan: "free", active: true, unlimited: false };
}
