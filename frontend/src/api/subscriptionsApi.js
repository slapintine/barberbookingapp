import { apiFetch } from "../config/api.js";
import { createComingSoonError, PAYMENTS_COMING_SOON_MESSAGE, PAYMENTS_ENABLED } from "../utils/launchFlags.js";

export function getMySubscription() {
  return apiFetch("/api/subscriptions/me");
}

export function startSubscriptionUpgrade(payload, idempotencyKey = "") {
  const tier = String(payload?.tier || payload?.planId || "").toUpperCase();
  const provider = String(payload?.provider || payload?.method || "").toLowerCase();
  const isFreeActivation = tier === "FREE" || provider === "free" || provider === "trial";
  // Promo-bearing requests must reach the backend even while live payments are off:
  // the backend activates a full/free promo without payment, and rejects a partial
  // promo (no provider/phone) without ever initiating a live collection.
  const hasPromo = Boolean(String(payload?.promoCode || payload?.promo_code || "").trim());
  if (!PAYMENTS_ENABLED && !isFreeActivation && !hasPromo) {
    return Promise.reject(createComingSoonError(PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/subscriptions/upgrade", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ ...payload, idempotencyKey }),
  });
}

export function createSubscriptionPayment(payload, idempotencyKey = "") {
  return startSubscriptionUpgrade(payload, idempotencyKey);
}

export function verifySubscriptionUpgrade(reference) {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/subscriptions/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}
