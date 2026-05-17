import { apiFetch } from "../config/api.js";

export function getAdminOverview() {
  return apiFetch("/api/admin/overview");
}

export function updateAdminBusiness(id, payload) {
  return apiFetch(`/api/admin/businesses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
