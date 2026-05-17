import test from "node:test";
import assert from "node:assert/strict";
import {
  getBookingPaymentBreakdown,
  isBookingPaymentMethodEnabled,
  isMobileMoneyPayment,
} from "./bookingPaymentRules.js";

test("does not apply commission to cash booking payments", () => {
  assert.deepEqual(getBookingPaymentBreakdown(20000, "cash"), {
    grossAmount: 20000,
    commissionAmount: 0,
    barberAmount: 20000,
  });
});

test("keeps commission for mobile money booking payments", () => {
  assert.deepEqual(getBookingPaymentBreakdown(20000, "mtn_mobile_money"), {
    grossAmount: 20000,
    commissionAmount: 2000,
    barberAmount: 18000,
  });
});

test("detects mobile money providers explicitly", () => {
  assert.equal(isMobileMoneyPayment("cash"), false);
  assert.equal(isMobileMoneyPayment("wallet"), false);
  assert.equal(isMobileMoneyPayment("airtel_money"), true);
});

test("keeps unfinished booking payment methods behind feature flags", () => {
  assert.equal(isBookingPaymentMethodEnabled("cash"), true);
  assert.equal(isBookingPaymentMethodEnabled("wallet"), false);
  assert.equal(isBookingPaymentMethodEnabled("mtn_mobile_money"), false);
  assert.equal(isBookingPaymentMethodEnabled("airtel_money"), false);
  assert.equal(isBookingPaymentMethodEnabled("wallet", { walletPaymentsEnabled: true }), false);
  assert.equal(isBookingPaymentMethodEnabled("mtn_mobile_money", { onlinePaymentsEnabled: true }), true);
});
