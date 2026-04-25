import { apiFetch } from "../config/api.js";

export function getFavorites(username) {
  return apiFetch(`/api/favorites/${encodeURIComponent(username)}`);
}

export function addFavorite({ username, barberId }) {
  return apiFetch("/api/favorites", {
    method: "POST",
    body: JSON.stringify({ username, barber_id: barberId }),
  });
}

export function removeFavorite({ username, barberId }) {
  return apiFetch(`/api/favorites/${encodeURIComponent(username)}/${barberId}`, {
    method: "DELETE",
  });
}
