import { apiFetch } from "../config/api.js";

export function getMySubscription() {
  return apiFetch("/api/subscriptions/me");
}

export function startSubscriptionUpgrade(payload, idempotencyKey = "") {
  return apiFetch("/api/subscriptions/upgrade", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ ...payload, idempotencyKey }),
  });
}

export function verifySubscriptionUpgrade(reference) {
  return apiFetch("/api/subscriptions/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}
