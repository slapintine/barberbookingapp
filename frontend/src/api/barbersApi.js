import { apiFetch } from "../config/api.js";

const PROVIDER_CACHE_TTL_MS = 30_000;
let barbersCache = null;
let barbersRequest = null;

function providerCacheKey(options = {}) {
  const limit = Number(options.limit || 50);
  const page = Number(options.page || 1);
  const token = typeof localStorage === "undefined" && typeof sessionStorage === "undefined"
    ? ""
    : (localStorage.getItem("lineup_token") || sessionStorage.getItem("lineup_token") || "");
  return `${token ? `auth:${token.slice(-12)}` : "guest"}:${page}:${limit}`;
}

export function clearBarbersCache() {
  barbersCache = null;
  barbersRequest = null;
}

export function getBarbers(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const page = Math.max(Number(options.page || 1), 1);
  const key = providerCacheKey({ limit, page });
  const now = Date.now();
  if (barbersCache?.key === key && now - barbersCache.createdAt < PROVIDER_CACHE_TTL_MS) {
    return Promise.resolve(barbersCache.data);
  }
  if (barbersRequest?.key === key) return barbersRequest.promise;

  const params = new URLSearchParams({ limit: String(limit), page: String(page) });
  const promise = apiFetch(`/api/barbers?${params.toString()}`)
    .then((data) => {
      barbersCache = { key, data, createdAt: Date.now() };
      return data;
    })
    .finally(() => {
      if (barbersRequest?.key === key) barbersRequest = null;
    });
  barbersRequest = { key, promise };
  return promise;
}

export function getMyBarberStand() {
  return apiFetch("/api/barbers/me");
}

export function registerBarberStand(payload) {
  clearBarbersCache();
  return apiFetch("/api/barbers/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMyBarberStand(payload) {
  clearBarbersCache();
  return apiFetch("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMyBarberStand() {
  clearBarbersCache();
  return apiFetch("/api/barbers/me", {
    method: "DELETE",
  });
}

export function publishMyBarberStand() {
  clearBarbersCache();
  return apiFetch("/api/barbers/me/publish", {
    method: "POST",
  });
}
