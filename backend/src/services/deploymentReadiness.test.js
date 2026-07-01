import test, { after } from "node:test";
import assert from "node:assert/strict";
import db from "../config/db.js";
import { getMtnCallbackSecurityStatus, redactUrlForReadiness } from "./deploymentReadiness.js";

after(async () => {
  await db.close?.();
});

test("redacts callback query values from readiness output", () => {
  const secret = "a-secret-webhook-token-that-must-not-appear";
  const result = redactUrlForReadiness(`https://queless.org/api/payments/mtn/callback?token=${secret}`);

  assert.equal(result, "https://queless.org/api/payments/mtn/callback?[redacted]");
  assert.equal(result.includes(secret), false);
});

test("requires the callback token to match the configured strong token", () => {
  const token = "a-strong-webhook-token-with-32-characters";

  assert.equal(
    getMtnCallbackSecurityStatus(`https://queless.org/api/payments/mtn/callback?token=${token}`, token).ok,
    true
  );
  assert.equal(
    getMtnCallbackSecurityStatus("https://queless.org/api/payments/mtn/callback?token=wrong", token).ok,
    false
  );
  assert.equal(
    getMtnCallbackSecurityStatus("https://queless.org/api/payments/mtn/callback", token).ok,
    false
  );
});
