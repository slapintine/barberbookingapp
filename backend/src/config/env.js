import dotenv from "dotenv";

dotenv.config();

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 5000,
  host: (process.env.HOST || "127.0.0.1").trim(),
  logLevel: (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")).trim().toLowerCase(),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || "7d").trim(),
  clientUrls: parseList(process.env.CLIENT_URL),
  appPublicUrl: (process.env.APP_PUBLIC_URL || parseList(process.env.CLIENT_URL)[0] || "").trim().replace(/\/$/, ""),
  dbClient: (process.env.DB_CLIENT || "sqlite").trim().toLowerCase(),
  dbPath: process.env.DB_PATH || "./src/db/barber_app.sqlite",
  databaseUrl: (process.env.DATABASE_URL || "").trim(),
  databaseSsl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true",
  vapidPublicKey: (process.env.VAPID_PUBLIC_KEY || "").trim(),
  vapidPrivateKey: (process.env.VAPID_PRIVATE_KEY || "").trim(),
  vapidSubject: (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim(),
  resendApiKey: (process.env.RESEND_API_KEY || "").trim(),
  africasTalkingUsername: (process.env.AFRICAS_TALKING_USERNAME || "").trim(),
  africasTalkingApiKey: (process.env.AFRICAS_TALKING_API_KEY || "").trim(),
  pesapalConsumerKey: (process.env.PESAPAL_CONSUMER_KEY || "").trim(),
  pesapalConsumerSecret: (process.env.PESAPAL_CONSUMER_SECRET || "").trim(),
  pesapalBaseUrl: (process.env.PESAPAL_BASE_URL || "").trim().replace(/\/$/, ""),
  pesapalEnvironment: (process.env.PESAPAL_ENVIRONMENT || process.env.PESAPAL_ENV || "sandbox").trim().toLowerCase(),
  pesapalIpnId: (process.env.PESAPAL_IPN_ID || "").trim(),
  pesapalCallbackUrl: (process.env.PESAPAL_CALLBACK_URL || (process.env.APP_PUBLIC_URL || parseList(process.env.CLIENT_URL)[0] || "")).trim().replace(/\/$/, ""),
  pesapalCurrency: (process.env.PESAPAL_CURRENCY || "UGX").trim().toUpperCase(),
  mobileMoneyMode: (process.env.MOBILE_MONEY_MODE || "mock").trim().toLowerCase(),
  mobileMoneyDefaultProvider: (process.env.MOBILE_MONEY_DEFAULT_PROVIDER || "mtn").trim().toLowerCase(),
  mobileMoneyCurrency: (process.env.MOBILE_MONEY_CURRENCY || process.env.MTN_CURRENCY || "").trim().toUpperCase(),
  mobileMoneyApiKey: (process.env.MOBILE_MONEY_API_KEY || "").trim(),
  mobileMoneyApiSecret: (process.env.MOBILE_MONEY_API_SECRET || "").trim(),
  mobileMoneyCollectionUrl: (process.env.MOBILE_MONEY_COLLECTION_URL || "").trim(),
  mobileMoneyVerificationUrl: (process.env.MOBILE_MONEY_VERIFICATION_URL || "").trim(),
  mobileMoneyDisbursementUrl: (process.env.MOBILE_MONEY_DISBURSEMENT_URL || "").trim(),
  mobileMoneyBaseUrl: (process.env.MOBILE_MONEY_BASE_URL || "").trim().replace(/\/$/, ""),
  mtnApiKey: (process.env.MTN_API_KEY || process.env.MOBILE_MONEY_API_KEY || "").trim(),
  mtnApiSecret: (process.env.MTN_API_SECRET || "").trim(),
  mtnApiUserId: (process.env.MTN_API_USER_ID || process.env.MTN_API_SECRET || process.env.MOBILE_MONEY_API_SECRET || "").trim(),
  mtnBaseUrl: (
    process.env.MTN_BASE_URL ||
    process.env.MOBILE_MONEY_BASE_URL ||
    "https://sandbox.momodeveloper.mtn.com"
  ).trim().replace(/\/$/, ""),
  mtnTargetEnvironment: (process.env.MTN_TARGET_ENVIRONMENT || process.env.MTN_ENVIRONMENT || "sandbox").trim().toLowerCase(),
  mtnCurrency: (
    process.env.MTN_CURRENCY ||
    process.env.MOBILE_MONEY_CURRENCY ||
    ((process.env.MTN_TARGET_ENVIRONMENT || process.env.MTN_ENVIRONMENT || "sandbox").trim().toLowerCase() === "sandbox" ? "EUR" : "UGX")
  ).trim().toUpperCase(),
  mtnSubscriptionKey: (process.env.MTN_SUBSCRIPTION_KEY || "").trim(),
  mtnCollectionSubscriptionKey: (
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_SUBSCRIPTION_KEY
  ).trim(),
  mtnDisbursementSubscriptionKey: (
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MTN_SUBSCRIPTION_KEY
  ).trim(),
  mtnProvisioningSubscriptionKey: (
    process.env.MTN_PROVISIONING_SUBSCRIPTION_KEY ||
    process.env.MTN_SUBSCRIPTION_KEY
  ).trim(),
  mtnCollectionUrl: (
    process.env.MTN_COLLECTION_URL ||
    process.env.MOBILE_MONEY_COLLECTION_URL ||
    `${(process.env.MTN_BASE_URL || process.env.MOBILE_MONEY_BASE_URL || "https://sandbox.momodeveloper.mtn.com").trim().replace(/\/$/, "")}/collection/v1_0/requesttopay`
  ).trim(),
  mtnVerificationUrl: (
    process.env.MTN_VERIFICATION_URL ||
    process.env.MOBILE_MONEY_VERIFICATION_URL ||
    `${(process.env.MTN_BASE_URL || process.env.MOBILE_MONEY_BASE_URL || "https://sandbox.momodeveloper.mtn.com").trim().replace(/\/$/, "")}/collection/v1_0/requesttopay`
  ).trim(),
  mtnDisbursementUrl: (
    process.env.MTN_DISBURSEMENT_URL ||
    process.env.MOBILE_MONEY_DISBURSEMENT_URL ||
    `${(process.env.MTN_BASE_URL || process.env.MOBILE_MONEY_BASE_URL || "https://sandbox.momodeveloper.mtn.com").trim().replace(/\/$/, "")}/disbursement/v1_0/transfer`
  ).trim(),
  airtelApiKey: (process.env.AIRTEL_API_KEY || process.env.MOBILE_MONEY_API_KEY || "").trim(),
  airtelApiSecret: (process.env.AIRTEL_API_SECRET || process.env.MOBILE_MONEY_API_SECRET || "").trim(),
  airtelCollectionUrl: (process.env.AIRTEL_COLLECTION_URL || process.env.MOBILE_MONEY_COLLECTION_URL || "").trim(),
  airtelVerificationUrl: (process.env.AIRTEL_VERIFICATION_URL || process.env.MOBILE_MONEY_VERIFICATION_URL || "").trim(),
  airtelDisbursementUrl: (process.env.AIRTEL_DISBURSEMENT_URL || process.env.MOBILE_MONEY_DISBURSEMENT_URL || "").trim(),
  airtelEnabled: String(process.env.AIRTEL_ENABLED || "false").trim().toLowerCase() === "true",
  mobileMoneyCallbackUrl: (
    process.env.MOBILE_MONEY_CALLBACK_URL ||
    `${(process.env.APP_PUBLIC_URL || parseList(process.env.CLIENT_URL)[0] || "").trim().replace(/\/$/, "")}/api/payments/webhooks/${(process.env.MOBILE_MONEY_DEFAULT_PROVIDER || "mtn").trim().toLowerCase()}`
  ).trim(),
  mobileMoneyWebhookToken: (process.env.MOBILE_MONEY_WEBHOOK_TOKEN || "").trim(),
};

export function validateEnv() {
  const missing = [];

  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    missing.push("JWT_SECRET with at least 32 characters");
  }

  if (env.nodeEnv === "production" && !env.appPublicUrl) {
    missing.push("APP_PUBLIC_URL for same-domain callbacks and secure production URLs");
  }

  if (!["sqlite", "postgres"].includes(env.dbClient)) {
    missing.push("DB_CLIENT set to sqlite or postgres");
  }

  if (env.dbClient === "postgres" && !env.databaseUrl) {
    missing.push("DATABASE_URL for PostgreSQL");
  }

  if (["sandbox", "provider", "live"].includes(env.mobileMoneyMode)) {
    if (env.mobileMoneyDefaultProvider === "mtn") {
      if (!env.mtnApiUserId) missing.push("MTN_API_USER_ID (or MTN_API_SECRET fallback) for MTN sandbox/live");
      if (!env.mtnApiKey) missing.push("MTN_API_KEY for MTN sandbox/live");
      if (!env.mtnCollectionSubscriptionKey) missing.push("MTN_COLLECTION_SUBSCRIPTION_KEY or MTN_SUBSCRIPTION_KEY");
      if (!env.mtnDisbursementSubscriptionKey) missing.push("MTN_DISBURSEMENT_SUBSCRIPTION_KEY or MTN_SUBSCRIPTION_KEY");
    }
  }

  if (missing.length) {
    throw new Error(`Missing required environment configuration: ${missing.join(", ")}`);
  }
}
