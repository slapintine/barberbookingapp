import { apiFetch } from "../config/api.js";

export function findSmartMatches(payload) {
  return apiFetch("/api/smart-match/search", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function parseSmartMatchPrompt(payload) {
  return apiFetch("/api/smart-match/parse", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
