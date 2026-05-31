import test from "node:test";
import assert from "node:assert/strict";

const MTN_ENV_KEYS = [
  "NODE_ENV",
  "APP_PUBLIC_URL",
  "CLIENT_URL",
  "FRONTEND_URL",
  "ALLOW_LOCAL_DEV_ORIGINS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "JWT_SECRET",
  "DB_CLIENT",
  "DATABASE_URL",
  "MOBILE_MONEY_MODE",
  "BOOKING_ONLINE_PAYMENTS_ENABLED",
  "MOBILE_MONEY_DEFAULT_PROVIDER",
  "MOBILE_MONEY_API_SECRET",
  "MTN_API_USER_ID",
  "MTN_API_USER",
  "MTN_API_KEY",
  "MTN_API_SECRET",
  "MTN_COLLECTION_SUBSCRIPTION_KEY",
  "MTN_CONSUMER_KEY",
  "MTN_CONSUMER_SECRET",
];

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function importFreshEnv() {
  return import(`./env.js?test=${Date.now()}-${Math.random()}`);
}

function setMtnProviderEnv(overrides = {}) {
  Object.assign(process.env, {
    NODE_ENV: "production",
    APP_PUBLIC_URL: "https://queless.org",
    CLIENT_URL: "https://queless.org",
    FRONTEND_URL: "https://queless.org",
    ALLOW_LOCAL_DEV_ORIGINS: "false",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Queless <info@queless.org>",
    JWT_SECRET: "a-production-secret-that-is-long-enough",
    DB_CLIENT: "postgres",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/queless",
    MOBILE_MONEY_MODE: "provider",
    BOOKING_ONLINE_PAYMENTS_ENABLED: "true",
    MOBILE_MONEY_DEFAULT_PROVIDER: "mtn",
    MTN_CONSUMER_KEY: "",
    MTN_CONSUMER_SECRET: "",
    MTN_API_USER_ID: "",
    MTN_API_USER: "",
    MTN_API_KEY: "mtn-api-key",
    MTN_API_SECRET: "not-an-api-user-id",
    MOBILE_MONEY_API_SECRET: "also-not-an-api-user-id",
    MTN_COLLECTION_SUBSCRIPTION_KEY: "collection-subscription-key",
    ...overrides,
  });
}

test("does not parse MTN API user ID from secret fields", async () => {
  const originalEnv = snapshotEnv(MTN_ENV_KEYS);
  try {
    setMtnProviderEnv();

    const { env } = await importFreshEnv();

    assert.equal(env.mtnApiUserId, "");
  } finally {
    restoreEnv(originalEnv);
  }
});

test("validateEnv clearly fails when MTN API user ID is missing", async () => {
  const originalEnv = snapshotEnv(MTN_ENV_KEYS);
  try {
    setMtnProviderEnv();

    const { validateEnv } = await importFreshEnv();

    assert.throws(
      () => validateEnv(),
      /MTN_API_USER_ID for MTN MoMo API user/
    );
  } finally {
    restoreEnv(originalEnv);
  }
});
