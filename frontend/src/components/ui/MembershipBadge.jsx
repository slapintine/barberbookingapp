/**
 * MembershipBadge — renders one or more subscription plan badges.
 *
 * Usage:
 *   <MembershipBadge badges={badges} />                  — array of badge configs
 *   <MembershipBadge summary={subscriptionSummary} />    — unified API response
 *   <MembershipBadge
 *     customerSub={customerSubscriptionState}
 *     providerSub={subscriptionState}
 *     hasProviderProfile={Boolean(myBarberProfile)}
 *   />
 *
 * Supports loading skeleton and "manage" link.
 */

import {
  getBadgesFromSummary,
  getBadgesFromSubscriptionStates,
} from "../../utils/membershipDisplay.js";

function BadgePill({ badge }) {
  return (
    <span
      className={`membership-badge membership-badge--${badge.variant}`}
      aria-label={badge.ariaLabel}
      title={badge.ariaLabel}
    >
      {badge.label}
    </span>
  );
}

export default function MembershipBadge({
  // Option A: pre-resolved badge array
  badges,
  // Option B: unified summary object from /api/subscriptions/summary
  summary,
  // Option C: legacy separate states
  customerSub,
  providerSub,
  hasProviderProfile = false,
  // Loading state — shows skeleton instead of badges
  loading = false,
  // If true, show "Manage subscription" link
  showManageLink = false,
  onManageClick,
  className = "",
}) {
  let resolvedBadges = badges;

  if (!resolvedBadges) {
    if (summary) {
      resolvedBadges = getBadgesFromSummary(summary);
    } else {
      resolvedBadges = getBadgesFromSubscriptionStates(
        customerSub,
        providerSub,
        hasProviderProfile
      );
    }
  }

  if (loading) {
    return (
      <div className={`membership-badge-row membership-badge-row--loading ${className}`}>
        <span className="membership-badge membership-badge--skeleton" aria-label="Loading membership status" />
      </div>
    );
  }

  if (!resolvedBadges || resolvedBadges.length === 0) {
    return null;
  }

  return (
    <div className={`membership-badge-row ${className}`}>
      {resolvedBadges.map((badge) => (
        <BadgePill key={badge.key} badge={badge} />
      ))}
      {showManageLink && (
        <button
          type="button"
          className="membership-manage-link"
          onClick={onManageClick}
          aria-label="Manage subscription"
        >
          Manage
        </button>
      )}
    </div>
  );
}
