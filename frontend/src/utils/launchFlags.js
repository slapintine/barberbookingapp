const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

function flagEnabled(name) {
  return String(env[name] || "").trim().toLowerCase() === "true";
}

export const PAYMENTS_ENABLED = flagEnabled("VITE_ENABLE_PAYMENTS");
export const SMS_ENABLED = flagEnabled("VITE_ENABLE_SMS");

export const PAYMENTS_COMING_SOON = !PAYMENTS_ENABLED;
export const SMS_COMING_SOON = !SMS_ENABLED;

export const PAYMENTS_COMING_SOON_TITLE = "Payments Coming Soon";
export const SMS_COMING_SOON_TITLE = "SMS Coming Soon";

export const PAYMENTS_COMING_SOON_MESSAGE =
  "We're preparing secure payments for Queless. This feature will be available soon.";

// Shown when a valid promo only partially covers a plan while live payments are off.
// The discount is acknowledged, but the remaining balance can't be paid online yet.
export const PARTIAL_PROMO_COMING_SOON_MESSAGE =
  "Your promo was applied as a partial discount, but it doesn't fully cover this plan. Completing the remaining payment online is Coming Soon — we're preparing secure payments now.";

export const MOBILE_MONEY_COMING_SOON_MESSAGE =
  "Online payments are coming soon. For now, payment can be handled directly with the provider.";

export const WALLET_PAYMENTS_COMING_SOON_MESSAGE =
  "Wallet top-ups and payouts are coming soon. You can still browse, book, and manage your profile.";

export const SMS_COMING_SOON_MESSAGE =
  "SMS notifications are coming soon. This feature is not active yet.";

export function createComingSoonError(message, code = "FEATURE_COMING_SOON") {
  const error = new Error(message);
  error.code = code;
  error.status = 503;
  error.comingSoon = true;
  return error;
}
