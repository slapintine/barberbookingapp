/**
 * Central entitlement service — single source of truth for all feature gates.
 *
 * All permission checks read from active subscription records, never from
 * frontend-supplied values or stale booleans. Import this service from
 * controllers / middleware instead of scattering raw plan checks.
 */

import { getActiveCustomerPremiumSubscription } from "./customerSubscriptionService.js";
import { get } from "../db/query.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const PAID_STATUSES = new Set(["paid", "successful"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const PLATINUM_REVIEW_BLOCK_LIMIT = 10;

export const CUSTOMER_ENTITLEMENTS = Object.freeze({
  SMART_MATCH_PREVIEW: "customer.smart_match.preview",
  SMART_MATCH_FULL: "customer.smart_match.full",
  PROVIDER_COMPARE: "customer.provider_compare",
  FAVOURITES_BASIC: "customer.favourites.basic",
  FAVOURITES_EXPANDED: "customer.favourites.expanded",
  SMART_REBOOKING: "customer.smart_rebooking",
  EARLIER_SLOT_ALERTS: "customer.earlier_slot_alerts",
  ADVANCED_REMINDERS: "customer.advanced_reminders",
  PRIORITY_SUPPORT: "customer.priority_support",
});

export const CUSTOMER_PLAN_LIMITS = Object.freeze({
  FREE_FAVOURITES: 3,
  PREMIUM_FAVOURITES: 50,
  COMPARISON_PROVIDERS: 3,
  EARLIER_SLOT_ALERTS: 10,
});

export const PROVIDER_ENTITLEMENTS = Object.freeze({
  BASIC_PROFILE: "provider.basic_profile",
  RECEIVE_BOOKINGS: "provider.receive_bookings",
  BASIC_SCHEDULE: "provider.basic_schedule",
  BASIC_ANALYTICS: "provider.basic_analytics",
  PORTFOLIO_BASIC: "provider.portfolio.basic",
  PORTFOLIO_EXPANDED: "provider.portfolio.expanded",
  ASSISTANT_PREVIEW: "provider.assistant.preview",
  ASSISTANT_FULL: "provider.assistant.full",
  AUTOMATED_REMINDERS: "provider.automated_reminders",
  SMART_SCHEDULE: "provider.smart_schedule",
  CANCELLATION_INSIGHTS: "provider.cancellation_insights",
  REVENUE_ANALYTICS: "provider.revenue_analytics",
  RETENTION_TOOLS: "provider.retention_tools",
  PROMOTIONS: "provider.promotions",
  PROFILE_ASSISTANT: "provider.profile_assistant",
  RESPONSE_ASSISTANT: "provider.response_assistant",
  PRIORITY_SUPPORT: "provider.priority_support",
  STAFF_MANAGEMENT: "provider.staff_management",
  STAFF_ACCOUNTS: "provider.staff_accounts",
  STAFF_SCHEDULES: "provider.staff_schedules",
  STAFF_ASSIGNMENT: "provider.staff_assignment",
  STAFF_SERVICE_ASSIGNMENT: "provider.staff_service_assignment",
  MULTIPLE_LOCATIONS: "provider.multiple_locations",
  BRANCH_MANAGEMENT: "provider.branch_management",
  BRANCH_SCHEDULES: "provider.branch_schedules",
  BRANCH_ANALYTICS: "provider.branch_analytics",
  ADVANCED_REPORTS: "provider.advanced_reports",
  ADVANCED_EXPORTS: "provider.advanced_exports",
  ADVANCED_ASSISTANT: "provider.advanced_assistant",
  CROSS_STAFF_OPTIMIZATION: "provider.cross_staff_optimization",
  CROSS_BRANCH_INSIGHTS: "provider.cross_branch_insights",
  HIGHER_OPERATIONAL_LIMITS: "provider.higher_operational_limits",
});

export const PROVIDER_PLAN_LIMITS = Object.freeze({
  PREMIUM_ACTIVE_PROMOTIONS: 10,
  PREMIUM_RETENTION_RECIPIENTS: 10,
  PLATINUM_STAFF_MEMBERS: 25,
  PLATINUM_BRANCHES: 5,
  PLATINUM_REPORT_EXPORT_ROWS: 5000,
  PLATINUM_ACTIVE_INVITATIONS: 25,
});

function isFuture(value, now = new Date()) {
  if (!value) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.getTime() > now.getTime();
}

function normalizeProviderTier(value) {
  return String(value || "").trim().toUpperCase();
}

