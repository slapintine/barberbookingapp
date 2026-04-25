import { apiFetch } from "../config/api.js";

export function getProfile() {
  return apiFetch("/api/profiles/me").then((data) => data?.profile || null);
}

export function saveProfileRequest(payload) {
  return apiFetch("/api/profiles/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then((data) => data?.profile || null);
}
