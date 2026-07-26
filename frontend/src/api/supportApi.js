import { apiFetch } from "../config/api.js";

export function createSupportRequest(payload) {
  return apiFetch("/api/support-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMySupportRequests() {
  return apiFetch("/api/support-requests/me");
}
