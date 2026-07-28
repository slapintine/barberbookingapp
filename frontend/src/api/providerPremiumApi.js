import { apiFetch } from "../config/api.js";

export function getProviderPremiumDashboard(range = "last_30_days") {
  const query = range ? `?range=${encodeURIComponent(range)}` : "";
  return apiFetch(`/api/provider-premium/dashboard${query}`);
}

export function createProviderPromotionDraft(payload) {
  return apiFetch("/api/provider-premium/promotions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function draftProviderResponse(payload) {
  return apiFetch("/api/provider-premium/response-draft", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
