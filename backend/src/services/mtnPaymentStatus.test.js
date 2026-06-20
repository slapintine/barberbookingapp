import test from "node:test";
import assert from "node:assert/strict";
import { buildMtnPaymentStatus } from "./mtnPaymentStatus.js";

test("reports configured MTN payment readiness without credentials", () => {
  assert.deepEqual(buildMtnPaymentStatus({
    mode: "live",
    liveMode: true,
    health: { credentialsLoaded: true, callbackConfigured: true, authStatus: "success", statusCode: 200 },
  }), {
    serverReachable: true,
    paymentsEnabled: true,
    provider: "mtn_momo",
    liveMode: true,
    reasonCode: null,
    userMessage: "MTN Mobile Money is ready.",
  });
});

test("distinguishes disabled, missing config, approval, and provider network failures", () => {
  assert.equal(buildMtnPaymentStatus({ mode: "mock" }).reasonCode, "PROVIDER_DISABLED");
  assert.equal(buildMtnPaymentStatus({ mode: "live", health: {} }).reasonCode, "CONFIG_MISSING");
  assert.equal(buildMtnPaymentStatus({ mode: "live", health: { credentialsLoaded: true, callbackConfigured: true, authStatus: "failed", statusCode: 403 } }).reasonCode, "APPROVAL_PENDING");
  assert.equal(buildMtnPaymentStatus({ mode: "live", health: { credentialsLoaded: true, callbackConfigured: true, authStatus: "failed", statusCode: 502 } }).reasonCode, "NETWORK_ERROR");
});
