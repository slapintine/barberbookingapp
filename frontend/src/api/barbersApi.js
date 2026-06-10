import { apiFetch } from "../config/api.js";

export function getBarbers() {
  return apiFetch("/api/barbers");
}

export function getMyBarberStand() {
  return apiFetch("/api/barbers/me");
}

export function registerBarberStand(payload) {
  return apiFetch("/api/barbers/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMyBarberStand(payload) {
  return apiFetch("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMyBarberStand() {
  return apiFetch("/api/barbers/me", {
    method: "DELETE",
  });
}

export function publishMyBarberStand() {
  return apiFetch("/api/barbers/me/publish", {
    method: "POST",
  });
}
