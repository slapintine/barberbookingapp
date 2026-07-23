/**
 * Subscription summary service — unified view of both customer and provider
 * memberships for a single user. Used by GET /api/subscriptions/me.
 *
 * This is the single authoritative response that frontends (app + website) use
 * to hydrate profile badges, dashboard headers, and entitlement gates.
 */

import { get } from "../db/query.js";
import {
  getActiveCustomerPremiumSubscription,
  getLatestCustomerSubscription,
  getPendingCustomerPremiumPayment,
  isActiveCustomerPremium,
  mapCustomerSubscription,
  getCustomerPremiumPlan,
} from "./customerSubscriptionService.js";
import {
  getSubscriptionTierConfig,
  getSubscriptionPlans,
  normalizeProviderPlan,
} from "./paymentService.js";
import { getCustomerEntitlements, getProviderEntitlements } from "./entitlementService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PAID_STATUSES = new Set(["paid", "successful"]);

function isFuture(value, now = new Date()) {
  if (!value) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.getTime() > now.getTime();
}

function isActiveProviderSub(sub, now = new Date()) {
  if (!sub) return false;
  const status = String(sub.status || "").toLowerCase();
  const payStatus = String(sub.payment_status || "").toLowerCase();
  if (status === "trialing") return !sub.expires_at || isFuture(sub.expires_at, now);
  if (status !== "active") return false;
  if (!PAID_STATUSES.has(payStatus)) return false;
  if (sub.expires_at && !isFuture(sub.expires_at, now)) return false;
  return true;
}

async function getLatestProviderSubscription(userId) {
  return get(
    `SELECT bs.*
     FROM barber_subscriptions bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE b.owner_user_id = ?
     ORDER BY bs.id DESC
     LIMIT 1`,
    [userId]
  );
}

async function getProviderBarber(userId) {
  return get(
    `SELECT b.* FROM barbers b WHERE b.owner_user_id = ? LIMIT 1`,
    [userId]
  );
}

