import { apiFetch } from "../config/api.js";

export function getMyQuoteRequests() {
  return apiFetch("/api/marketplace/quote-requests/me");
}

export function createQuoteRequest(payload) {
  const idempotencyKey = String(payload.idempotencyKey || "").trim();
  return apiFetch("/api/marketplace/quote-requests", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({
      providerId: payload.providerId,
      serviceId: payload.serviceId,
      description: payload.description,
      budget: payload.budget,
      preferredDate: payload.preferredDate,
      location: payload.location,
      idempotencyKey,
    }),
  });
}
