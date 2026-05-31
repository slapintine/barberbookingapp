export function getPaymentMethodLabel(method) {
  const normalized = String(method || "").toLowerCase();
  if (normalized === "wallet" || normalized === "wallet_balance") return "Wallet Balance";
  if (normalized === "mtn_mobile_money") return "MTN Mobile Money";
  if (normalized === "airtel_money") return "Airtel Money";
  return "Mobile Money";
}

export function isOnlinePaymentMethod(method) {
  return ["mtn_mobile_money", "airtel_money"].includes(String(method || "").toLowerCase());
}

export function isBookingPaymentMethodEnabled(method, { onlinePaymentsEnabled = false, walletPaymentsEnabled = false } = {}) {
  const normalized = String(method || "").toLowerCase();
  if (normalized === "wallet" || normalized === "wallet_balance") return Boolean(walletPaymentsEnabled);
  if (isOnlinePaymentMethod(normalized)) return Boolean(onlinePaymentsEnabled);
  return false;
}

export function getBookingPaymentOptions({ onlinePaymentsEnabled = false, walletPaymentsEnabled = false, walletBalance = 0, bookingAmount = 0 } = {}) {
  const balance = Number(walletBalance || 0);
  const amount = Number(bookingAmount || 0);
  const walletEnough = amount > 0 && balance >= amount;
  return [
    {
      value: "mtn_mobile_money",
      label: "MTN Mobile Money",
      meta: "Approve a phone prompt to confirm the booking immediately.",
      pill: "Instant",
      enabled: isBookingPaymentMethodEnabled("mtn_mobile_money", { onlinePaymentsEnabled }),
    },
    {
      value: "airtel_money",
      label: "Airtel Money",
      meta: "Approve a phone prompt to confirm the booking immediately.",
      pill: "Instant",
      enabled: isBookingPaymentMethodEnabled("airtel_money", { onlinePaymentsEnabled }),
    },
    {
      value: "wallet_balance",
      label: "Wallet Balance",
      meta: walletEnough
        ? `Wallet balance: UGX ${balance.toLocaleString()}`
        : `Insufficient wallet balance. Top up to use wallet. Balance: UGX ${balance.toLocaleString()}`,
      pill: walletEnough ? "Fast" : "Top up",
      enabled: isBookingPaymentMethodEnabled("wallet", { walletPaymentsEnabled }),
      disabled: !walletEnough,
    },
  ].filter((option) => option.enabled);
}
