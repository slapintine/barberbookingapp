import { apiFetch } from "../config/api.js";
import { createComingSoonError, PAYMENTS_COMING_SOON_MESSAGE, PAYMENTS_ENABLED } from "../utils/launchFlags.js";

export function getMyCustomerSubscription() {
  return apiFetch("/api/customer-subscriptions/me");
}

export function startCustomerSubscriptionUpgrade(payload, idempotencyKey = "") {
  // Promo-bearing requests must reach the backend even while live payments are off:
  // the backend activates a full/free promo without payment, and rejects a partial
  // promo (no provider/phone) without ever initiating a live collection.
  const hasPromo = Boolean(String(payload?.promoCode || payload?.promo_code || "").trim());
  if (!PAYMENTS_ENABLED && !hasPromo) {
    return Promise.reject(createComingSoonError(PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/customer-subscriptions/upgrade", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ ...payload, idempotencyKey }),
  });
}

export function verifyCustomerSubscriptionUpgrade(reference) {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/customer-subscriptions/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}
