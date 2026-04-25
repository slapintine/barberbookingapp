import { API_URL } from "./config/api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function subscribeUserToPush(username) {
  if (!username || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { success: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { success: false, reason: "denied" };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");

  const keyResponse = await fetch(`${API_URL}/api/push/public-key`);
  const keyData = await keyResponse.json();

  if (!keyData?.publicKey) {
    return { success: false, reason: "missing_public_key" };
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
  }

  const saveResponse = await fetch(`${API_URL}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      subscription,
    }),
  });

  if (!saveResponse.ok) {
    throw new Error("Could not save push subscription.");
  }

  return { success: true };
}

export async function unsubscribeUserFromPush(username) {
  if (!username || !("serviceWorker" in navigator)) {
    return { success: false };
  }

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager?.getSubscription?.();

  if (subscription) {
    await subscription.unsubscribe();
  }

  await fetch(`${API_URL}/api/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

  return { success: true };
}
