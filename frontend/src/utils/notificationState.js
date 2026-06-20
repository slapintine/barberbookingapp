export function getBrowserNotificationState({
  hasNotification,
  hasServiceWorker,
  permission,
}) {
  if (!hasNotification || !hasServiceWorker) return "unsupported";
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}
