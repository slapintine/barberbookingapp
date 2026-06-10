import { normalizeProviderPlan } from "./paymentService.js";

const VALID_PUBLIC_STATUSES = new Set(["active", "approved", "live"]);
// Only truly terminal billing states prevent public visibility.
// Transient states (pending_subscription, draft, almost_ready) are NOT terminal —
// free-plan providers often sit in these states and should still appear publicly.
const BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  "cancelled",
  "expired",
  "payment_failed",
  "plan_required",
  "rejected",
  "suspended",
  "trial_expired",
  "subscription_expired",
]);

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function isFutureDate(value, now = new Date()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function isVerificationApproved(value) {
  const status = normalizedText(value);
  return ["approved", "verified", "complete", "completed"].includes(status);
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
  // Hard blocks — banned or suspended businesses never show publicly
  if (Number(business.is_banned ?? 0) === 1 || business.is_banned === true) return false;
  if (Number(business.is_suspended ?? 0) === 1 || business.is_suspended === true) return false;

  const plan = normalizeProviderPlan(latestSubscription?.tier || business.subscription_tier || business.plan || "FREE");
  const businessStatus = String(business.business_status || business.status || "").trim().toLowerCase();
  const subscriptionStatus = String(latestSubscription?.status || business.subscription_status || "").trim().toLowerCase();
  const isPublished = Number(business.is_published ?? business.isPublished ?? 0) === 1 || business.isPublished === true;

  // A published, live/active stand is publicly visible.
  // Subscription tier controls features (badges, analytics, coach) — NOT public visibility.
  // Only hard-blocked subscription states hide a stand.
  return (
    Boolean(plan) &&
    VALID_PUBLIC_STATUSES.has(businessStatus) &&
    isPublished &&
    !isDemoLikeBusiness(business) &&
    !BLOCKED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
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
  // A stand is publicly visible when it is published, live/active, and not banned/suspended/demo.
  // Subscription tier controls premium features — it does NOT gate public map/search visibility.
  // Blocked subscription states (cancelled, expired, suspended…) still hide the stand to prevent
  // misuse, but simply having no sub row is fine for FREE-tier providers.
  return `
    COALESCE(${prefix}is_banned, 0) = 0
    AND COALESCE(${prefix}is_suspended, 0) = 0
    AND ${prefix}business_status IN ('active', 'approved', 'live')
    AND COALESCE(${prefix}is_published, 0) = 1
    AND COALESCE(${prefix}is_demo, 0) = 0
    ${publicDemoNameExclusion(`${prefix}business_name`)}
    AND LOWER(COALESCE(${prefix}image, '')) NOT LIKE '%placeholder%'
    AND LOWER(COALESCE(${prefix}location, '')) NOT IN ('test location', 'demo location', 'sample location')
    AND COALESCE(${prefix}subscription_tier, 'FREE') IN ('FREE', 'PREMIUM', 'PLATINUM')
    AND LOWER(COALESCE(${prefix}subscription_status, 'active')) NOT IN (
      'cancelled',
      'expired',
      'payment_failed',
      'plan_required',
      'rejected',
      'suspended',
      'trial_expired',
      'subscription_expired'
    )
  `;
}

export function publicBusinessParams(_now = new Date()) {
  // No date params needed now that the subscription subquery is removed.
  return [];
}
