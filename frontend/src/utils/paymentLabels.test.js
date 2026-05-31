import test from "node:test";
import assert from "node:assert/strict";
import {
  getBookingPaymentOptions,
  getPaymentMethodLabel,
  isBookingPaymentMethodEnabled,
  isOnlinePaymentMethod,
} from "./paymentLabels.js";

test("labels booking payment methods accurately in customer and barber views", () => {
  assert.equal(getPaymentMethodLabel("wallet"), "Wallet Balance");
  assert.equal(getPaymentMethodLabel("wallet_balance"), "Wallet Balance");
  assert.equal(getPaymentMethodLabel("mtn_mobile_money"), "MTN Mobile Money");
  assert.equal(getPaymentMethodLabel("airtel_money"), "Airtel Money");
});

test("treats only mobile money methods as online payment methods", () => {
  assert.equal(isOnlinePaymentMethod("cash"), false);
  assert.equal(isOnlinePaymentMethod("wallet"), false);
  assert.equal(isOnlinePaymentMethod("mtn_mobile_money"), true);
  assert.equal(isOnlinePaymentMethod("airtel_money"), true);
});

test("hides booking payment methods by default", () => {
  assert.equal(isBookingPaymentMethodEnabled("cash"), false);
  assert.equal(isBookingPaymentMethodEnabled("wallet"), false);
  assert.equal(isBookingPaymentMethodEnabled("mtn_mobile_money"), false);
  assert.deepEqual(getBookingPaymentOptions().map((option) => option.value), []);
});

test("can reveal mobile money booking methods behind a feature flag", () => {
  assert.deepEqual(
    getBookingPaymentOptions({ onlinePaymentsEnabled: true }).map((option) => option.value),
    ["mtn_mobile_money", "airtel_money"]
  );
});

test("can reveal wallet booking payment when balance covers booking", () => {
  assert.equal(isBookingPaymentMethodEnabled("wallet", { walletPaymentsEnabled: true }), true);
  const options = getBookingPaymentOptions({
    walletPaymentsEnabled: true,
    walletBalance: 25000,
    bookingAmount: 12000,
  });
  assert.equal(options.find((option) => option.value === "wallet_balance")?.disabled, false);
});

test("keeps wallet visible but disabled when balance is insufficient", () => {
  const wallet = getBookingPaymentOptions({
    walletPaymentsEnabled: true,
    walletBalance: 5000,
    bookingAmount: 12000,
  }).find((option) => option.value === "wallet_balance");
  assert.equal(wallet?.disabled, true);
  assert.match(wallet?.meta || "", /Insufficient wallet balance/);
});
