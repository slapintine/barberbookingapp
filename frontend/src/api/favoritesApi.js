import { apiFetch } from "../config/api.js";

export function getFavorites() {
  return apiFetch("/api/favorites");
}

export function addFavorite({ barberId }) {
  return apiFetch("/api/favorites", {
    method: "POST",
    body: JSON.stringify({ barber_id: barberId }),
  });
}

export function removeFavorite({ barberId }) {
  return apiFetch(`/api/favorites/${barberId}`, {
    method: "DELETE",
  });
}
