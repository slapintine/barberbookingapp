import { apiFetch } from "../config/api.js";

export function getSubscriptionSummary() {
  return apiFetch("/api/subscriptions/summary");
}
