import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "./env.js";
import { logger } from "./logger.js";

let firebaseApp = null;
let firebaseMessaging = null;
let initializationAttempted = false;

function parseServiceAccount() {
  if (!env.firebaseServiceAccountJson) return null;

  const serviceAccount = JSON.parse(env.firebaseServiceAccountJson);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");
  }

  const missing = ["project_id", "client_email", "private_key"].filter((key) => !serviceAccount[key]);
  if (missing.length) {
    throw new Error(`Firebase service account JSON missing ${missing.join(", ")}`);
  }

  return serviceAccount;
}

export function getFirebaseAdminApp() {
  if (firebaseApp) return firebaseApp;
  if (getApps().length) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }
  if (initializationAttempted) return null;

  initializationAttempted = true;

  try {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount) {
      logger.info("Firebase Admin disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
      return null;
    }

    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    logger.info({ projectId: serviceAccount.project_id }, "Firebase Admin initialized");
    return firebaseApp;
  } catch (error) {
    logger.error({ err: error }, "Firebase Admin initialization failed");
    return null;
  }
}

export function getFirebaseMessaging() {
  if (firebaseMessaging) return firebaseMessaging;

  const app = getFirebaseAdminApp();
  if (!app) return null;

  firebaseMessaging = getMessaging(app);
  return firebaseMessaging;
}

export function isFirebaseMessagingReady() {
  return Boolean(getFirebaseMessaging());
}
