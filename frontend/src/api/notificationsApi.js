import { apiFetch } from "../config/api.js";

export function getNotifications() {
  return apiFetch("/api/notifications/me");
}

export function markNotificationReadRequest(notificationId) {
  return apiFetch(`/api/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}
