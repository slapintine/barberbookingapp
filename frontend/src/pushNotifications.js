import { getToken, onMessage, deleteToken } from "firebase/messaging";
import { apiFetch, getAuthToken } from "./config/api.js";
import {
  firebaseClientConfigured,
  firebaseVapidKey,
  getFirebaseClientConfigIssues,
  getFirebaseClientConfigForWorker,
  getFirebaseMessagingIfSupported,
} from "./firebase.js";
import { getBrowserNotificationState } from "./utils/notificationState.js";

const TOKEN_STORAGE_KEY = "queless_fcm_token";
const PUSH_CHANNEL_ID = "queless-booking-updates";

let nativePushPluginPromise = null;
let nativeListenersAttached = false;
const nativeForegroundCallbacks = new Set();

function debugPush(message, details = {}) {
  if (import.meta.env.DEV) console.warn(`[Queless notifications] ${message}`, details);
}

function browserLabel() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/")) return "Safari";
  return navigator.userAgentData?.brands?.[0]?.brand || "Browser";
}

function isNativeAppRuntime() {
  if (typeof window === "undefined") return false;
  const capacitor = window.Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === "function") return Boolean(capacitor.isNativePlatform());
  if (typeof capacitor.getPlatform === "function") return ["android", "ios"].includes(capacitor.getPlatform());
  return false;
}

function hasNativePushPlugin() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.Plugins?.PushNotifications);
}

async function getNativePushPlugin() {
  if (!isNativeAppRuntime()) return { plugin: null };
  if (!nativePushPluginPromise) {
    nativePushPluginPromise = import("@capacitor/push-notifications")
      .then((module) => ({ plugin: module.PushNotifications || null }))
      .catch(() => ({ plugin: null }));
  }
  return nativePushPluginPromise;
}

export function getStoredPushToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function storeToken(token) {
  if (typeof localStorage === "undefined" || !token) return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearStoredToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function nativePlatformLabel() {
  if (typeof window === "undefined") return "android";
  const platform = window.Capacitor?.getPlatform?.();
  return platform || "android";
}

function nativeDeviceLabel() {
  return nativePlatformLabel() === "ios" ? "Queless iOS app" : "Queless Android app";
}

function mapNativeNotification(notification = {}) {
  const data = notification.data || {};
  return {
    id: data.notificationId || data.id || notification.id || `fcm-${Date.now()}`,
    title: notification.title || data.title || "Queless notification",
    message: notification.body || data.body || data.message || "",
    description: notification.body || data.body || data.message || "",
    type: data.type || "system",
    route: data.route || "",
    createdAt: new Date().toISOString(),
    bookingId: data.bookingId || data.booking_id || "",
    paymentId: data.paymentId || data.payment_id || "",
    barberId: data.barberId || data.barber_id || "",
    customerUsername: data.customerUsername || data.customer_username || "",
    barberOwnerUsername: data.barberOwnerUsername || data.barber_owner_username || "",
  };
}

async function registerTokenWithBackend(token, metadata = {}) {
  const result = await apiFetch("/api/notifications/register-token", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: metadata.platform || "web",
      browser: metadata.browser || "",
      deviceLabel: metadata.deviceLabel || "",
    }),
  });
  storeToken(token);
  return result;
}

async function ensureNativeNotificationChannel(PushNotifications) {
  if (!PushNotifications?.createChannel || nativePlatformLabel() !== "android") return;
  await PushNotifications.createChannel({
    id: PUSH_CHANNEL_ID,
    name: "Queless updates",
    description: "Booking, message, and account updates from Queless.",
    importance: 4,
    visibility: 0,
  }).catch((error) => debugPush("Android notification channel could not be created.", { code: error?.code || "" }));
}

async function waitForNativeRegistration(PushNotifications) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let registrationHandle = null;
    let errorHandle = null;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      registrationHandle?.remove?.();
      errorHandle?.remove?.();
      reject(new Error("Native push registration timed out."));
    }, 15000);

    Promise.all([
      PushNotifications.addListener("registration", (token) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        errorHandle?.remove?.();
        registrationHandle?.remove?.();
        resolve(token?.value || "");
      }),
      PushNotifications.addListener("registrationError", (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        registrationHandle?.remove?.();
        errorHandle?.remove?.();
        reject(error);
      }),
    ])
      .then(([registration, registrationError]) => {
        registrationHandle = registration;
        errorHandle = registrationError;
        return PushNotifications.register();
      })
      .catch((error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          registrationHandle?.remove?.();
          errorHandle?.remove?.();
          reject(error);
        }
      });
  });
}

async function attachNativeNotificationListeners(PushNotifications) {
  if (nativeListenersAttached || !PushNotifications?.addListener) return;
  nativeListenersAttached = true;

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const mapped = mapNativeNotification(notification);
    nativeForegroundCallbacks.forEach((callback) => callback(mapped));
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const mapped = mapNativeNotification(action?.notification || {});
    window.dispatchEvent(new CustomEvent("queless:push-open", { detail: mapped }));
  });
}

function workerUrl() {
  const config = getFirebaseClientConfigForWorker();
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(config).filter(([, value]) => Boolean(value)))
  );
  return `${getFirebaseServiceWorkerPath()}firebase-messaging-sw.js?${params.toString()}`;
}

