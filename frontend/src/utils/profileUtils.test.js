import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPhoneNumber,
  isValidPhoneNumber,
  sanitizeDigits,
  splitPhoneNumber,
} from "./profileUtils.js";

test("normalizes East African phone numbers for saved profiles", () => {
  assert.equal(sanitizeDigits("+256 700 123 456"), "256700123456");
  assert.deepEqual(splitPhoneNumber("+256700123456"), {
    countryCode: "+256",
    localNumber: "700123456",
  });
  assert.equal(buildPhoneNumber("+256", "0700123456"), "+256700123456");
});

test("validates saved phone numbers by selected country length", () => {
  assert.equal(isValidPhoneNumber("+256", "700123456"), true);
  assert.equal(isValidPhoneNumber("+256", "70012345"), false);
  assert.equal(isValidPhoneNumber("+999", "700123456"), false);
});
