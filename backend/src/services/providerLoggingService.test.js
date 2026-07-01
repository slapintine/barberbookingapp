import test from "node:test";
import assert from "node:assert/strict";
import {
  maskPaymentPhone,
  sanitizeProviderLogText,
} from "./providerLoggingService.js";

test("masks MTN phone numbers before logging", () => {
  const masked = maskPaymentPhone("+256769075717");

  assert.equal(masked, "+256***5717");
  assert.equal(masked.includes("769075717"), false);
});

test("normalizes provider log text to one bounded line", () => {
  const sanitized = sanitizeProviderLogText(` rejected\n\t${"x".repeat(300)} `);

  assert.equal(sanitized.includes("\n"), false);
  assert.equal(sanitized.includes("\t"), false);
  assert.equal(sanitized.length, 220);
});
