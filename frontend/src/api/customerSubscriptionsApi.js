import { apiFetch } from "../config/api.js";

export function getMyCustomerSubscription() {
  return apiFetch("/api/customer-subscriptions/me");
}

export function startCustomerSubscriptionUpgrade(payload, idempotencyKey = "") {
  return apiFetch("/api/customer-subscriptions/upgrade", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ ...payload, idempotencyKey }),
  });
}

export function verifyCustomerSubscriptionUpgrade(reference) {
  return apiFetch("/api/customer-subscriptions/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}