function isActiveProviderSubscription(sub, now = new Date()) {
  if (!sub) return false;
  const status = String(sub.status || "").toLowerCase();
  const payStatus = String(sub.payment_status || "").toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) return false;
  if (status === "trialing") return true; // trial validity checked by expiry below
  if (!PAID_STATUSES.has(payStatus)) return false;
  if (sub.expires_at && !isFuture(sub.expires_at, now)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function getActiveProviderSubscription(userId, client = null) {
  const q = client?.get ?? get;
  return q(
    `SELECT bs.*
     FROM barber_subscriptions bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.owner_user_id = ?
       AND LOWER(bs.status) IN ('active', 'trialing')
     ORDER BY bs.id DESC
     LIMIT 1`,
    [userId]
  );
}

async function getProviderBarber(userId, client = null) {
  const q = client?.get ?? get;
  return q(
    `SELECT b.*, bs.tier AS sub_tier, bs.status AS sub_status, bs.payment_status,
            bs.expires_at AS sub_expires_at
     FROM barbers b
     LEFT JOIN barber_subscriptions bs ON bs.barber_id = b.id
       AND LOWER(bs.status) IN ('active', 'trialing')
     WHERE b.owner_user_id = ?
     ORDER BY bs.id DESC
     LIMIT 1`,
    [userId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer entitlements
// ─────────────────────────────────────────────────────────────────────────────

export async function canUseSmartMatch(userId) {
  const sub = await getActiveCustomerPremiumSubscription(userId);
  return Boolean(sub);
}

export function buildCustomerEntitlementSnapshot(subscription = null) {
  const premium = Boolean(subscription);
  const entitlements = {
    [CUSTOMER_ENTITLEMENTS.SMART_MATCH_PREVIEW]: true,
    [CUSTOMER_ENTITLEMENTS.SMART_MATCH_FULL]: premium,
    [CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE]: premium,
    [CUSTOMER_ENTITLEMENTS.FAVOURITES_BASIC]: true,
    [CUSTOMER_ENTITLEMENTS.FAVOURITES_EXPANDED]: premium,
    [CUSTOMER_ENTITLEMENTS.SMART_REBOOKING]: premium,
    [CUSTOMER_ENTITLEMENTS.EARLIER_SLOT_ALERTS]: premium,
    [CUSTOMER_ENTITLEMENTS.ADVANCED_REMINDERS]: premium,
    [CUSTOMER_ENTITLEMENTS.PRIORITY_SUPPORT]: premium,
  };

  return {
    plan: premium ? "PREMIUM" : "FREE",
    premium,
    entitlements,
    limits: {
      favourites: premium ? CUSTOMER_PLAN_LIMITS.PREMIUM_FAVOURITES : CUSTOMER_PLAN_LIMITS.FREE_FAVOURITES,
      comparisonProviders: premium ? CUSTOMER_PLAN_LIMITS.COMPARISON_PROVIDERS : 0,
      earlierSlotAlerts: premium ? CUSTOMER_PLAN_LIMITS.EARLIER_SLOT_ALERTS : 0,
    },
  };
}

export async function getCustomerEntitlementSnapshot(userId, client = null) {
  const sub = await getActiveCustomerPremiumSubscription(userId, client);
  return buildCustomerEntitlementSnapshot(sub);
}

export async function assertCustomerEntitlement(userId, entitlementKey, client = null) {
  const snapshot = await getCustomerEntitlementSnapshot(userId, client);
  if (snapshot.entitlements?.[entitlementKey]) return snapshot;
  const error = new Error("Customer Premium is required for this feature.");
  error.statusCode = 403;
  error.code = "CUSTOMER_PREMIUM_REQUIRED";
  error.entitlement = entitlementKey;
  throw error;
}

export async function getCustomerEntitlements(userId) {
  const snapshot = await getCustomerEntitlementSnapshot(userId);
  const premium = snapshot.premium;
  return {
    ...snapshot.entitlements,
    plan: snapshot.plan,
    limits: snapshot.limits,
    smartMatch: premium,
    rankedRecommendations: premium,
    budgetMatching: premium,
    availabilityMatching: premium,
    paymentMatching: premium,
    premiumSupport: premium,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider entitlements
// ─────────────────────────────────────────────────────────────────────────────

export async function getProviderTier(userId) {
  const sub = await getActiveProviderSubscription(userId);
  if (!sub || !isActiveProviderSubscription(sub)) return null;
  return normalizeProviderTier(sub.tier);
}

export function buildProviderEntitlementSnapshot(subscription = null) {
  const tier = subscription && isActiveProviderSubscription(subscription)
    ? normalizeProviderTier(subscription.tier)
    : "FREE";
  const premium = tier === "PREMIUM" || tier === "PLATINUM";
  const platinum = tier === "PLATINUM";

  const entitlements = {
    [PROVIDER_ENTITLEMENTS.BASIC_PROFILE]: true,
    [PROVIDER_ENTITLEMENTS.RECEIVE_BOOKINGS]: true,
    [PROVIDER_ENTITLEMENTS.BASIC_SCHEDULE]: true,
    [PROVIDER_ENTITLEMENTS.BASIC_ANALYTICS]: true,
    [PROVIDER_ENTITLEMENTS.PORTFOLIO_BASIC]: true,
    [PROVIDER_ENTITLEMENTS.PORTFOLIO_EXPANDED]: premium,
    [PROVIDER_ENTITLEMENTS.ASSISTANT_PREVIEW]: true,
    [PROVIDER_ENTITLEMENTS.ASSISTANT_FULL]: premium,
    [PROVIDER_ENTITLEMENTS.AUTOMATED_REMINDERS]: premium,
    [PROVIDER_ENTITLEMENTS.SMART_SCHEDULE]: premium,
    [PROVIDER_ENTITLEMENTS.CANCELLATION_INSIGHTS]: premium,
    [PROVIDER_ENTITLEMENTS.REVENUE_ANALYTICS]: premium,
    [PROVIDER_ENTITLEMENTS.RETENTION_TOOLS]: premium,
    [PROVIDER_ENTITLEMENTS.PROMOTIONS]: premium,
    [PROVIDER_ENTITLEMENTS.PROFILE_ASSISTANT]: premium,
    [PROVIDER_ENTITLEMENTS.RESPONSE_ASSISTANT]: premium,
    [PROVIDER_ENTITLEMENTS.PRIORITY_SUPPORT]: premium,
    [PROVIDER_ENTITLEMENTS.STAFF_MANAGEMENT]: platinum,
    [PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS]: platinum,
    [PROVIDER_ENTITLEMENTS.STAFF_SCHEDULES]: platinum,
    [PROVIDER_ENTITLEMENTS.STAFF_ASSIGNMENT]: platinum,
    [PROVIDER_ENTITLEMENTS.STAFF_SERVICE_ASSIGNMENT]: platinum,
    [PROVIDER_ENTITLEMENTS.MULTIPLE_LOCATIONS]: platinum,
    [PROVIDER_ENTITLEMENTS.BRANCH_MANAGEMENT]: platinum,
    [PROVIDER_ENTITLEMENTS.BRANCH_SCHEDULES]: platinum,
    [PROVIDER_ENTITLEMENTS.BRANCH_ANALYTICS]: platinum,
    [PROVIDER_ENTITLEMENTS.ADVANCED_REPORTS]: platinum,
    [PROVIDER_ENTITLEMENTS.ADVANCED_EXPORTS]: platinum,
    [PROVIDER_ENTITLEMENTS.ADVANCED_ASSISTANT]: platinum,
    [PROVIDER_ENTITLEMENTS.CROSS_STAFF_OPTIMIZATION]: platinum,
    [PROVIDER_ENTITLEMENTS.CROSS_BRANCH_INSIGHTS]: platinum,
    [PROVIDER_ENTITLEMENTS.HIGHER_OPERATIONAL_LIMITS]: platinum,
  };

  return {
    tier,
    premium,
    platinum,
    entitlements,
    limits: {
      activePromotions: premium ? PROVIDER_PLAN_LIMITS.PREMIUM_ACTIVE_PROMOTIONS : 0,
      retentionRecipients: premium ? PROVIDER_PLAN_LIMITS.PREMIUM_RETENTION_RECIPIENTS : 0,
      staffMembers: platinum ? PROVIDER_PLAN_LIMITS.PLATINUM_STAFF_MEMBERS : 0,
      branches: platinum ? PROVIDER_PLAN_LIMITS.PLATINUM_BRANCHES : 1,
      reportExportRows: platinum ? PROVIDER_PLAN_LIMITS.PLATINUM_REPORT_EXPORT_ROWS : 0,
      activeInvitations: platinum ? PROVIDER_PLAN_LIMITS.PLATINUM_ACTIVE_INVITATIONS : 0,
    },
  };
}

export async function getProviderEntitlementSnapshot(userId, client = null) {
  const sub = await getActiveProviderSubscription(userId, client);
  return buildProviderEntitlementSnapshot(sub);
}

export async function assertProviderEntitlement(userId, entitlementKey, client = null) {
  const snapshot = await getProviderEntitlementSnapshot(userId, client);
  if (snapshot.entitlements?.[entitlementKey]) return snapshot;
  const requiresPlatinum = [
    PROVIDER_ENTITLEMENTS.STAFF_MANAGEMENT,
    PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS,
    PROVIDER_ENTITLEMENTS.STAFF_SCHEDULES,
    PROVIDER_ENTITLEMENTS.STAFF_ASSIGNMENT,
    PROVIDER_ENTITLEMENTS.STAFF_SERVICE_ASSIGNMENT,
    PROVIDER_ENTITLEMENTS.MULTIPLE_LOCATIONS,
    PROVIDER_ENTITLEMENTS.BRANCH_MANAGEMENT,
    PROVIDER_ENTITLEMENTS.BRANCH_SCHEDULES,
    PROVIDER_ENTITLEMENTS.BRANCH_ANALYTICS,
    PROVIDER_ENTITLEMENTS.ADVANCED_REPORTS,
    PROVIDER_ENTITLEMENTS.ADVANCED_EXPORTS,
    PROVIDER_ENTITLEMENTS.ADVANCED_ASSISTANT,
    PROVIDER_ENTITLEMENTS.CROSS_STAFF_OPTIMIZATION,
    PROVIDER_ENTITLEMENTS.CROSS_BRANCH_INSIGHTS,
    PROVIDER_ENTITLEMENTS.HIGHER_OPERATIONAL_LIMITS,
  ].includes(entitlementKey);
  const error = new Error(requiresPlatinum ? "Provider Platinum is required for this feature." : "Provider Premium is required for this feature.");
  error.statusCode = 403;
  error.code = requiresPlatinum ? "PROVIDER_PLATINUM_REQUIRED" : "PROVIDER_PREMIUM_REQUIRED";
  error.entitlement = entitlementKey;
  throw error;
}

export async function canAccessProviderAnalytics(userId) {
  const tier = await getProviderTier(userId);
  return tier === "PREMIUM" || tier === "PLATINUM";
}

export async function canAccessBusinessCoach(userId) {
  const tier = await getProviderTier(userId);
  return tier === "PREMIUM" || tier === "PLATINUM";
}

export async function canUsePlatinumProviderFeatures(userId) {
  const tier = await getProviderTier(userId);
  return tier === "PLATINUM";
}

export async function canBlockNegativeReview(userId) {
  const tier = await getProviderTier(userId);
  if (tier !== "PLATINUM") return { allowed: false, reason: "Requires Platinum Provider plan." };

  const barber = await getProviderBarber(userId);
  if (!barber) return { allowed: false, reason: "No provider profile found." };

  const blockedCount = await get(
    `SELECT COUNT(*) AS cnt FROM reviews
     WHERE barber_id = ? AND blocked_from_public = 1`,
    [barber.id]
  );
  const count = Number(blockedCount?.cnt || 0);
  if (count >= PLATINUM_REVIEW_BLOCK_LIMIT) {
    return {
      allowed: false,
      reason: `Platinum plan limit reached: ${PLATINUM_REVIEW_BLOCK_LIMIT} reviews blocked.`,
      blockedCount: count,
      limit: PLATINUM_REVIEW_BLOCK_LIMIT,
    };
  }
  return { allowed: true, blockedCount: count, limit: PLATINUM_REVIEW_BLOCK_LIMIT };
}

export async function getRemainingBlockedReviewSlots(userId) {
  const tier = await getProviderTier(userId);
  if (tier !== "PLATINUM") return 0;

  const barber = await getProviderBarber(userId);
  if (!barber) return 0;

  const row = await get(
    `SELECT COUNT(*) AS cnt FROM reviews WHERE barber_id = ? AND blocked_from_public = 1`,
    [barber.id]
  );
  return Math.max(0, PLATINUM_REVIEW_BLOCK_LIMIT - Number(row?.cnt || 0));
}

export async function getProviderEntitlements(userId) {
  const snapshot = await getProviderEntitlementSnapshot(userId);
  const tier = snapshot.tier;
  const isPremium = snapshot.premium;
  const isPlatinum = snapshot.platinum;

  return {
    ...snapshot.entitlements,
    tier,
    limits: snapshot.limits,
    advancedAnalytics: isPremium,
    aiBusinessCoach: isPremium,
    reviewInsights: isPremium,
    promotionsEnabled: isPremium,
    homeServiceEnabled: isPremium,
    marketingPushEnabled: isPremium,
    priorityRanking: isPremium,
    homepageFeatured: isPlatinum,
    videoUploads: isPlatinum,
    customBanner: isPlatinum,
    aiWeeklyReport: isPlatinum,
    topBarberBadge: isPlatinum,
    verifiedBadge: isPlatinum,
    adsPlacement: isPlatinum,
    reviewBlocking: isPlatinum,
    reviewBlockingLimit: isPlatinum ? PLATINUM_REVIEW_BLOCK_LIMIT : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined entitlements (used by profile summary)
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserEntitlements(userId) {
  const [customer, provider] = await Promise.all([
    getCustomerEntitlements(userId),
    getProviderEntitlements(userId),
  ]);
  return { customer, provider };
}
