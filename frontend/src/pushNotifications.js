import { getToken, onMessage, deleteToken } from "firebase/messaging";
import { apiFetch } from "./config/api.js";
import {
  firebaseClientConfigured,
  firebaseVapidKey,
  getFirebaseClientConfigForWorker,
  getFirebaseMessagingIfSupported,
  getMissingFirebaseClientEnv,
} from "./firebase.js";

function browserLabel() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/")) return "Safari";
  return navigator.userAgentData?.brands?.[0]?.brand || "Browser";
}

function workerUrl() {
  const config = getFirebaseClientConfigForWorker();
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(config).filter(([, value]) => Boolean(value)))
  );
  return `${import.meta.env.BASE_URL || "/"}firebase-messaging-sw.js?${params.toString()}`;
}

export function getNotificationSupportState() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if (getMissingFirebaseClientEnv().length || !firebaseClientConfigured() || !firebaseVapidKey) {
    return "missing_config";
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "default";
}

export async function registerFirebaseServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(workerUrl(), {
    scope: import.meta.env.BASE_URL || "/",
  });
}

export async function enableFirebaseNotifications() {
  const support = getNotificationSupportState();
  if (support === "unsupported" || support === "missing_config") {
    return { success: false, reason: support };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    return { success: false, reason: "denied" };
  }

  const messaging = await getFirebaseMessagingIfSupported();
  if (!messaging) return { success: false, reason: "unsupported" };

  let registration;
  try {
    registration = await registerFirebaseServiceWorker();
  } catch {
    return { success: false, reason: "service_worker" };
  }

  const token = await getToken(messaging, {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration: registration || undefined,
  });

  if (!token) return { success: false, reason: "no_token" };

  const result = await apiFetch("/api/notifications/register-token", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: "web",
      browser: browserLabel(),
      deviceLabel: `${browserLabel()} on ${navigator.platform || "this device"}`,
    }),
  });

  localStorage.setItem("queless_fcm_token", token);
  return { success: true, token, result };
}

export async function disableFirebaseNotifications() {
  const token = localStorage.getItem("queless_fcm_token") || "";
  if (token) {
    await apiFetch("/api/notifications/unregister-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }

  const messaging = await getFirebaseMessagingIfSupported();
  if (messaging) {
    await deleteToken(messaging).catch(() => {});
  }
  localStorage.removeItem("queless_fcm_token");
  return { success: true };
}

export async function sendFirebaseTestNotification() {
  return apiFetch("/api/notifications/test", { method: "POST" });
}

export async function listenForForegroundNotifications(callback) {
  if (getNotificationSupportState() === "missing_config") return () => {};
  const messaging = await getFirebaseMessagingIfSupported();
  if (!messaging || typeof callback !== "function") return () => {};

  return onMessage(messaging, (payload) => {
    callback({
      id: payload.messageId || `fcm-${Date.now()}`,
      title: payload.notification?.title || payload.data?.title || "Queless notification",
      message: payload.notification?.body || payload.data?.body || "",
      description: payload.notification?.body || payload.data?.body || "",
      type: payload.data?.type || "system",
      createdAt: new Date().toISOString(),
      bookingId: payload.data?.bookingId || "",
      paymentId: payload.data?.paymentId || "",
      barberId: payload.data?.barberId || "",
      customerUsername: payload.data?.customerUsername || "",
    });
  });
}
