import { apiFetch } from "../config/api.js";

export function findSmartMatches(payload) {
  return apiFetch("/api/smart-match", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
