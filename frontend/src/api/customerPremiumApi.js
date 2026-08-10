import { apiFetch } from "../config/api.js";

export function getCustomerPremiumEntitlements() {
  return apiFetch("/api/customer-premium/entitlements");
}

export function getRebookingOptions() {
  return apiFetch("/api/customer-premium/rebooking-options");
}

export function getEarlierSlotAlerts() {
  return apiFetch("/api/customer-premium/slot-alerts");
}

export function createEarlierSlotAlert(payload) {
  return apiFetch("/api/customer-premium/slot-alerts", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function cancelEarlierSlotAlert(alertId) {
  return apiFetch(`/api/customer-premium/slot-alerts/${alertId}`, {
    method: "DELETE",
  });
}
