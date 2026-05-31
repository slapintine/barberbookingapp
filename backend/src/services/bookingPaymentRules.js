import { calculateCommissionBreakdown, normalizeMoneyAmount } from "./paymentService.js";

export const BOOKING_PAYMENT_METHODS = ["mtn_mobile_money", "airtel_money", "wallet", "wallet_balance"];
export const ONLINE_BOOKING_PAYMENT_METHODS = ["mtn_mobile_money", "airtel_money"];

export function isMobileMoneyPayment(method) {
  return ONLINE_BOOKING_PAYMENT_METHODS.includes(String(method || "").toLowerCase());
}

export function isBookingPaymentMethodEnabled(
  method,
  { onlinePaymentsEnabled = false, walletPaymentsEnabled = false } = {}
) {
  const normalized = String(method || "cash").toLowerCase();
  if (normalized === "wallet" || normalized === "wallet_balance") return Boolean(walletPaymentsEnabled);
  if (isMobileMoneyPayment(normalized)) return Boolean(onlinePaymentsEnabled);
  return false;
}

export function getBookingPaymentBreakdown(amount, method) {
  if (isMobileMoneyPayment(method)) {
    return calculateCommissionBreakdown(amount);
  }

  const grossAmount = normalizeMoneyAmount(amount, "Booking amount");
  return {
    grossAmount,
    commissionAmount: 0,
    barberAmount: grossAmount,
  };
}