async function getPendingProviderPayment(barberId) {
  return get(
    `SELECT pt.*, bs.tier, bs.billing_cycle
     FROM payment_transactions pt
     JOIN barber_subscriptions bs ON bs.id = pt.subscription_id
     WHERE pt.barber_id = ?
       AND pt.transaction_type = 'subscription_payment'
       AND LOWER(pt.status) IN ('pending', 'processing', 'initiated')
       AND LOWER(bs.status) = 'pending'
     ORDER BY pt.id DESC
     LIMIT 1`,
    [barberId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Display name resolvers
// ─────────────────────────────────────────────────────────────────────────────

function resolveCustomerDisplayName(sub) {
  if (!sub) return "Free Customer";
  if (isActiveCustomerPremium(sub)) return "Premium Customer";
  const status = String(sub.status || "").toLowerCase();
  if (status === "pending") return "Free Customer"; // pending payment has not upgraded the customer plan yet.
  return "Free Customer";
}

function resolveProviderDisplayName(tier, status) {
  const t = String(tier || "").trim().toUpperCase();
  const s = String(status || "").toLowerCase();
  if (s !== "active" && s !== "trialing") return null; // no active provider plan
  if (t === "PLATINUM") return "Platinum Provider";
  if (t === "PREMIUM") return "Premium Provider";
  if (t === "FREE") return "Free Provider";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: build the full summary
// ─────────────────────────────────────────────────────────────────────────────

export async function buildSubscriptionSummary(userId) {
  const now = new Date();

  // Fetch all data in parallel
  const [
    activeCustomerSub,
    latestCustomerSub,
    pendingCustomerPayment,
    latestProviderSub,
    providerBarber,
    customerEntitlements,
    providerEntitlements,
  ] = await Promise.all([
    getActiveCustomerPremiumSubscription(userId).catch(() => null),
    getLatestCustomerSubscription(userId).catch(() => null),
    getPendingCustomerPremiumPayment(userId).catch(() => null),
    getLatestProviderSubscription(userId).catch(() => null),
    getProviderBarber(userId).catch(() => null),
    getCustomerEntitlements(userId).catch(() => ({ smartMatch: false })),
    getProviderEntitlements(userId).catch(() => ({ tier: "NONE" })),
  ]);

  // ── Customer membership ───────────────────────────────────────────────────
  const customerActive = Boolean(activeCustomerSub);
  const customerMapped = mapCustomerSubscription(activeCustomerSub || latestCustomerSub);
  const customerTier = customerActive ? "premium" : "free";
  const customerPlan = getCustomerPremiumPlan();

  const customerSummary = {
    planCode: customerActive ? "customer_premium" : "customer_free",
    tier: customerActive ? "PREMIUM" : "FREE",
    plan: customerActive ? "PREMIUM" : "FREE",
    active: customerActive,
    subscription: customerMapped,
    displayName: resolveCustomerDisplayName(activeCustomerSub || latestCustomerSub),
    status: customerActive
      ? "active"
      : latestCustomerSub?.status === "pending"
      ? "pending"
      : "free",
    billingPeriod: customerMapped.billingCycle || null,
    amountPaid: customerActive ? Number(activeCustomerSub?.amount_paid || 0) : 0,
    currency: customerPlan.currency,
    startsAt: activeCustomerSub?.started_at || activeCustomerSub?.activated_at || null,
    currentPeriodEnd: activeCustomerSub?.expires_at || null,
    expiresAt: activeCustomerSub?.expires_at || null,
    activatedAt: activeCustomerSub?.activated_at || null,
    autoRenew: false,
    pendingPayment: pendingCustomerPayment
      ? {
          reference: pendingCustomerPayment.internal_reference,
          provider: pendingCustomerPayment.provider,
          amount: Number(pendingCustomerPayment.gross_amount || 0),
          billingCycle: pendingCustomerPayment.billing_cycle || "monthly",
        }
      : null,
    entitlements: customerEntitlements,
    planInfo: {
      monthlyPrice: customerPlan.monthlyPrice,
      annualPrice: customerPlan.annualPrice,
      currency: customerPlan.currency,
    },
  };

  // ── Provider membership ───────────────────────────────────────────────────
  const providerPaidActive = Boolean(latestProviderSub && isActiveProviderSub(latestProviderSub, now));
  const providerStoredStatus = String(providerBarber?.subscription_status || "").toLowerCase();
  const providerStoredTier =
    !latestProviderSub && ["active", "trialing", "manual_approved", "admin_approved", "approved"].includes(providerStoredStatus)
      ? normalizeProviderPlan(providerBarber?.subscription_tier)
      : "";
  const providerTier = providerPaidActive
    ? normalizeProviderPlan(latestProviderSub.tier) || "FREE"
    : providerBarber
    ? providerStoredTier || "FREE"
    : null;
  const providerActive = Boolean(providerBarber && providerTier);
  const providerTierConfig = providerTier ? getSubscriptionTierConfig(providerTier) : null;
  const pendingProviderPayment = providerBarber
    ? await getPendingProviderPayment(providerBarber.id).catch(() => null)
    : null;

  const providerSummary = providerBarber
    ? {
        planCode: providerActive
          ? `provider_${(providerTier || "free").toLowerCase()}`
          : "provider_free",
        tier: providerTier || "FREE",
        plan: providerTier || "FREE",
        active: providerActive,
        displayName: resolveProviderDisplayName(
          providerTier || "FREE",
          providerActive ? "active" : "free"
        ),
        status: providerActive
          ? providerPaidActive
            ? String(latestProviderSub.status || "active").toLowerCase()
            : "free"
          : latestProviderSub
          ? String(latestProviderSub.status || "none").toLowerCase()
          : "free",
        billingPeriod: latestProviderSub?.billing_cycle || null,
        amountPaid: providerPaidActive ? Number(latestProviderSub?.amount_paid || 0) : 0,
        currency: "UGX",
        startsAt: providerPaidActive ? latestProviderSub?.started_at || latestProviderSub?.activated_at || null : null,
        currentPeriodEnd: providerPaidActive ? latestProviderSub?.expires_at || null : null,
        expiresAt: providerPaidActive ? latestProviderSub?.expires_at || null : null,
        activatedAt: providerPaidActive ? latestProviderSub?.activated_at || null : null,
        autoRenew: false,
        isTrial: Boolean(latestProviderSub?.status === "trialing"),
        pendingPayment: pendingProviderPayment
          ? {
              reference: pendingProviderPayment.internal_reference,
              tier: pendingProviderPayment.tier,
              provider: pendingProviderPayment.provider,
              amount: Number(pendingProviderPayment.gross_amount || 0),
              billingCycle: pendingProviderPayment.billing_cycle || "monthly",
            }
          : null,
        entitlements: providerEntitlements,
        planInfo: providerTierConfig
          ? {
              monthlyPrice: providerTierConfig.monthlyPrice,
              annualPrice: providerTierConfig.annualPrice,
              currency: providerTierConfig.currency,
            }
          : null,
        businessName: providerBarber.business_name || null,
        businessId: providerBarber.id || null,
        verificationStatus: providerBarber.verified_status || null,
      }
    : null;

  // ── Composite display labels (used in profile header) ─────────────────────
  const badges = [];
  if (customerActive) {
    badges.push({
      key: "customer_premium",
      label: "Premium Customer",
      scope: "customer",
      tier: "premium",
      status: "active",
    });
  } else {
    badges.push({
      key: "customer_free",
      label: "Free Customer",
      scope: "customer",
      tier: "free",
      status: "free",
    });
  }
  if (providerActive && providerTier) {
    const providerLabel = resolveProviderDisplayName(providerTier, "active");
    if (providerLabel) {
      badges.push({
        key: `provider_${providerTier.toLowerCase()}`,
        label: providerLabel,
        scope: "provider",
        tier: providerTier.toLowerCase(),
        status: "active",
      });
    }
  } else if (providerBarber && !providerActive) {
    badges.push({
      key: "provider_free",
      label: "Free Provider",
      scope: "provider",
      tier: "free",
      status: "free",
    });
  }

  return {
    customer: customerSummary,
    provider: providerSummary,
    customerPlan: customerActive ? "PREMIUM" : "FREE",
    providerPlan: providerTier || "FREE",
    customerPremiumActive: customerActive,
    providerPlanActive: providerActive,
    entitlements: {
      smartMatch: Boolean(customerEntitlements.smartMatch),
      conversationalSmartMatch: Boolean(customerEntitlements.conversationalSmartMatch),
      savedSmartMatchPreferences: Boolean(customerEntitlements.savedSmartMatchPreferences),
      providerCoach: Boolean(providerEntitlements.providerCoach || providerEntitlements.aiBusinessCoach),
      providerAssistantBasic: Boolean(providerEntitlements.providerAssistantBasic || providerEntitlements.providerCoach),
      providerAssistantAnalytics: Boolean(providerEntitlements.providerAssistantAnalytics),
      providerAssistantForecasting: Boolean(providerEntitlements.providerAssistantForecasting),
      advancedReports: Boolean(providerEntitlements.advancedReports),
      featuredPlacement: Boolean(providerEntitlements.featuredPlacement || providerEntitlements.homepageFeatured),
      providerAnalytics: Boolean(providerEntitlements.providerAnalytics || providerEntitlements.advancedAnalytics),
      customerCapabilities: customerEntitlements.capabilities || [],
      providerCapabilities: providerEntitlements.capabilities || [],
    },
    badges,
    hasProviderProfile: Boolean(providerBarber),
  };
}
