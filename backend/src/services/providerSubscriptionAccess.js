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
    return PAID_PAYMENT_STATUSES.has(paymentStatus) && isFutureDate(expiry, now);
  }

  if (status === "trialing") {
    const validTrialState = trialStatus === "active" || trialStatus === "trialing" || TRIAL_PAYMENT_STATUSES.has(paymentStatus);
    return validTrialState && isFutureDate(trialExpiry || expiry, now);
  }

  return false;
}
