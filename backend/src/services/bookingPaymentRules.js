import { calculateCommissionBreakdown } from "./paymentService.js";

export const BOOKING_PAYMENT_METHODS = ["cash", "mtn_mobile_money", "airtel_money"];
export const ONLINE_BOOKING_PAYMENT_METHODS = ["mtn_mobile_money", "airtel_money"];

export function isMobileMoneyPayment(method) {
  return ONLINE_BOOKING_PAYMENT_METHODS.includes(String(method || "").toLowerCase());
}

export function isBookingPaymentMethodEnabled(
  method,
  { onlinePaymentsEnabled = false, walletPaymentsEnabled = false } = {}
) {
  const normalized = String(method || "cash").toLowerCase();
  if (normalized === "cash") return true;
  if (normalized === "wallet") return false;
  if (isMobileMoneyPayment(normalized)) return Boolean(onlinePaymentsEnabled);
  return false;
}

export function getBookingPaymentBreakdown(amount, method) {
  if (isMobileMoneyPayment(method)) {
    return calculateCommissionBreakdown(amount);
  }

  const grossAmount = Number(amount || 0);
  return {
    grossAmount,
    commissionAmount: 0,
    barberAmount: grossAmount,
  };
}
