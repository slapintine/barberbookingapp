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

test("toUgLocalDigits normalizes pasted formats to 9 local digits", () => {
  assert.equal(toUgLocalDigits("771234567"), "771234567");
  assert.equal(toUgLocalDigits("0771234567"), "771234567");
  assert.equal(toUgLocalDigits("+256771234567"), "771234567");
  assert.equal(toUgLocalDigits("256771234567"), "771234567");
  assert.equal(toUgLocalDigits(" 0771 234 567 "), "771234567");
  assert.equal(toUgLocalDigits("0771-234-567"), "771234567");
  assert.equal(toUgLocalDigits("77123456799999"), "771234567");
  assert.equal(toUgLocalDigits("abc"), "");
});

test("getUgMobileProvider detects MTN and Airtel from the prefix", () => {
  for (const prefix of ["76", "77", "78", "39"]) {
    assert.equal(getUgMobileProvider(`${prefix}1234567`), "mtn_mobile_money");
  }
  for (const prefix of ["70", "74", "75", "20"]) {
    assert.equal(getUgMobileProvider(`${prefix}1234567`), "airtel_money");
  }
  assert.equal(getUgMobileProvider("121234567"), "");
});

test("Uganda phone helpers validate and mask numbers for mobile money", () => {
  assert.equal(isValidUgMobile("771234567"), true);
  assert.equal(isValidUgMobile("112384494"), false);
  assert.equal(toE164Uganda("0771234567"), "+256771234567");
  assert.equal(maskUgandaPhone("0771234567"), "+256 7** *** 567");
});

test("validateUgMobileForProvider catches incomplete, invalid, and wrong-provider numbers", () => {
  assert.deepEqual(validateUgMobileForProvider("78238", "mtn_mobile_money"), {
    valid: false,
    error: "Enter the 9 digits after +256.",
  });
  assert.deepEqual(validateUgMobileForProvider("112384494", "mtn_mobile_money"), {
    valid: false,
    error: "This does not look like a valid Uganda mobile money number.",
  });
  assert.deepEqual(validateUgMobileForProvider("701234567", "mtn_mobile_money"), {
    valid: false,
    error: "This number looks like Airtel, but MTN Mobile Money is selected.",
  });
  assert.deepEqual(validateUgMobileForProvider("771234567", "airtel_money"), {
    valid: false,
    error: "This number looks like MTN, but Airtel Money is selected.",
  });
  assert.deepEqual(validateUgMobileForProvider("771234567", "mtn_mobile_money"), {
    valid: true,
    error: "",
  });
});
