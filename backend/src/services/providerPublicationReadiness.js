import { all } from "../db/query.js";
import { isBusinessPubliclyVisible, isDemoLikeBusiness } from "./businessVisibility.js";

const VALID_PLANS = new Set(["FREE", "PREMIUM", "PLATINUM"]);
const PUBLIC_STATUSES = new Set(["active", "approved", "live"]);

function normalize(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function normalizeUpper(value) {
  return normalize(value).toUpperCase();
}

function isFutureDate(value, now = new Date()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function latestSubscriptionFor(subscriptions = []) {
  return [...subscriptions].sort((a, b) => {
    const aTime = new Date(a.activated_at || a.started_at || a.created_at || 0).getTime();
    const bTime = new Date(b.activated_at || b.started_at || b.created_at || 0).getTime();
    return bTime - aTime || Number(b.id || 0) - Number(a.id || 0);
  })[0] || null;
}

function missingRequiredFields(row = {}) {
  const missing = [];
  if (!normalize(row.business_name)) missing.push("business_name");
  if (!normalize(row.location)) missing.push("location");
  if (!Number(row.owner_user_id || 0)) missing.push("owner_user_id");
  if (!normalize(row.business_type)) missing.push("business_type");
  return missing;
}

function analyzeBusiness(row, latestSubscription, now) {
  const businessStatus = normalizeLower(row.business_status);
  const published = Number(row.is_published || 0) === 1;
  const plan = normalizeUpper(latestSubscription?.tier || row.subscription_tier);
  const subscriptionStatus = normalizeLower(latestSubscription?.status || row.subscription_status);
  const serviceCount = Number(row.service_count || 0);
  const adminApproved = Number(row.admin_approved || 0) === 1;
  const demoLike = isDemoLikeBusiness(row);
  const hasActiveSubscription =
    plan === "FREE" && subscriptionStatus === "active"
      ? true
      : subscriptionStatus === "active" &&
        isFutureDate(latestSubscription?.expires_at || row.subscription_expires_at, now);
  const missingFields = missingRequiredFields(row);
  const missingServicesOrCategories = serviceCount === 0 || !normalize(row.business_type);
  const publicVisible = isBusinessPubliclyVisible(row, latestSubscription, now);

  const blockers = [];
  if (normalizeLower(row.deleted_at)) blockers.push("soft_deleted");
  if (Number(row.is_demo || 0) === 1 || demoLike) blockers.push("demo_or_test_like_business");
  if (!PUBLIC_STATUSES.has(businessStatus)) blockers.push("inactive_or_non_public_status");
  if (!published) blockers.push("not_published");
  if (!VALID_PLANS.has(plan)) blockers.push("missing_or_invalid_plan");
  if (!hasActiveSubscription && !adminApproved) blockers.push("missing_subscription_or_admin_approval");
  if (missingFields.length) blockers.push("missing_required_business_fields");
  if (missingServicesOrCategories) blockers.push("missing_services_or_category");

  return {
    id: row.id,
    businessName: row.business_name || `Business #${row.id}`,
    ownerUserId: row.owner_user_id || null,
    ownerUsername: row.owner_username || "",
    ownerEmail: row.owner_email || "",
    businessStatus: businessStatus || "unknown",
    isPublished: published,
    isDemo: Number(row.is_demo || 0) === 1,
    plan: plan || "NONE",
    subscriptionStatus: subscriptionStatus || "none",
    subscriptionExpiresAt: latestSubscription?.expires_at || row.subscription_expires_at || null,
    trialStatus: "none",
    trialEndsAt: null,
    adminApproved,
    serviceCount,
    businessType: row.business_type || "",
    mapIconType: row.map_icon_type || "",
    missingFields,
    blockers,
    publicVisible,
  };
}

export async function getProviderPublicationReadiness({ limit = 100 } = {}) {
  const now = new Date();
  const [businesses, subscriptions] = await Promise.all([
    all(
      `SELECT b.id,
              b.owner_user_id,
              b.business_name,
              b.location,
              b.business_type,
              b.map_icon_type,
              b.business_status,
              b.is_published,
              b.is_demo,
              b.subscription_tier,
              b.subscription_status,
              b.subscription_expires_at,
              b.trial_status,
              b.trial_ends_at,
              b.admin_approved,
              b.deleted_at,
              u.username AS owner_username,
              p.email AS owner_email,
              (SELECT COUNT(*) FROM barber_services s WHERE s.barber_id = b.id) AS service_count
       FROM barbers b
       LEFT JOIN users u ON u.id = b.owner_user_id
       LEFT JOIN profiles p ON p.user_id = b.owner_user_id
       ORDER BY b.id DESC`
    ),
    all(
      `SELECT id,
              barber_id,
              tier,
              status,
              payment_status,
              provider,
              started_at,
              expires_at,
              activated_at,
              created_at,
              updated_at
       FROM barber_subscriptions
       ORDER BY barber_id ASC, id DESC`
    ),
  ]);

  const subscriptionsByBusiness = new Map();
  for (const subscription of subscriptions) {
    const key = Number(subscription.barber_id);
    if (!subscriptionsByBusiness.has(key)) subscriptionsByBusiness.set(key, []);
    subscriptionsByBusiness.get(key).push(subscription);
  }

  const businessesReadiness = businesses.map((row) =>
    analyzeBusiness(row, latestSubscriptionFor(subscriptionsByBusiness.get(Number(row.id)) || []), now)
  );

  const hidden = businessesReadiness.filter((item) => !item.publicVisible);
  const inactive = businessesReadiness.filter((item) => item.blockers.includes("inactive_or_non_public_status"));
  const unpublished = businessesReadiness.filter((item) => item.blockers.includes("not_published"));
  const missingSubscriptionOrPlan = businessesReadiness.filter((item) =>
    item.blockers.includes("missing_or_invalid_plan") ||
    item.blockers.includes("missing_subscription_or_admin_approval")
  );
  const missingApproval = businessesReadiness.filter((item) =>
    item.blockers.includes("missing_subscription_or_admin_approval") && !item.adminApproved
  );
  const missingServicesOrCategories = businessesReadiness.filter((item) =>
    item.blockers.includes("missing_services_or_category")
  );

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalBusinesses: businessesReadiness.length,
      publicBusinesses: businessesReadiness.filter((item) => item.publicVisible).length,
      hiddenBusinesses: hidden.length,
      inactiveBusinesses: inactive.length,
      unpublishedBusinesses: unpublished.length,
      blockedByMissingSubscriptionOrPlan: missingSubscriptionOrPlan.length,
      blockedByMissingApproval: missingApproval.length,
      missingServicesOrCategories: missingServicesOrCategories.length,
    },
    businesses: businessesReadiness.slice(0, limit),
  };
}
