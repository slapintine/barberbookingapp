import { apiFetch } from "../config/api.js";

export function getAiCoachInsights(businessId) {
  return apiFetch(`/api/ai-coach/insights/${encodeURIComponent(businessId)}`);
}
