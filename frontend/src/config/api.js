function normalizeBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  return normalized.replace(/\/api$/, "");
}

export function deriveApiUrl() {
  const envUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_URL : "";
  if (envUrl) return normalizeBaseUrl(envUrl);

  return "";
}

export const API_URL = deriveApiUrl();

export function deriveSocketUrl() {
  if (API_URL) return API_URL;
  return undefined;
}

export const SOCKET_URL = deriveSocketUrl();

export function getAuthToken() {
  return localStorage.getItem("lineup_token") || localStorage.getItem("cutz_token") || "";
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

  try {
    response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
    });
  } catch {
    const target = API_URL || "same-origin /api";
    throw new Error(`Cannot reach the backend at ${target}. Start the backend and check VITE_API_URL or the reverse proxy.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "string"
        ? data
        : data?.error || data?.message || "Request failed.";
    if (response.status === 401 && tokenValue) {
      broadcastUnauthorized(message);
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}
