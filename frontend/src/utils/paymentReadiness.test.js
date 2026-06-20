import test from "node:test";
import assert from "node:assert/strict";
import { getMtnReadiness, getMtnUnavailableMessage } from "./paymentReadiness.js";

test("uses the structured backend payment status", () => {
  assert.equal(getMtnReadiness({ paymentsEnabled: true }).ready, true);
  assert.deepEqual(getMtnReadiness({ paymentsEnabled: false, reasonCode: "CONFIG_MISSING" }), {
    ready: false,
    reasonCode: "CONFIG_MISSING",
    detail: "Payment setup incomplete",
  });
});

test("keeps compatibility with the legacy MTN health response", () => {
  assert.equal(getMtnReadiness({ credentialsLoaded: true, callbackConfigured: true, authStatus: "success" }).ready, true);
});

test("gives safe details for offline and unknown failures", () => {
  assert.match(getMtnUnavailableMessage("SERVER_UNREACHABLE"), /Server unreachable/);
  assert.doesNotMatch(getMtnUnavailableMessage("UNKNOWN"), /credential|secret|token/i);
});
