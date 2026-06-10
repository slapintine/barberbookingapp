import { apiFetch } from "../config/api.js";

// Uses the logged-in user's JWT to find their own business — no businessId param needed
export function getAiCoachInsights() {
  return apiFetch("/api/provider/coach/insights");
}

export function getProviderCoachQuestions() {
  return apiFetch("/api/provider/coach/questions");
}

export function requestProviderCoachAdvice(questionId, businessId) {
  return apiFetch("/api/provider/coach/advice", {
    method: "POST",
    body: JSON.stringify({ questionId, ...(businessId ? { businessId } : {}) }),
  });
}
