export function getBrowserNotificationState({
  hasNotification,
  hasServiceWorker,
  hasPushManager,
  permission,
}) {
  if (!hasNotification || !hasServiceWorker || !hasPushManager) return "unsupported";
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}
