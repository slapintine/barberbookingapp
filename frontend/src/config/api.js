import { sanitizeErrorMessage } from "../utils/errorMessages.js";

function normalizeBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  return normalized;
}

export function deriveApiUrl() {
  const isDev =
    typeof import.meta !== "undefined" ? Boolean(import.meta.env?.DEV) : false;
  const envUrl =
    typeof import.meta !== "undefined"
      ? import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || ""
      : "";
  if (isDev && /^https?:\/\/queless\.org\/api\/?$/i.test(String(envUrl || "").trim())) {
    return "/api";
  }
  return normalizeBaseUrl(envUrl || "/api");
}

function stripApiSuffix(value) {
  return String(value || "").replace(/\/api$/, "");
}

export function buildApiUrl(path = "") {
  const normalizedPath = String(path || "");
  if (!API_URL) return normalizedPath;
  if (API_URL.endsWith("/api") && normalizedPath === "/api") return API_URL;
  if (API_URL.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${API_URL}${normalizedPath.slice(4)}`;
  }
  return `${API_URL}${normalizedPath}`;
}

export const API_URL = deriveApiUrl();
export const API_HEALTH_URL = buildApiUrl("/api/health");

export function deriveSocketUrl() {
  if (API_URL && API_URL.startsWith("http")) return stripApiSuffix(API_URL);
  return undefined;
}

export const SOCKET_URL = deriveSocketUrl();
export const SERVER_UNAVAILABLE_MESSAGE =
  "We're having trouble connecting to the server. Please try again in a moment.";

export function getAuthToken() {
  return (
    localStorage.getItem("lineup_token") ||
    sessionStorage.getItem("lineup_token") ||
    localStorage.getItem("cutz_token") ||
    sessionStorage.getItem("cutz_token") ||
    ""
  );
}

export function clearStoredAuth() {
  if (typeof window === "undefined") return;
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem("lineup_token");
    storage.removeItem("lineup_user");
    storage.removeItem("lineup_token_expires_at");
    storage.removeItem("cutz_token");
    storage.removeItem("cutz_user");
    storage.removeItem("cutz_token_expires_at");
  }
}

function broadcastUnauthorized(message) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("lineup:unauthorized", {
      detail: { message: message || "Session expired. Please log in again." },
    })
  );
}

export async function apiFetch(url, options = {}) {
  const tokenValue = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (tokenValue) {
    headers.Authorization = `Bearer ${tokenValue}`;
  }

  let response;
  const requestUrl = buildApiUrl(url);

  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
    });
  } catch {
    const technicalMessage = `Cannot reach backend at ${API_HEALTH_URL}. Check that the backend is running and that VITE_API_URL or the reverse proxy points to /api.`;
    const error = new Error(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You appear to be offline. Check your connection and try again."
        : SERVER_UNAVAILABLE_MESSAGE
    );
    error.status = 0;
    error.serverUnavailable = true;
    error.userMessage = error.message;
    error.technicalMessage = technicalMessage;
    error.requestUrl = requestUrl;
    error.healthUrl = API_HEALTH_URL;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJsonResponse = contentType.includes("application/json");
  let data = null;

  if (isJsonResponse) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    await response.text().catch(() => "");
  }

  if (!response.ok) {
    const isServerUnavailable = [502, 503, 504].includes(response.status);
    const friendlyServerMessage =
      response.status === 413
        ? "The uploaded data is too large. Please reduce the image size or upgrade your plan."
        : isServerUnavailable
        ? SERVER_UNAVAILABLE_MESSAGE
        : !isJsonResponse
        ? "Queless could not complete that request. Please try again in a moment."
        : "";
    const rawMessage =
      friendlyServerMessage ||
      data?.error ||
      data?.message ||
      "Request failed.";
    // Final guard: never let a raw HTML / proxy error page reach the UI, no matter
    // what the backend or reverse proxy returned.
    const message = sanitizeErrorMessage(rawMessage);
    const isAuthError = response.status === 401;
    // Only force a logout/redirect when a token was actually sent — a 401 on a
    // background request made without a token just means "guest", not "expired".
    // Silent callers (e.g. boot session validation) opt out via suppressAuthBroadcast.
    // Never forward the raw backend phrasing ("No token provided.") to the UI.
    if (isAuthError && tokenValue && !options.suppressAuthBroadcast) {
      clearStoredAuth();
      broadcastUnauthorized("Session expired. Please log in again.");
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    error.serverUnavailable = isServerUnavailable;
    error.isAuthError = isAuthError;
    error.code = data?.code || "";
    // Never surface raw backend auth phrasing (e.g. "Not authorized. No token
    // provided.") in the UI — callers decide whether to prompt a login.
    error.userMessage = isAuthError
      ? "Please log in to continue."
      : sanitizeErrorMessage(data?.message || message);
    error.retryAfter = response.headers.get("Retry-After") || "";
    throw error;
  }

  return data;
}
