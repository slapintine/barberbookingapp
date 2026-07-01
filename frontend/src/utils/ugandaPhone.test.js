import test from "node:test";
import assert from "node:assert/strict";
import {
  toUgLocalDigits,
  getUgMobileProvider,
  isValidUgMobile,
  toE164Uganda,
  maskUgandaPhone,
  validateUgMobileForProvider,
} from "./ugandaPhone.js";

test("toUgLocalDigits normalizes every pasted format to 9 local digits", () => {
  assert.equal(toUgLocalDigits("771234567"), "771234567");
  assert.equal(toUgLocalDigits("0771234567"), "771234567");
  assert.equal(toUgLocalDigits("+256771234567"), "771234567");
  assert.equal(toUgLocalDigits("256771234567"), "771234567");
  assert.equal(toUgLocalDigits(" 0771 234 567 "), "771234567"); // spaces stripped
  assert.equal(toUgLocalDigits("0771-234-567"), "771234567"); // symbols stripped
  assert.equal(toUgLocalDigits("77123456799999"), "771234567"); // capped at 9
  assert.equal(toUgLocalDigits("abc"), "");
  assert.equal(toUgLocalDigits(""), "");
});

test("getUgMobileProvider detects MTN and Airtel from the prefix", () => {
  for (const p of ["76", "77", "78", "39"]) {
    assert.equal(getUgMobileProvider(`${p}1234567`), "mtn_mobile_money");
  }
  for (const p of ["70", "74", "75", "20"]) {
    assert.equal(getUgMobileProvider(`${p}1234567`), "airtel_money");
  }
  assert.equal(getUgMobileProvider("121234567"), ""); // unknown prefix
  assert.equal(getUgMobileProvider("7"), "");
});

test("isValidUgMobile requires 9 digits and a known prefix", () => {
  assert.equal(isValidUgMobile("771234567"), true); // MTN
  assert.equal(isValidUgMobile("701234567"), true); // Airtel
  assert.equal(isValidUgMobile("78238449"), false); // 8 digits
  assert.equal(isValidUgMobile("112384494"), false); // unknown prefix
  assert.equal(isValidUgMobile(""), false);
});

test("toE164Uganda builds the +256 form the backend expects", () => {
  assert.equal(toE164Uganda("771234567"), "+256771234567");
  assert.equal(toE164Uganda("0771234567"), "+256771234567");
  assert.equal(toE164Uganda("+256771234567"), "+256771234567");
  assert.equal(toE164Uganda("78238449"), ""); // incomplete
});

test("maskUgandaPhone hides the middle digits", () => {
  assert.equal(maskUgandaPhone("771234567"), "+256 7•• ••• 567");
  assert.equal(maskUgandaPhone("0771234567"), "+256 7•• ••• 567");
  assert.equal(maskUgandaPhone("78238449"), ""); // incomplete
});

test("validateUgMobileForProvider catches incomplete, invalid, and wrong-provider", () => {
  assert.deepEqual(validateUgMobileForProvider("78238", "mtn_mobile_money"), {
    valid: false,
    error: "Enter the 9 digits after +256.",
  });
  assert.deepEqual(validateUgMobileForProvider("112384494", "mtn_mobile_money"), {
    valid: false,
    error: "This does not look like a valid Uganda mobile money number.",
  });
  // Airtel number while MTN selected
  assert.deepEqual(validateUgMobileForProvider("701234567", "mtn_mobile_money"), {
    valid: false,
    error: "This number looks like Airtel, but MTN Mobile Money is selected.",
  });
  // MTN number while Airtel selected
  assert.deepEqual(validateUgMobileForProvider("771234567", "airtel_money"), {
    valid: false,
    error: "This number looks like MTN, but Airtel Money is selected.",
  });
  // valid match
  assert.deepEqual(validateUgMobileForProvider("771234567", "mtn_mobile_money"), {
    valid: true,
    error: "",
  });
});
