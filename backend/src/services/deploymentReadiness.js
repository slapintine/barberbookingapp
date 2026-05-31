import { env, validateEnv } from "../config/env.js";
import { all, transaction } from "../db/query.js";
import { publicBusinessParams, publicBusinessWhere } from "./businessVisibility.js";
import { mtnService } from "./mtn.service.js";
import { getProviderPublicationReadiness } from "./providerPublicationReadiness.js";

const TARGET_ORIGIN = "https://queless.org";
const TARGET_WWW_ORIGIN = "https://www.queless.org";
const REQUIRED_MTN_CALLBACK_PATH = "/api/payments/mtn/callback";

function present(value) {
  return Boolean(String(value || "").trim());
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function parseOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isLoopbackUrl(value) {
  const origin = parseOrigin(value);
  if (!origin) return false;
  const hostname = new URL(origin).hostname;
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function isTargetCallback(value) {
  try {
    const url = new URL(value);
    return url.origin === TARGET_ORIGIN && url.pathname === REQUIRED_MTN_CALLBACK_PATH;
  } catch {
    return false;
  }
}

function status(key, label, ok, detail = "", severity = "blocker", action = "") {
  return { key, label, ok: Boolean(ok), detail, severity, action };
}

function demoBusinessSuspectWhere() {
  return `(
         COALESCE(b.is_demo, 0) = 1
         OR LOWER(COALESCE(b.business_name, '')) LIKE '%demo%'
         OR LOWER(COALESCE(b.business_name, '')) LIKE '%sample%'
         OR LOWER(COALESCE(b.business_name, '')) LIKE '%fake%'
         OR LOWER(COALESCE(b.business_name, '')) LIKE '%test%'
         OR LOWER(COALESCE(b.business_name, '')) LIKE 'qa %'
         OR LOWER(COALESCE(b.business_name, '')) LIKE 'qa_%'
         OR LOWER(COALESCE(u.username, '')) LIKE 'qa_%'
         OR LOWER(COALESCE(p.email, '')) LIKE 'qa.%@%'
         OR LOWER(COALESCE(p.email, '')) LIKE '%@queless.test'
         OR LOWER(COALESCE(b.image, '')) LIKE '%placeholder%'
         OR LOWER(COALESCE(b.location, '')) IN ('test location', 'demo location', 'sample location')
       )`;
}

function suspectReason(item) {
  const reasons = [];
  const businessName = String(item.business_name || "").toLowerCase();
  const ownerUsername = String(item.owner_username || "").toLowerCase();
  const ownerEmail = String(item.owner_email || "").toLowerCase();
  const image = String(item.image || "").toLowerCase();
  const location = String(item.location || "").toLowerCase();

  if (Number(item.is_demo || 0) === 1) reasons.push("Marked as demo");
  if (/(demo|sample|fake|test)/.test(businessName) || businessName.startsWith("qa ") || businessName.startsWith("qa_")) {
    reasons.push("Business name matches demo/test patterns");
  }
  if (ownerUsername.startsWith("qa_")) reasons.push("Owner username matches QA pattern");
  if (ownerEmail.startsWith("qa.") || ownerEmail.endsWith("@queless.test")) reasons.push("Owner email matches QA/test pattern");
  if (image.includes("placeholder")) reasons.push("Image references placeholder media");
  if (["test location", "demo location", "sample location"].includes(location)) reasons.push("Location matches demo/test pattern");
  return reasons.length ? reasons : ["Name, owner, image, or location matches demo/test patterns"];
}

function mapDemoBusinessSuspect(item, customerFacingIds = new Set()) {
  return {
    id: item.id,
    businessName: item.business_name,
    ownerUserId: item.owner_user_id || null,
    ownerUsername: item.owner_username || null,
    ownerEmail: item.owner_email || null,
    location: item.location || "",
    status: item.business_status,
    subscriptionStatus: item.subscription_status || "",
    subscriptionTier: item.subscription_tier || "",
    published: Number(item.is_published || 0) === 1,
    isDemo: Number(item.is_demo || 0) === 1,
    customerFacing: customerFacingIds.has(Number(item.id)),
    reasons: suspectReason(item),
  };
}

function hasMtnCredentials() {
  return Boolean(
    (present(env.mtnConsumerKey) && present(env.mtnConsumerSecret)) ||
      (present(env.mtnApiUserId) && present(env.mtnApiKey) && present(env.mtnCollectionSubscriptionKey))
  );
}

function hasMtnDisbursementCredentials() {
  return Boolean(present(env.mtnApiUserId) && present(env.mtnApiKey) && present(env.mtnDisbursementSubscriptionKey));
}

function getMtnCollectionCredentialDetail() {
  if (present(env.mtnConsumerKey) && present(env.mtnConsumerSecret)) {
    return "MTN consumer credentials configured";
  }

  const missing = [];
  if (!present(env.mtnApiUserId)) missing.push("MTN_API_USER_ID");
  if (!present(env.mtnApiKey)) missing.push("MTN_API_KEY");
  if (!present(env.mtnCollectionSubscriptionKey)) missing.push("MTN_COLLECTION_SUBSCRIPTION_KEY or MTN_SUBSCRIPTION_KEY");

  return missing.length ? `missing ${missing.join(", ")}` : "MTN API user, key, and collection subscription key configured";
}

function getFirebaseServiceAccountStatus() {
  if (!present(env.firebaseServiceAccountJson)) {
    return { ok: false, detail: "FIREBASE_SERVICE_ACCOUNT_JSON is missing" };
  }

  try {
    const parsed = JSON.parse(env.firebaseServiceAccountJson);
    const missing = ["project_id", "client_email", "private_key"].filter((key) => !present(parsed[key]));
    return missing.length
      ? { ok: false, detail: `service account JSON missing ${missing.join(", ")}` }
      : { ok: true, detail: `project_id=${parsed.project_id}` };
  } catch {
    return { ok: false, detail: "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON" };
  }
}

function getCorsDetail() {
  const configured = env.clientUrls.map(cleanUrl);
  const missing = [TARGET_ORIGIN, TARGET_WWW_ORIGIN].filter((origin) => !configured.includes(origin));
  const devOrigins = [...env.clientUrls, ...env.devClientUrls].filter(isLoopbackUrl);
  return {
    configured,
    missing,
    devOrigins,
  };
}

export async function getEnvironmentReadinessChecks() {
  let validationError = "";
  try {
    validateEnv();
  } catch (error) {
    validationError = error.message;
  }

  const cors = getCorsDetail();
  const callbackUrl = env.mtnCallbackUrl || env.mobileMoneyCallbackUrl || "";
  const apiPublicUrl = cleanUrl(env.appPublicUrl);
  const shouldVerifyMtn = env.nodeEnv === "production" && env.bookingOnlinePaymentsEnabled;
  const firebaseServiceAccount = getFirebaseServiceAccountStatus();
  const mtnCollectionCredentialDetail = getMtnCollectionCredentialDetail();

  const checks = [
    status("node_env", "NODE_ENV", env.nodeEnv === "production", `current=${env.nodeEnv}`, "blocker", "Set NODE_ENV=production on the VPS before final launch."),
    status("jwt_secret", "JWT secret", present(env.jwtSecret) && env.jwtSecret.length >= 32, "required, hidden", "blocker", "Set a unique JWT_SECRET with at least 32 characters."),
    status(
      "same_origin_api",
      "Same-origin /api",
      apiPublicUrl === TARGET_ORIGIN,
      apiPublicUrl ? `APP_PUBLIC_URL=${apiPublicUrl}` : "APP_PUBLIC_URL is missing",
      "blocker",
      "Set APP_PUBLIC_URL=https://queless.org and build the frontend with VITE_API_URL=https://queless.org/api."
    ),
    status(
      "cors",
      "Production CORS allowlist",
      env.nodeEnv !== "production" || (cors.missing.length === 0 && cors.devOrigins.length === 0 && !env.allowLocalDevOrigins),
      cors.missing.length || cors.devOrigins.length || env.allowLocalDevOrigins
        ? `missing=${cors.missing.join(", ") || "none"}; devOrigins=${cors.devOrigins.join(", ") || "none"}; allowLocalDevOrigins=${env.allowLocalDevOrigins}`
        : `CLIENT_URL=${cors.configured.join(", ")}`,
      "blocker",
      "Set CLIENT_URL=https://queless.org,https://www.queless.org and keep DEV_CLIENT_URL empty with ALLOW_LOCAL_DEV_ORIGINS=false."
    ),
    status("database", "Production database", env.nodeEnv !== "production" || (env.dbClient === "postgres" && present(env.databaseUrl)), env.dbClient === "postgres" ? "PostgreSQL configured" : `using ${env.dbClient}`, "blocker", "Use DB_CLIENT=postgres and DATABASE_URL for production."),
    status(
      "payments_mode",
      "Online booking payments",
      !env.bookingOnlinePaymentsEnabled || env.mobileMoneyMode !== "mock" || env.nodeEnv !== "production",
      `enabled=${env.bookingOnlinePaymentsEnabled}, mode=${env.mobileMoneyMode}`,
      "blocker",
      "Keep BOOKING_ONLINE_PAYMENTS_ENABLED=false for cash-only launch, or switch MOBILE_MONEY_MODE to sandbox/provider/live."
    ),
    status("cash_bookings", "Cash bookings", true, "Cash booking flow remains available", "info"),
    status(
      "mtn_callback",
      "MTN callback URL",
      !env.bookingOnlinePaymentsEnabled || isTargetCallback(callbackUrl),
      callbackUrl || "not required while online payments are off",
      "blocker",
      "Set MTN_CALLBACK_URL=https://queless.org/api/payments/mtn/callback and mirror it in MOBILE_MONEY_CALLBACK_URL."
    ),
    status("mtn_credentials", "MTN collection credentials", !env.bookingOnlinePaymentsEnabled || hasMtnCredentials(), env.bookingOnlinePaymentsEnabled ? mtnCollectionCredentialDetail : "not required while online payments are off", "blocker", "Configure MTN consumer credentials or MTN_API_USER_ID, MTN_API_KEY, and collection subscription key before enabling online payments."),
    status("mtn_disbursement_credentials", "MTN payout credentials", !env.bookingOnlinePaymentsEnabled || hasMtnDisbursementCredentials() || present(env.mtnConsumerKey), env.bookingOnlinePaymentsEnabled ? "required before provider payouts" : "not required while online payments are off", "warning", "Configure MTN_DISBURSEMENT_SUBSCRIPTION_KEY before enabling live provider withdrawals."),
    status("mtn_routes", "MTN routes", true, "health, initiate, status, callback routes are mounted", "info"),
    status(
      "firebase_admin",
      "Firebase Admin service account",
      env.nodeEnv !== "production" || firebaseServiceAccount.ok,
      firebaseServiceAccount.detail,
      "blocker",
      "Set backend FIREBASE_SERVICE_ACCOUNT_JSON to a valid Firebase Admin service account JSON before launch push testing."
    ),
    status("firebase_routes", "Firebase notification routes", true, "register-token, unregister-token, and test routes are protected and mounted", "info"),
    status("paid_feature_routes", "Paid feature route guards", true, "Smart Match uses customer Premium middleware; AI Coach uses provider Platinum middleware", "info"),
  ];

  if (shouldVerifyMtn) {
    const health = await mtnService.getHealth();
    checks.push(
      status(
        "mtn_auth_live",
        "MTN live authentication",
        health.authStatus === "success",
        health.authStatus === "success"
          ? "MTN authentication succeeded"
          : health.sanitizedError || "MTN authentication has not succeeded",
        "blocker",
        "Fix MTN credentials, product subscription, target environment, or callback registration before enabling online payments."
      )
    );
  }

  if (validationError) {
    checks.push(status("env_validation", "Environment validation", false, validationError, "blocker", "Fix the missing environment values listed by backend validation."));
  }

  return checks;
}

export async function getDemoBusinessSuspects() {
  const [suspects, customerFacingSuspects] = await Promise.all([
    all(
    `SELECT b.id,
            b.business_name,
            b.owner_user_id,
            u.username AS owner_username,
            p.email AS owner_email,
            b.location,
            b.image,
            b.business_status,
            b.subscription_tier,
            b.subscription_status,
            b.is_published,
            b.is_demo,
            b.deleted_at
     FROM barbers b
     LEFT JOIN users u ON u.id = b.owner_user_id
     LEFT JOIN profiles p ON p.user_id = b.owner_user_id
     WHERE b.deleted_at IS NULL
       AND ${demoBusinessSuspectWhere()}
     ORDER BY b.id DESC`
    ),
    all(
      `SELECT b.id
       FROM barbers b
       LEFT JOIN users u ON u.id = b.owner_user_id
       LEFT JOIN profiles p ON p.user_id = b.owner_user_id
       WHERE b.deleted_at IS NULL
         AND ${demoBusinessSuspectWhere()}
         AND ${publicBusinessWhere("b")}
       ORDER BY b.id DESC`,
      publicBusinessParams(new Date())
    ),
  ]);

  const customerFacingIds = new Set(customerFacingSuspects.map((item) => Number(item.id)));
  return suspects.map((item) => mapDemoBusinessSuspect(item, customerFacingIds));
}

export async function getPaidFeatureSafety() {
  const [customerUnsafeRows, providerUnsafeRows] = await Promise.all([
    all(
      `SELECT id, user_id, tier, status, payment_status, expires_at
       FROM customer_subscriptions
       WHERE UPPER(tier) = 'PREMIUM'
         AND LOWER(status) IN ('active', 'trialing')
         AND (
           expires_at IS NULL
           OR expires_at <= CURRENT_TIMESTAMP
           OR (
             LOWER(status) = 'active'
             AND LOWER(COALESCE(payment_status, '')) NOT IN ('paid', 'successful')
           )
         )
       ORDER BY id DESC
       LIMIT 25`
    ),
    all(
      `SELECT b.id,
              b.business_name,
              b.subscription_tier,
              b.subscription_status,
              b.subscription_expires_at,
              bs.id AS latest_subscription_id,
              bs.tier AS latest_tier,
              bs.status AS latest_status,
              bs.trial_status AS latest_trial_status,
              bs.payment_status AS latest_payment_status,
              bs.expires_at AS latest_expires_at
       FROM barbers b
       LEFT JOIN barber_subscriptions bs ON bs.id = (
         SELECT id FROM barber_subscriptions latest
         WHERE latest.barber_id = b.id
         ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
         LIMIT 1
       )
       WHERE b.deleted_at IS NULL
         AND (
           (
             UPPER(COALESCE(bs.tier, '')) = 'PLATINUM'
             AND LOWER(COALESCE(bs.status, '')) IN ('active', 'trialing')
             AND (
               bs.expires_at IS NULL
               OR bs.expires_at <= CURRENT_TIMESTAMP
               OR (
                 LOWER(COALESCE(bs.status, '')) = 'active'
                 AND LOWER(COALESCE(bs.payment_status, '')) NOT IN ('paid', 'successful')
               )
               OR (
                 LOWER(COALESCE(bs.status, '')) = 'trialing'
                 AND LOWER(COALESCE(bs.trial_status, bs.payment_status, '')) NOT IN ('active', 'trialing', 'trial', 'free_trial')
               )
             )
           )
           OR (
             UPPER(COALESCE(b.subscription_tier, '')) = 'PLATINUM'
             AND LOWER(COALESCE(b.subscription_status, '')) IN ('active', 'trialing')
             AND (
               bs.id IS NULL
               OR UPPER(COALESCE(bs.tier, '')) <> 'PLATINUM'
               OR LOWER(COALESCE(bs.status, '')) NOT IN ('active', 'trialing')
               OR bs.expires_at IS NULL
               OR bs.expires_at <= CURRENT_TIMESTAMP
               OR (
                 LOWER(COALESCE(bs.status, '')) = 'active'
                 AND LOWER(COALESCE(bs.payment_status, '')) NOT IN ('paid', 'successful')
               )
             )
           )
         )
       ORDER BY b.id DESC
       LIMIT 25`
    ),
  ]);

  return {
    customerUnsafeRows,
    providerUnsafeRows,
  };
}

export async function remediatePaidFeatureEntitlements({ adminUser = null, reason = "Paid feature entitlement safety cleanup" } = {}) {
  const before = await getPaidFeatureSafety();

  await transaction(async (client) => {
    await client.run(
      `UPDATE customer_subscriptions
       SET status = CASE
             WHEN expires_at IS NULL OR expires_at <= CURRENT_TIMESTAMP THEN 'expired'
             ELSE 'pending'
           END,
           payment_status = CASE
             WHEN expires_at IS NULL OR expires_at <= CURRENT_TIMESTAMP THEN 'expired'
             ELSE COALESCE(NULLIF(payment_status, ''), 'pending')
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE UPPER(tier) = 'PREMIUM'
         AND LOWER(status) IN ('active', 'trialing')
         AND (
           expires_at IS NULL
           OR expires_at <= CURRENT_TIMESTAMP
           OR (
             LOWER(status) = 'active'
             AND LOWER(COALESCE(payment_status, '')) NOT IN ('paid', 'successful')
           )
         )`
    );

    await client.run(
      `UPDATE barber_subscriptions
       SET status = CASE
             WHEN expires_at IS NULL OR expires_at <= CURRENT_TIMESTAMP THEN 'expired'
             ELSE 'pending'
           END,
           payment_status = CASE
             WHEN expires_at IS NULL OR expires_at <= CURRENT_TIMESTAMP THEN 'expired'
             ELSE COALESCE(NULLIF(payment_status, ''), 'pending')
           END,
           is_active = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE UPPER(tier) = 'PLATINUM'
         AND LOWER(status) IN ('active', 'trialing')
         AND (
           expires_at IS NULL
           OR expires_at <= CURRENT_TIMESTAMP
           OR (
             LOWER(status) = 'active'
             AND LOWER(COALESCE(payment_status, '')) NOT IN ('paid', 'successful')
           )
           OR (
             LOWER(status) = 'trialing'
             AND LOWER(COALESCE(trial_status, payment_status, '')) NOT IN ('active', 'trialing', 'trial', 'free_trial')
           )
         )`
    );

    await client.run(
      `UPDATE barbers
       SET subscription_status = 'subscription_expired',
           subscription_expires_at = COALESCE(subscription_expires_at, CURRENT_TIMESTAMP),
           is_published = 0
       WHERE deleted_at IS NULL
         AND UPPER(COALESCE(subscription_tier, '')) = 'PLATINUM'
         AND LOWER(COALESCE(subscription_status, '')) IN ('active', 'trialing')
         AND NOT EXISTS (
           SELECT 1
           FROM barber_subscriptions bs
           WHERE bs.barber_id = barbers.id
             AND UPPER(COALESCE(bs.tier, '')) = 'PLATINUM'
             AND (
               (
                 LOWER(COALESCE(bs.status, '')) = 'active'
                 AND LOWER(COALESCE(bs.payment_status, '')) IN ('paid', 'successful')
                 AND bs.expires_at IS NOT NULL
                 AND bs.expires_at > CURRENT_TIMESTAMP
               )
               OR (
                 LOWER(COALESCE(bs.status, '')) = 'trialing'
                 AND LOWER(COALESCE(bs.trial_status, bs.payment_status, '')) IN ('active', 'trialing', 'trial', 'free_trial')
                 AND bs.expires_at IS NOT NULL
                 AND bs.expires_at > CURRENT_TIMESTAMP
               )
             )
         )`
    );

    await client.run(
      `INSERT INTO admin_audit_log
       (admin_user_id, admin_username, action_type, target_type, target_id, old_value, new_value, reason)
       VALUES (?, ?, 'paid_feature_entitlement_cleanup', 'deployment_readiness', 'paid_feature_safety', ?, ?, ?)`,
      [
        adminUser?.id || null,
        adminUser?.username || "",
        JSON.stringify(before),
        JSON.stringify({ remediation: "expired_or_deactivated_invalid_customer_premium_and_provider_platinum_rows" }),
        reason,
      ]
    ).catch(() => {});
  });

  const after = await getPaidFeatureSafety();
  return { before, after };
}

export async function getDeploymentReadiness() {
  const [demoSuspects, publicRows, paymentRows, bookingRows, paidFeatureSafety, providerPublicationReadiness] = await Promise.all([
    getDemoBusinessSuspects(),
    all(
      `SELECT COUNT(*) AS count
       FROM barbers b
       WHERE b.deleted_at IS NULL
         AND ${publicBusinessWhere("b")}`,
      publicBusinessParams(new Date())
    ),
    all(`SELECT provider, status, COUNT(*) AS count FROM payment_transactions GROUP BY provider, status`),
    all(`SELECT payment_method, status, COUNT(*) AS count FROM bookings GROUP BY payment_method, status`),
    getPaidFeatureSafety(),
    getProviderPublicationReadiness({ limit: 25 }),
  ]);

  const checks = await getEnvironmentReadinessChecks();
  const customerFacingDemoSuspects = demoSuspects.filter((item) => item.customerFacing);
  checks.push(
    status(
      "demo_businesses",
      "Demo/test businesses",
      customerFacingDemoSuspects.length === 0,
      customerFacingDemoSuspects.length
        ? `${customerFacingDemoSuspects.length} customer-facing suspect(s), ${demoSuspects.length} total suspect record(s)`
        : demoSuspects.length
        ? `${demoSuspects.length} suspect record(s), none currently customer-facing`
        : "none found",
      "blocker",
      "Review the suspect list and soft-disable confirmed demo records before launch."
    )
  );
  checks.push(status("public_businesses", "Public business listings", Number(publicRows[0]?.count || 0) > 0, `${Number(publicRows[0]?.count || 0)} public business(es)`, "blocker", "Create or approve at least one real provider with a valid active/trialing plan before launch."));
  checks.push(
    status(
      "customer_premium_safety",
      "Customer Premium safety",
      paidFeatureSafety.customerUnsafeRows.length === 0,
      paidFeatureSafety.customerUnsafeRows.length
        ? `${paidFeatureSafety.customerUnsafeRows.length} active Premium row(s) are unpaid or expired`
        : "no unpaid/expired active Premium rows",
      "blocker",
      "Set unpaid or expired customer Premium rows to pending/expired, or record a successful paid transaction before launch."
    )
  );
  checks.push(
    status(
      "provider_platinum_safety",
      "Provider Platinum safety",
      paidFeatureSafety.providerUnsafeRows.length === 0,
      paidFeatureSafety.providerUnsafeRows.length
        ? `${paidFeatureSafety.providerUnsafeRows.length} Platinum fallback unlock(s) lack a current Platinum subscription row`
        : "no unsafe Platinum fallback unlocks",
      "blocker",
      "Create an active paid/trialing Platinum subscription row or downgrade the business before launch."
    )
  );

  const blockers = checks.filter((item) => !item.ok && item.severity === "blocker");
  const warnings = checks.filter((item) => !item.ok && item.severity !== "blocker");

  return {
    success: blockers.length === 0,
    decision: blockers.length === 0 ? "GO" : "NO_GO",
    generatedAt: new Date().toISOString(),
    targetDomain: "queless.org",
    checks,
    blockers,
    warnings,
    demoBusinessSuspects: demoSuspects,
    customerFacingDemoBusinessSuspects: customerFacingDemoSuspects,
    metrics: {
      publicBusinesses: Number(publicRows[0]?.count || 0),
      customerFacingDemoBusinesses: customerFacingDemoSuspects.length,
      ...providerPublicationReadiness.summary,
      paymentBreakdown: paymentRows,
      bookingBreakdown: bookingRows,
      unsafeCustomerPremiumRows: paidFeatureSafety.customerUnsafeRows.length,
      unsafeProviderPlatinumRows: paidFeatureSafety.providerUnsafeRows.length,
    },
    paidFeatureSafety,
    providerPublicationReadiness,
    nextActions: checks.filter((item) => !item.ok && item.action).map((item) => item.action),
  };
}

export async function softDisableDemoBusinesses({ ids = [], adminUser = null, reason = "Production launch demo cleanup" } = {}) {
  const suspects = await getDemoBusinessSuspects();
  const selectedIds = new Set((ids.length ? ids : suspects.map((item) => item.id)).map((id) => Number(id)).filter(Boolean));
  const selected = suspects.filter((item) => selectedIds.has(Number(item.id)));

  await transaction(async (client) => {
    for (const item of selected) {
      await client.run(
        `UPDATE barbers
         SET is_published = 0,
             is_demo = 1,
             business_status = 'deleted',
             deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND deleted_at IS NULL`,
        [item.id]
      );
      await client.run(
        `INSERT INTO admin_audit_log
         (admin_user_id, admin_username, action_type, target_type, target_id, old_value, new_value, reason)
         VALUES (?, ?, 'deployment_demo_cleanup', 'business', ?, ?, ?, ?)`,
        [
          adminUser?.id || null,
          adminUser?.username || "",
          String(item.id),
          JSON.stringify(item),
          JSON.stringify({ business_status: "deleted", is_published: 0, is_demo: 1, deleted_at: "CURRENT_TIMESTAMP" }),
          reason,
        ]
      );
    }
  });

  return { disabledCount: selected.length, disabled: selected };
}
