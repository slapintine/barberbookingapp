/**
 * Membership display utilities.
 *
 * Resolves badge labels, styles, and display text from subscription state.
 * Works with both the unified summary API response and legacy separate states.
 *
 * PLAN STRUCTURE:
 *   Customer: free | premium
 *   Provider: none | free | premium | platinum
 *
 * A user may be both a Premium Customer AND a Platinum Provider simultaneously.
 * These are tracked as two separate badge objects.
 */

import { isCustomerPremiumActive } from "./customerPremium.js";

// ─────────────────────────────────────────────────────────────────────────────
// Badge config constants
// ─────────────────────────────────────────────────────────────────────────────

export const MEMBERSHIP_BADGE_CONFIGS = {
  customer_premium: {
    key: "customer_premium",
    label: "Premium Customer",
    shortLabel: "Premium",
    scope: "customer",
    tier: "premium",
    // Tailwind-compatible class hint (used as CSS class suffix)
    variant: "premium-customer",
    ariaLabel: "Active Premium Customer membership",
  },
  customer_free: {
    key: "customer_free",
    label: "Customer Account",
    shortLabel: "Customer",
    scope: "customer",
    tier: "free",
    variant: "customer-free",
    ariaLabel: "Free customer account",
  },
  provider_platinum: {
    key: "provider_platinum",
    label: "Platinum Provider",
    shortLabel: "Platinum",
    scope: "provider",
    tier: "platinum",
    variant: "provider-platinum",
    ariaLabel: "Active Platinum Provider membership",
  },
  provider_premium: {
    key: "provider_premium",
    label: "Premium Provider",
    shortLabel: "Premium",
    scope: "provider",
    tier: "premium",
    variant: "provider-premium",
    ariaLabel: "Active Premium Provider membership",
  },
  provider_free: {
    key: "provider_free",
    label: "Provider Account",
    shortLabel: "Provider",
    scope: "provider",
    tier: "free",
    variant: "provider-free",
    ariaLabel: "Free provider account",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Core resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve membership badges from the unified summary API response
 * (GET /api/subscriptions/summary).
 *
 * Returns an array of badge configs, never null.
 * A free-only customer with no provider profile returns one badge: customer_free.
 * A premium customer who is also a platinum provider returns two badges.
 */
export function getBadgesFromSummary(summary) {
  if (!summary) return [MEMBERSHIP_BADGE_CONFIGS.customer_free];

  const badges = summary.badges;
  if (Array.isArray(badges) && badges.length > 0) {
    return badges.map((b) => MEMBERSHIP_BADGE_CONFIGS[b.key] || {
      key: b.key,
      label: b.label,
      shortLabel: b.label,
      scope: b.scope,
      tier: b.tier,
      variant: b.key,
      ariaLabel: b.label,
    });
  }

  // Fallback: derive from customer/provider sub objects
  return getBadgesFromSubscriptionStates(
    summary.customer,
    summary.provider,
    summary.hasProviderProfile
  );
}

/**
 * Derive badges from legacy separate subscription state objects.
 * customerSub = mapCustomerSubscription() output from /api/customer-subscriptions
 * providerSub = mapSubscription() output from /api/subscriptions/me
 * hasProviderProfile = whether the user has a barber profile at all
 */
export function getBadgesFromSubscriptionStates(
  customerSub,
  providerSub,
  hasProviderProfile = false
) {
  const result = [];

  // Customer badge
  const customerPremium = isCustomerPremiumActive(customerSub);
  result.push(
    customerPremium
      ? MEMBERSHIP_BADGE_CONFIGS.customer_premium
      : MEMBERSHIP_BADGE_CONFIGS.customer_free
  );

  // Provider badge — only if the user has a provider profile
  if (hasProviderProfile || providerSub) {
    const providerTier = String(providerSub?.tier || "").toUpperCase();
    const providerStatus = String(providerSub?.status || "").toLowerCase();
    const providerActive = providerStatus === "active" || providerStatus === "trialing";

    if (providerActive && providerTier === "PLATINUM") {
      result.push(MEMBERSHIP_BADGE_CONFIGS.provider_platinum);
    } else if (providerActive && providerTier === "PREMIUM") {
      result.push(MEMBERSHIP_BADGE_CONFIGS.provider_premium);
    } else if (providerActive || providerTier === "FREE") {
      result.push(MEMBERSHIP_BADGE_CONFIGS.provider_free);
    } else if (hasProviderProfile) {
      result.push(MEMBERSHIP_BADGE_CONFIGS.provider_free);
    }
  }

  return result;
}

/**
 * Returns the primary single-line label for the profile sub-heading.
 * When the user has both memberships, returns the most prominent one.
 * The full badge row uses getBadgesFromSummary / getBadgesFromSubscriptionStates.
 */
export function getPrimaryMembershipLabel(badges = []) {
  if (!badges || badges.length === 0) return "Customer Account";
  // Premium/Platinum beats free in both dimensions
  const premium = badges.find(
    (b) => b.tier === "premium" || b.tier === "platinum"
  );
  return premium ? premium.label : badges[0].label;
}

/**
 * Returns all active (non-free) membership names as a short string,
 * e.g. "Premium Customer · Platinum Provider"
 */
export function getMembershipSummaryText(badges = []) {
  const active = (badges || []).filter(
    (b) => b.tier !== "free" && b.tier !== "none"
  );
  if (active.length === 0) return "Customer Account";
  return active.map((b) => b.label).join(" · ");
}

/**
 * True if the user holds any active paid membership (customer or provider).
 */
export function hasAnyPaidMembership(badges = []) {
  return (badges || []).some((b) => b.tier === "premium" || b.tier === "platinum");
}

/**
 * Resolve status text for the profile status strip.
 * "Premium Customer" | "Platinum Provider" | "Customer Account"
 */
export function getAccountStatusStripText(
  customerSub,
  providerSub,
  hasProviderProfile,
  isProviderAccount
) {
  const badges = getBadgesFromSubscriptionStates(
    customerSub,
    providerSub,
    hasProviderProfile
  );
  const active = badges.filter((b) => b.tier !== "free");
  if (active.length > 0) return active.map((b) => b.label).join(" · ");
  if (isProviderAccount) return "Provider Account";
  return "Customer Free";
}
