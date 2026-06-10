import { FiCheckCircle, FiClock, FiAlertCircle } from "react-icons/fi";

/**
 * Shows a clean verification badge on provider cards and profile sheets.
 * - Verified      → green checkmark
 * - Changes Requested / Pending → muted clock
 * - Unverified (default) → subtle neutral pill
 * Banned/suspended businesses never appear in public listings, so no badge needed for those.
 */
export default function VerificationBadge({ barber, size = "sm", className = "" }) {
  const reviewStatus = String(barber?.review_status || "").toLowerCase();
  const isVerified = Boolean(barber?.is_verified) || reviewStatus === "verified";
  const isPending = ["pending_review", "pending"].includes(reviewStatus) && !isVerified;
  const changesRequested = reviewStatus === "changes_requested";

  if (isVerified) {
    return (
      <span className={`verification-badge-v1 verified ${size} ${className}`}>
        <FiCheckCircle /> Verified
      </span>
    );
  }

  if (changesRequested) {
    return (
      <span className={`verification-badge-v1 changes ${size} ${className}`}>
        <FiAlertCircle /> Unverified
      </span>
    );
  }

  // pending_review or anything else = unverified label
  return (
    <span className={`verification-badge-v1 unverified ${size} ${className}`}>
      <FiClock /> Unverified
    </span>
  );
}
