import test from "node:test";
import assert from "node:assert/strict";
import { buildMtnPaymentStatus } from "./mtnPaymentStatus.js";

test("reports configured MTN payment readiness without credentials", () => {
  assert.deepEqual(buildMtnPaymentStatus({
    mode: "live",
    liveMode: true,
    targetEnvironment: "mtnuganda",
    currency: "UGX",
    baseUrl: "https://api.mtn.com",
    collectionUrl: "https://api.mtn.com/collection/v1_0/requesttopay",
    callbackUrl: "https://queless.org/api/payments/mtn/callback",
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "mtn_api_user", authStatus: "success", statusCode: 200 },
  }), {
    serverReachable: true,
    paymentsEnabled: true,
    provider: "mtn_mobile_money",
    liveMode: true,
    configuration: {
      mode: "live",
      targetEnvironment: "mtnuganda",
      currency: "UGX",
      baseEndpoint: "production",
      collectionEndpoint: "production",
      callback: "approved",
      authenticationFlow: "mtn_api_user",
    },
    reasonCode: null,
    userMessage: "MTN Mobile Money is ready.",
  });
});

test("reports only safe MTN runtime classifications", () => {
  const status = buildMtnPaymentStatus({
    mode: "sandbox",
    requireLive: true,
    targetEnvironment: "sandbox",
    currency: "EUR",
    baseUrl: "https://sandbox.momodeveloper.mtn.com",
    collectionUrl: "https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay",
    callbackUrl: "https://queless.org/api/payments/mtn/callback",
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "mtn_api_user", authStatus: "success", statusCode: 200 },
  });

  assert.deepEqual(status.configuration, {
    mode: "sandbox",
    targetEnvironment: "sandbox",
    currency: "EUR",
    baseEndpoint: "sandbox",
    collectionEndpoint: "sandbox",
    callback: "approved",
    authenticationFlow: "mtn_api_user",
  });
  assert.equal(status.paymentsEnabled, false);
  assert.equal(status.reasonCode, "SANDBOX_MODE");
});

test("keeps production payments disabled while explicit endpoints are sandbox", () => {
  const status = buildMtnPaymentStatus({
    mode: "provider",
    liveMode: true,
    requireLive: true,
    targetEnvironment: "mtnuganda",
    currency: "UGX",
    baseUrl: "https://sandbox.momodeveloper.mtn.com",
    collectionUrl: "https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay",
    callbackUrl: "https://queless.org/api/payments/mtn/callback",
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "oauth_consumer", authStatus: "success", statusCode: 200 },
  });

  assert.equal(status.configuration.baseEndpoint, "sandbox");
  assert.equal(status.configuration.collectionEndpoint, "sandbox");
  assert.equal(status.paymentsEnabled, false);
  assert.equal(status.reasonCode, "SANDBOX_ENDPOINT");
});

test("requires the Uganda consumer flow and approved callback for production readiness", () => {
  const common = {
    mode: "provider",
    liveMode: true,
    requireLive: true,
    targetEnvironment: "mtnuganda",
    currency: "UGX",
    baseUrl: "https://api.mtn.com",
    collectionUrl: "https://api.mtn.com/collection/v1_0/requesttopay",
    callbackUrl: "https://queless.org/api/payments/mtn/callback",
  };

  assert.equal(buildMtnPaymentStatus({
    ...common,
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "mtn_api_user", authStatus: "success", statusCode: 200 },
  }).paymentsEnabled, false);

  assert.equal(buildMtnPaymentStatus({
    ...common,
    callbackUrl: "https://example.invalid/callback",
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "oauth_consumer", authStatus: "success", statusCode: 200 },
  }).paymentsEnabled, false);
});

test("flags a callback mismatch without exposing the callback value", () => {
  const status = buildMtnPaymentStatus({
    mode: "live",
    callbackUrl: "https://example.invalid/callback",
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "oauth_consumer", authStatus: "success", statusCode: 200 },
  });

  assert.equal(status.configuration.callback, "mismatch");
  assert.equal(status.configuration.authenticationFlow, "oauth_consumer");
  assert.equal(JSON.stringify(status).includes("example.invalid"), false);
});

test("accepts a tokenized production callback without exposing its token", () => {
  const token = "callback-token-that-must-stay-private";
  const status = buildMtnPaymentStatus({
    mode: "live",
    callbackUrl: `https://queless.org/api/payments/mtn/callback?token=${token}`,
    health: { credentialsLoaded: true, callbackConfigured: true, authFlow: "oauth_consumer", authStatus: "success", statusCode: 200 },
  });

  assert.equal(status.configuration.callback, "approved");
  assert.equal(JSON.stringify(status).includes(token), false);
});

test("distinguishes disabled, missing config, approval, and provider network failures", () => {
  assert.equal(buildMtnPaymentStatus({ mode: "mock" }).reasonCode, "PROVIDER_DISABLED");
  assert.equal(buildMtnPaymentStatus({ mode: "live", health: {} }).reasonCode, "CONFIG_MISSING");
  assert.equal(buildMtnPaymentStatus({ mode: "live", health: { credentialsLoaded: true, callbackConfigured: true, authStatus: "failed", statusCode: 403 } }).reasonCode, "APPROVAL_PENDING");
  assert.equal(buildMtnPaymentStatus({ mode: "live", health: { credentialsLoaded: true, callbackConfigured: true, authStatus: "failed", statusCode: 502 } }).reasonCode, "NETWORK_ERROR");
});
