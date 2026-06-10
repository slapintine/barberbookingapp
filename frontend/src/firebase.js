import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";
import { getMessaging, isSupported as messagingIsSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
  measurementId: String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "").trim(),
};

export const firebaseVapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();

function decodeBase64Url(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return atob(padded);
  } catch {
    return "";
  }
}

export function isValidFirebaseVapidKey(value = firebaseVapidKey) {
  const text = String(value || "").trim();
  if (!text) return false;
  return decodeBase64Url(text).length === 65;
}

function hasRequiredClientConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );
}

export function getFirebaseApp() {
  if (!hasRequiredClientConfig()) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function getFirebaseAnalyticsIfSupported() {
  const app = getFirebaseApp();
  if (!app || !firebaseConfig.measurementId) return null;
  if (!(await analyticsIsSupported().catch(() => false))) return null;
  return getAnalytics(app);
}

export async function getFirebaseMessagingIfSupported() {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!(await messagingIsSupported().catch(() => false))) return null;
  return getMessaging(app);
}

export function getFirebaseClientConfigForWorker() {
  return {
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
    measurementId: firebaseConfig.measurementId,
  };
}

export function firebaseClientConfigured() {
  return hasRequiredClientConfig();
}

export function getMissingFirebaseClientEnv() {
  const required = {
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
    VITE_FIREBASE_VAPID_KEY: firebaseVapidKey,
  };

  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

export function getFirebaseClientConfigIssues() {
  const missing = getMissingFirebaseClientEnv();
  const issues = [...missing];
  if (!missing.includes("VITE_FIREBASE_VAPID_KEY") && !isValidFirebaseVapidKey()) {
    issues.push("VITE_FIREBASE_VAPID_KEY_INVALID");
  }
  return issues;
}
