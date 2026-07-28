import { apiFetch } from "../config/api.js";

export function getProviderPlatinumDashboard() {
  return apiFetch("/api/provider-platinum/dashboard");
}

export function createProviderPlatinumStaff(payload) {
  return apiFetch("/api/provider-platinum/staff", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createProviderPlatinumBranch(payload) {
  return apiFetch("/api/provider-platinum/branches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function assignProviderPlatinumBooking(payload) {
  return apiFetch("/api/provider-platinum/booking-assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function draftProviderPlatinumAssistant(payload) {
  return apiFetch("/api/provider-platinum/assistant", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
