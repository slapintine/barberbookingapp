import test from "node:test";
import assert from "node:assert/strict";
import {
  getBookingPaymentOptions,
  getPaymentMethodLabel,
  isBookingPaymentMethodEnabled,
  isOnlinePaymentMethod,
} from "./paymentLabels.js";

test("labels booking payment methods accurately in customer and barber views", () => {
  assert.equal(getPaymentMethodLabel("cash"), "Cash");
  assert.equal(getPaymentMethodLabel("wallet"), "Wallet");
  assert.equal(getPaymentMethodLabel("mtn_mobile_money"), "MTN Mobile Money");
  assert.equal(getPaymentMethodLabel("airtel_money"), "Airtel Money");
});

test("treats only mobile money methods as online payment methods", () => {
  assert.equal(isOnlinePaymentMethod("cash"), false);
  assert.equal(isOnlinePaymentMethod("wallet"), false);
  assert.equal(isOnlinePaymentMethod("mtn_mobile_money"), true);
  assert.equal(isOnlinePaymentMethod("airtel_money"), true);
});

test("shows only cash booking payment by default", () => {
  assert.equal(isBookingPaymentMethodEnabled("cash"), true);
  assert.equal(isBookingPaymentMethodEnabled("mtn_mobile_money"), false);
  assert.deepEqual(getBookingPaymentOptions().map((option) => option.value), ["cash"]);
});

test("can reveal mobile money booking methods behind a feature flag", () => {
  assert.deepEqual(
    getBookingPaymentOptions({ onlinePaymentsEnabled: true }).map((option) => option.value),
    ["cash", "mtn_mobile_money"]
  );
});