export function getFirebaseServiceWorkerPath() {
  const baseUrl = String(import.meta.env.BASE_URL || "/");
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function getNotificationSupportState() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if (isNativeAppRuntime()) {
    if (!hasNativePushPlugin()) return "setup_missing";
    return getStoredPushToken() ? "granted" : "default";
  }
  const browserState = getBrowserNotificationState({
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    permission: "Notification" in window ? Notification.permission : "default",
  });
  if (browserState !== "granted") return browserState;
  if (getFirebaseClientConfigIssues().length || !firebaseClientConfigured() || !firebaseVapidKey) {
    return "setup_missing";
  }
  return "granted";
}

export async function getNativeNotificationPermissionState() {
  if (!isNativeAppRuntime()) return null;
  const { plugin: PushNotifications } = await getNativePushPlugin();
  if (!PushNotifications?.checkPermissions) return "unavailable";
  const permission = await PushNotifications.checkPermissions();
  return permission?.receive || "prompt";
}

export async function registerFirebaseServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(workerUrl(), {
    scope: getFirebaseServiceWorkerPath(),
    updateViaCache: "none",
  });
}

export async function enableFirebaseNotifications() {
  const support = getNotificationSupportState();
  if (support === "unsupported" || support === "delivery_unavailable" || support === "setup_missing") {
    return { success: false, reason: support };
  }

  if (!getAuthToken()) {
    return { success: false, reason: "unauthenticated" };
  }

  if (isNativeAppRuntime()) {
    const { plugin: PushNotifications } = await getNativePushPlugin();
    if (!PushNotifications) return { success: false, reason: "setup_missing" };

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") {
      return { success: false, reason: "denied" };
    }

    await ensureNativeNotificationChannel(PushNotifications);
    await attachNativeNotificationListeners(PushNotifications);

    let token;
    try {
      token = await waitForNativeRegistration(PushNotifications);
    } catch (error) {
      debugPush("Native push registration failed.", { code: error?.code || "" });
      return { success: false, reason: "token_registration" };
    }
    if (!token) return { success: false, reason: "token_registration" };

    let result;
    try {
      result = await registerTokenWithBackend(token, {
        platform: nativePlatformLabel(),
        browser: "Capacitor",
        deviceLabel: nativeDeviceLabel(),
      });
    } catch (error) {
      debugPush("The native token could not be saved by the API.", {
        status: Number(error?.status || 0),
        serverUnavailable: Boolean(error?.serverUnavailable),
      });
      return { success: false, reason: "token_registration" };
    }

    return { success: true, token, result };
  }

  if (getFirebaseClientConfigIssues().length || !firebaseClientConfigured() || !firebaseVapidKey) {
    debugPush("Push delivery configuration is incomplete; in-app notifications remain available.", {
      issues: getFirebaseClientConfigIssues(),
      hasVapidKey: Boolean(firebaseVapidKey),
    });
    return { success: false, reason: "delivery_unavailable" };
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
  } catch (error) {
    debugPush("Service worker registration failed.", { name: error?.name || "Error" });
    return { success: false, reason: "service_worker" };
  }

  let token;
  try {
    token = await getToken(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: registration || undefined,
    });
  } catch (error) {
    debugPush("Firebase could not create a browser notification token.", {
      name: error?.name || "Error",
      code: error?.code || "",
    });
    return { success: false, reason: "token_registration" };
  }

  if (!token) return { success: false, reason: "token_registration" };

  let result;
  try {
    result = await registerTokenWithBackend(token, {
      platform: "web",
      browser: browserLabel(),
      deviceLabel: `${browserLabel()} on ${navigator.platform || "this device"}`,
    });
  } catch (error) {
    debugPush("The browser token could not be saved by the API.", {
      status: Number(error?.status || 0),
      serverUnavailable: Boolean(error?.serverUnavailable),
    });
    return { success: false, reason: "token_registration" };
  }

  return { success: true, token, result };
}

export async function disableFirebaseNotifications() {
  const token = getStoredPushToken();
  if (token) {
    await apiFetch("/api/notifications/unregister-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  const messaging = await getFirebaseMessagingIfSupported();
  if (messaging) {
    await deleteToken(messaging).catch(() => {});
  }
  clearStoredToken();
  return { success: true };
}

export async function openPhoneNotificationSettings() {
  if (!isNativeAppRuntime()) return { success: false, reason: "native_unavailable" };
  const plugin = window.Capacitor?.Plugins?.QuelessNotificationSettings;
  if (!plugin?.open) return { success: false, reason: "settings_unavailable" };
  await plugin.open();
  return { success: true };
}

export async function sendFirebaseTestNotification() {
  return apiFetch("/api/notifications/test", { method: "POST" });
}

export async function listenForForegroundNotifications(callback) {
  if (isNativeAppRuntime()) {
    const { plugin: PushNotifications } = await getNativePushPlugin();
    if (!PushNotifications || typeof callback !== "function") return () => {};
    await ensureNativeNotificationChannel(PushNotifications);
    await attachNativeNotificationListeners(PushNotifications);
    nativeForegroundCallbacks.add(callback);
    return () => nativeForegroundCallbacks.delete(callback);
  }

  if (["delivery_unavailable", "setup_missing"].includes(getNotificationSupportState())) return () => {};
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
