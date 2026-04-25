import { apiFetch } from "../config/api.js";

export function getMessages({ barberId, customerUsername }) {
  return apiFetch(
    `/api/messages?barberId=${barberId}&customerUsername=${encodeURIComponent(customerUsername)}`
  );
}

export function createMessage(payload) {
  return apiFetch("/api/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
