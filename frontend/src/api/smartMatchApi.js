import { apiFetch } from "../config/api.js";

export function findSmartMatches(payload) {
  return apiFetch("/api/discovery/smart-match/search", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
