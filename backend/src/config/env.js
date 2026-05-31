import dotenv from "dotenv";

dotenv.config();

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

const configuredPublicUrl = (
  process.env.APP_PUBLIC_URL ||
  process.env.APP_URL ||
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  process.env.BASE_URL ||
  ""
).split(",")[0].trim().replace(/\/$/, "");

const configuredClientUrls = parseList(
  process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.BASE_URL
);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 5000,
  host: (process.env.HOST || "127.0.0.1").trim(),
  logLevel: (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")).trim().toLowerCase(),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || "7d").trim(),
  clientUrls: configuredClientUrls,
  devClientUrls: parseList(process.env.DEV_CLIENT_URL || process.env.VITE_DEV_CLIENT_URL),
  allowLocalDevOrigins: String(process.env.ALLOW_LOCAL_DEV_ORIGINS || "").trim().toLowerCase() === "true",
  appPublicUrl: configuredPublicUrl || configuredClientUrls[0] || "",
  apiBaseUrl: (process.env.API_BASE_URL || (configuredPublicUrl ? `${configuredPublicUrl}/api` : "")).trim().replace(/\/$/, ""),
  dbClient: (process.env.DB_CLIENT || "sqlite").trim().toLowerCase(),
  dbPath: process.env.DB_PATH || "./src/db/barber_app.sqlite",
  databaseUrl: (process.env.DATABASE_URL || "").trim(),
  databaseSsl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true",
  vapidPublicKey: (process.env.VAPID_PUBLIC_KEY || "").trim(),
  vapidPrivateKey: (process.env.VAPID_PRIVATE_KEY || "").trim(),
  vapidSubject: (process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim(),
  firebaseServiceAccountJson: (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim(),
  resendApiKey: (process.env.RESEND_API_KEY || "").trim(),
  emailFrom: (process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "Queless <info@queless.org>").trim(),
  africasTalkingUsername: (process.env.AFRICASTALKING_USERNAME || process.env.AFRICAS_TALKING_USERNAME || "").trim(),
  africasTalkingApiKey: (process.env.AFRICASTALKING_API_KEY || process.env.AFRICAS_TALKING_API_KEY || "").trim(),
  africasTalkingShortcode: (process.env.AFRICASTALKING_SHORTCODE || process.env.AFRICAS_TALKING_SHORTCODE || "").trim(),
  africasTalkingEnv: (process.env.AFRICASTALKING_ENV || process.env.AFRICAS_TALKING_ENV || "sandbox").trim().toLowerCase(),
  africasTalkingLifecycleSmsEnabled: String(process.env.AFRICASTALKING_LIFECYCLE_SMS_ENABLED || process.env.AFRICAS_TALKING_LIFECYCLE_SMS_ENABLED || "false").trim().toLowerCase() === "true",
  africasTalkingSmsAutoReplyEnabled: String(process.env.AFRICASTALKING_SMS_AUTO_REPLY_ENABLED || process.env.AFRICAS_TALKING_SMS_AUTO_REPLY_ENABLED || "false").trim().toLowerCase() === "true",
  africasTalkingDefaultAutoReply: (process.env.AFRICASTALKING_DEFAULT_AUTO_REPLY || process.env.AFRICAS_TALKING_DEFAULT_AUTO_REPLY || "Thank you for contacting Queless. We have received your message.").trim(),
  mobileMoneyMode: (process.env.MOBILE_MONEY_MODE || "mock").trim().toLowerCase(),
  enableMockPayments: String(process.env.ENABLE_MOCK_PAYMENTS || "false").trim().toLowerCase() === "true",
  bookingOnlinePaymentsEnabled: String(process.env.BOOKING_ONLINE_PAYMENTS_ENABLED || "false").trim().toLowerCase() === "true",
  bookingWalletPaymentsEnabled: String(process.env.BOOKING_WALLET_PAYMENTS_ENABLED || "true").trim().toLowerCase() !== "false",
  providerFreeTrialsEnabled: String(process.env.PROVIDER_FREE_TRIALS_ENABLED || "false").trim().toLowerCase() === "true",
  providerPromoFreeCode: (process.env.PROVIDER_PROMO_FREE_CODE || "").trim(),
  providerPromoPercentCode: (process.env.PROVIDER_PROMO_20_CODE || process.env.PROVIDER_PROMO_PERCENT_CODE || "").trim(),
  providerPromoExpiresAt: (process.env.PROVIDER_PROMO_EXPIRES_AT || "").trim(),
  customerPremiumMonthlyPrice: Number(process.env.CUSTOMER_PREMIUM_MONTHLY_PRICE || 10000),
  customerPremiumAnnualPrice: Number(process.env.CUSTOMER_PREMIUM_ANNUAL_PRICE || 120000),
  customerPremiumCurrency: (process.env.CUSTOMER_PREMIUM_CURRENCY || "UGX").trim().toUpperCase(),
  aiCoachMode: (process.env.AI_COACH_MODE || "rules").trim().toLowerCase(),
  mobileMoneyDefaultProvider: (process.env.MOBILE_MONEY_DEFAULT_PROVIDER || "mtn").trim().toLowerCase(),
  mobileMoneyCurrency: (process.env.MOBILE_MONEY_CURRENCY || process.env.MTN_CURRENCY || "").trim().toUpperCase(),
  mobileMoneyApiKey: (process.env.MOBILE_MONEY_API_KEY || "").trim(),
  mobileMoneyApiSecret: (process.env.MOBILE_MONEY_API_SECRET || "").trim(),
  mobileMoneyCollectionUrl: (process.env.MOBILE_MONEY_COLLECTION_URL || "").trim(),
  mobileMoneyVerificationUrl: (process.env.MOBILE_MONEY_VERIFICATION_URL || "").trim(),
  mobileMoneyDisbursementUrl: (process.env.MOBILE_MONEY_DISBURSEMENT_URL || "").trim(),
  mobileMoneyBaseUrl: (process.env.MOBILE_MONEY_BASE_URL || "").trim().replace(/\/$/, ""),
  mtnConsumerKey: (process.env.MTN_CONSUMER_KEY || "").trim(),
  mtnConsumerSecret: (process.env.MTN_CONSUMER_SECRET || "").trim(),
  mtnCountry: (process.env.MTN_COUNTRY || "Uganda").trim(),
  mtnCallbackUrl: (
    process.env.MTN_CALLBACK_URL ||
    process.env.MOBILE_MONEY_CALLBACK_URL ||
    `${(configuredPublicUrl || configuredClientUrls[0] || "").trim().replace(/\/$/, "")}/api/payments/mtn/callback`
  ).trim(),
  mtnApiKey: (process.env.MTN_API_KEY || process.env.MOBILE_MONEY_API_KEY || "").trim(),
  mtnApiSecret: (process.env.MTN_API_SECRET || "").trim(),
  mtnApiUserId: (
    process.env.MTN_API_USER_ID ||
    process.env.MTN_API_USER ||
    ""
  ).trim(),
  mtnBaseUrl: (
    process.env.MTN_BASE_URL ||
    process.env.MOBILE_MONEY_BASE_URL ||
    (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET
      ? "https://api.mtn.com"
      : "https://sandbox.momodeveloper.mtn.com")
  ).trim().replace(/\/$/, ""),
  mtnTargetEnvironment: (
    process.env.MTN_TARGET_ENVIRONMENT ||
    process.env.MTN_ENVIRONMENT ||
    (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET ? "mtnuganda" : "sandbox")
  ).trim().toLowerCase(),
  mtnCurrency: (
    process.env.MTN_CURRENCY ||
    process.env.MOBILE_MONEY_CURRENCY ||
    ((process.env.MTN_TARGET_ENVIRONMENT || process.env.MTN_ENVIRONMENT || (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET ? "mtnuganda" : "sandbox")).trim().toLowerCase() === "sandbox" ? "EUR" : "UGX")
  ).trim().toUpperCase(),
  mtnOAuthTokenUrl: (
    process.env.MTN_OAUTH_TOKEN_URL ||
    `${(process.env.MTN_BASE_URL || (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET ? "https://api.mtn.com" : "https://sandbox.momodeveloper.mtn.com")).trim().replace(/\/$/, "")}/v1/oauth/access_token`
  ).trim(),
  mtnSubscriptionKey: (process.env.MTN_SUBSCRIPTION_KEY || "").trim(),
  mtnCollectionSubscriptionKey: (
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_COLLECTION_PRIMARY_KEY ||
    process.env.MTN_COLLECTION_SECONDARY_KEY ||
    process.env.MTN_SUBSCRIPTION_KEY ||
    ""
  ).trim(),
  mtnDisbursementSubscriptionKey: (
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MTN_SUBSCRIPTION_KEY ||
    ""
  ).trim(),
  mtnProvisioningSubscriptionKey: (
    process.env.MTN_PROVISIONING_SUBSCRIPTION_KEY ||
    process.env.MTN_SUBSCRIPTION_KEY ||
    ""
  ).trim(),
  mtnCollectionUrl: (
    process.env.MTN_COLLECTION_URL ||
    process.env.MOBILE_MONEY_COLLECTION_URL ||
    `${(process.env.MTN_BASE_URL || process.env.MOBILE_MONEY_BASE_URL || (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET ? "https://api.mtn.com" : "https://sandbox.momodeveloper.mtn.com")).trim().replace(/\/$/, "")}/collection/v1_0/requesttopay`
  ).trim(),
  mtnVerificationUrl: (
    process.env.MTN_VERIFICATION_URL ||
    process.env.MOBILE_MONEY_VERIFICATION_URL ||
    `${(process.env.MTN_BASE_URL || process.env.MOBILE_MONEY_BASE_URL || (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET ? "https://api.mtn.com" : "https://sandbox.momodeveloper.mtn.com")).trim().replace(/\/$/, "")}/collection/v1_0/requesttopay`
  ).trim(),
  mtnDisbursementUrl: (
    process.env.MTN_DISBURSEMENT_URL ||
    process.env.MOBILE_MONEY_DISBURSEMENT_URL ||
    `${(process.env.MTN_BASE_URL || process.env.MOBILE_MONEY_BASE_URL || (process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET ? "https://api.mtn.com" : "https://sandbox.momodeveloper.mtn.com")).trim().replace(/\/$/, "")}/disbursement/v1_0/transfer`
  ).trim(),
  airtelApiKey: (process.env.AIRTEL_API_KEY || process.env.MOBILE_MONEY_API_KEY || "").trim(),
  airtelApiSecret: (process.env.AIRTEL_API_SECRET || process.env.MOBILE_MONEY_API_SECRET || "").trim(),
  airtelCollectionUrl: (process.env.AIRTEL_COLLECTION_URL || process.env.MOBILE_MONEY_COLLECTION_URL || "").trim(),
  airtelVerificationUrl: (process.env.AIRTEL_VERIFICATION_URL || process.env.MOBILE_MONEY_VERIFICATION_URL || "").trim(),
  airtelDisbursementUrl: (process.env.AIRTEL_DISBURSEMENT_URL || process.env.MOBILE_MONEY_DISBURSEMENT_URL || "").trim(),
  airtelCallbackUrl: (process.env.AIRTEL_CALLBACK_URL || process.env.AIRTEL_WEBHOOK_URL || (configuredPublicUrl ? `${configuredPublicUrl}/api/payments/airtel/callback` : "")).trim(),
  airtelWebhookUrl: (process.env.AIRTEL_WEBHOOK_URL || (configuredPublicUrl ? `${configuredPublicUrl}/api/payments/webhooks/airtel` : "")).trim(),
  airtelEnabled: String(process.env.AIRTEL_ENABLED || "false").trim().toLowerCase() === "true",
  mobileMoneyCallbackUrl: (
    process.env.MTN_CALLBACK_URL ||
    process.env.MOBILE_MONEY_CALLBACK_URL ||
    `${(configuredPublicUrl || configuredClientUrls[0] || "").trim().replace(/\/$/, "")}/api/payments/mtn/callback`
  ).trim(),
  mobileMoneyWebhookToken: (process.env.MOBILE_MONEY_WEBHOOK_TOKEN || "").trim(),
};

export function validateEnv() {
  const missing = [];
  const validMobileMoneyModes = ["mock", "sandbox", "provider", "live", "auto"];

  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    missing.push("JWT_SECRET with at least 32 characters");
  }

  if (env.nodeEnv === "production" && !env.appPublicUrl) {
    missing.push("APP_PUBLIC_URL for same-domain callbacks and secure production URLs");
  }

  if (env.nodeEnv === "production" && env.clientUrls.length === 0) {
    missing.push("CLIENT_URL with the production frontend origin");
  }

  if (env.nodeEnv === "production" && !env.resendApiKey) {
    missing.push("RESEND_API_KEY for production verification emails");
  }

  if (env.nodeEnv === "production" && env.emailFrom !== "Queless <info@queless.org>") {
    missing.push("EMAIL_FROM=Queless <info@queless.org>");
  }

  if (env.nodeEnv === "production" && !(process.env.FRONTEND_URL || "").trim()) {
    missing.push("FRONTEND_URL=https://queless.org");
  }

  if (env.nodeEnv === "production" && [...env.clientUrls, ...env.devClientUrls].some(isLoopbackUrl)) {
    missing.push("remove localhost/127.0.0.1/::1 origins from CLIENT_URL and DEV_CLIENT_URL in production");
  }

  if (env.nodeEnv === "production" && env.allowLocalDevOrigins) {
    missing.push("ALLOW_LOCAL_DEV_ORIGINS=false in production");
  }

  if (!validMobileMoneyModes.includes(env.mobileMoneyMode)) {
    missing.push("MOBILE_MONEY_MODE must be mock, sandbox, provider, live, or auto");
  }

  if (env.nodeEnv === "production" && env.bookingOnlinePaymentsEnabled && env.mobileMoneyMode === "mock") {
    missing.push("MOBILE_MONEY_MODE must be sandbox, provider, live, or auto when production booking payments are enabled");
  }

  if (!["sqlite", "postgres"].includes(env.dbClient)) {
    missing.push("DB_CLIENT set to sqlite or postgres");
  }

  if (env.nodeEnv === "production" && env.dbClient !== "postgres") {
    missing.push("DB_CLIENT=postgres in production");
  }

  if (env.dbClient === "postgres" && !env.databaseUrl) {
    missing.push("DATABASE_URL for PostgreSQL");
  }

  if (env.nodeEnv === "production" && /USERNAME:PASSWORD|HOST:5432|DATABASE_NAME/i.test(env.databaseUrl)) {
    missing.push("replace the placeholder DATABASE_URL with the real production PostgreSQL connection string");
  }

  if (["sandbox", "provider", "live", "auto"].includes(env.mobileMoneyMode)) {
    if (env.mobileMoneyDefaultProvider === "mtn") {
      const hasConsumerCredentials = Boolean(env.mtnConsumerKey && env.mtnConsumerSecret);
      if (!hasConsumerCredentials) {
        if (!env.mtnApiUserId) missing.push("MTN_API_USER_ID for MTN MoMo API user");
        if (!env.mtnApiKey) missing.push("MTN_API_KEY for MTN MoMo");
        if (!env.mtnCollectionSubscriptionKey) {
          missing.push("MTN_SUBSCRIPTION_KEY, MTN_COLLECTION_PRIMARY_KEY, or MTN_COLLECTION_SECONDARY_KEY");
        }
      }
    }
  }

  if (env.nodeEnv === "production" && env.bookingOnlinePaymentsEnabled && !env.mobileMoneyCallbackUrl) {
    missing.push("MTN_CALLBACK_URL or MOBILE_MONEY_CALLBACK_URL for public MTN callbacks");
  }

  if (env.nodeEnv === "production" && env.africasTalkingLifecycleSmsEnabled) {
    if (!env.africasTalkingUsername) missing.push("AFRICASTALKING_USERNAME for lifecycle SMS fallback");
    if (!env.africasTalkingApiKey) missing.push("AFRICASTALKING_API_KEY for lifecycle SMS fallback");
    if (env.africasTalkingEnv !== "production" || env.africasTalkingUsername === "sandbox") {
      missing.push("AFRICASTALKING_ENV=production with non-sandbox username for lifecycle SMS fallback");
    }
  }

  if (missing.length) {
    throw new Error(`Missing required environment configuration: ${missing.join(", ")}`);
  }
}
