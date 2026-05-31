import { normalizeProviderPlan } from "./paymentService.js";

const VALID_PUBLIC_STATUSES = new Set(["active", "approved", "live"]);
const BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  "cancelled",
  "draft",
  "expired",
  "inactive",
  "pending_subscription",
  "pending_payment",
  "payment_failed",
  "plan_required",
  "rejected",
  "suspended",
  "trial_expired",
  "subscription_expired",
  "almost_ready",
]);

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function isFutureDate(value, now = new Date()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function isDemoLikeBusiness(business = {}) {
  const businessName = normalizedText(business.business_name || business.name);
  const image = normalizedText(business.image || business.profile_image || business.cover_image);
  const location = normalizedText(business.location);

  return (
    Number(business.is_demo ?? 0) === 1 ||
    business.is_demo === true ||
    /\b(demo|sample|fake|test)\b/.test(businessName) ||
    businessName.startsWith("qa ") ||
    businessName.startsWith("qa_") ||
    image.includes("placeholder") ||
    ["test location", "demo location", "sample location"].includes(location)
  );
}

export function isBusinessPubliclyVisible(business = {}, latestSubscription = null, now = new Date()) {
  const plan = normalizeProviderPlan(latestSubscription?.tier || business.subscription_tier || business.plan);
  const businessStatus = String(business.business_status || business.status || "").trim().toLowerCase();
  const subscriptionStatus = String(latestSubscription?.status || business.subscription_status || "").trim().toLowerCase();
  const trialStatus = String(business.trial_status || "").trim().toLowerCase();
  const isPublished = Number(business.is_published ?? business.isPublished ?? 0) === 1 || business.isPublished === true;
  const manuallyApproved =
    Number(business.admin_approved ?? 0) === 1 ||
    business.admin_approved === true ||
    ["approved", "manual_approved", "admin_approved"].includes(subscriptionStatus);

  const hasActiveSubscription =
    subscriptionStatus === "active" &&
    isFutureDate(latestSubscription?.expires_at || business.subscription_expires_at || business.subscriptionEndDate, now);

  const hasActiveTrial =
    subscriptionStatus === "trialing" &&
    trialStatus === "active" &&
    isFutureDate(business.trial_ends_at || business.trialEndDate, now);

  return (
    Boolean(plan) &&
    VALID_PUBLIC_STATUSES.has(businessStatus) &&
    isPublished &&
    !isDemoLikeBusiness(business) &&
    !BLOCKED_SUBSCRIPTION_STATUSES.has(subscriptionStatus) &&
    (hasActiveSubscription || hasActiveTrial || manuallyApproved)
  );
}

function publicDemoNameExclusion(column) {
  return `
    AND LOWER(COALESCE(${column}, '')) NOT IN ('demo', 'sample', 'fake', 'test')
    AND LOWER(COALESCE(${column}, '')) NOT LIKE 'demo %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% demo'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% demo %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE 'sample %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% sample'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% sample %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE 'fake %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% fake'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% fake %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE 'test %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% test'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE '% test %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE 'qa %'
    AND LOWER(COALESCE(${column}, '')) NOT LIKE 'qa\\_%' ESCAPE '\\'
  `;
}

export function publicBusinessWhere(alias = "b") {
  const prefix = alias ? `${alias}.` : "";
  const barberId = alias ? `${alias}.id` : "id";
  return `
    ${prefix}business_status IN ('active', 'approved', 'live')
    AND COALESCE(${prefix}is_published, 0) = 1
    AND COALESCE(${prefix}is_demo, 0) = 0
    ${publicDemoNameExclusion(`${prefix}business_name`)}
    AND LOWER(COALESCE(${prefix}image, '')) NOT LIKE '%placeholder%'
    AND LOWER(COALESCE(${prefix}location, '')) NOT IN ('test location', 'demo location', 'sample location')
    AND ${prefix}subscription_tier IN ('PLUS', 'PREMIUM', 'PLATINUM')
    AND LOWER(COALESCE(${prefix}subscription_status, '')) NOT IN (
      'cancelled',
      'draft',
      'expired',
      'inactive',
      'pending_subscription',
      'pending_payment',
      'payment_failed',
      'plan_required',
      'rejected',
      'suspended',
      'trial_expired',
      'subscription_expired',
      'almost_ready'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM barber_subscriptions public_bs
        WHERE public_bs.barber_id = ${barberId}
          AND public_bs.tier IN ('PLUS', 'PREMIUM', 'PLATINUM')
          AND LOWER(COALESCE(public_bs.status, '')) = 'active'
          AND public_bs.expires_at IS NOT NULL
          AND public_bs.expires_at > ?
      )
      OR (
        LOWER(COALESCE(${prefix}subscription_status, '')) IN ('approved', 'manual_approved', 'admin_approved')
        OR COALESCE(${prefix}admin_approved, 0) = 1
      )
      OR (
        LOWER(COALESCE(${prefix}subscription_status, '')) = 'active'
        AND ${prefix}subscription_expires_at IS NOT NULL
        AND ${prefix}subscription_expires_at > ?
      )
      OR (
        LOWER(COALESCE(${prefix}subscription_status, '')) = 'trialing'
        AND
        LOWER(COALESCE(${prefix}trial_status, '')) = 'active'
        AND ${prefix}trial_ends_at IS NOT NULL
        AND ${prefix}trial_ends_at > ?
      )
    )
  `;
}

export function publicBusinessParams(now = new Date()) {
  const value = now.toISOString();
  return [value, value, value];
}
