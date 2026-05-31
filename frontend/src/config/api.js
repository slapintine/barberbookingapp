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

export function getAuthToken() {
  return (
    localStorage.getItem("lineup_token") ||
    sessionStorage.getItem("lineup_token") ||
    localStorage.getItem("cutz_token") ||
    sessionStorage.getItem("cutz_token") ||
    ""
  );
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
        : "Queless is having trouble reaching the server. Please try again in a moment."
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
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const isHtmlError = typeof data === "string" && /<html|<body|nginx|request entity too large/i.test(data);
    const friendlyServerMessage =
      response.status === 413
        ? "The uploaded data is too large. Please reduce image size or try again."
        : isHtmlError
        ? "Queless could not complete that request. Please try again in a moment."
        : "";
    const message =
      friendlyServerMessage ||
      (typeof data === "string"
        ? data
        : data?.error || data?.message || "Request failed.");
    if (response.status === 401 && tokenValue) {
      broadcastUnauthorized(message);
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    error.code = typeof data === "string" ? "" : data?.code || "";
    error.userMessage = typeof data === "string" ? message : data?.message || message;
    error.retryAfter = response.headers.get("Retry-After") || "";
    throw error;
  }

  return data;
}
