import { apiFetch } from "../config/api.js";

export function getNotifications() {
  return apiFetch("/api/notifications/me?limit=50");
}

export function getUnreadNotificationCount() {
  return apiFetch("/api/notifications/unread-count");
}

export function markNotificationReadRequest(notificationId) {
  return apiFetch(`/api/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsReadRequest() {
  return apiFetch("/api/notifications/read-all", {
    method: "PATCH",
  });
}

export function getNotificationTokenStatusRequest(token) {
  return apiFetch("/api/notifications/token-status", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function unregisterNotificationTokenRequest(token) {
  return apiFetch("/api/notifications/unregister-token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
