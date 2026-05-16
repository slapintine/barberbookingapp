export function getPaymentMethodLabel(method) {
  const normalized = String(method || "cash").toLowerCase();
  if (normalized === "wallet") return "Wallet";
  if (normalized === "mtn_mobile_money") return "MTN Mobile Money";
  if (normalized === "airtel_money") return "Airtel Money";
  return "Cash";
}

export function isOnlinePaymentMethod(method) {
  return ["mtn_mobile_money", "airtel_money"].includes(String(method || "").toLowerCase());
}

export function isBookingPaymentMethodEnabled(method, { onlinePaymentsEnabled = false } = {}) {
  const normalized = String(method || "cash").toLowerCase();
  if (normalized === "cash") return true;
  if (isOnlinePaymentMethod(normalized)) return Boolean(onlinePaymentsEnabled);
  return false;
}

export function getBookingPaymentOptions({ onlinePaymentsEnabled = false } = {}) {
  return [
    {
      value: "cash",
      label: "Cash - Required",
      meta: "Pay cash directly to the service provider at or after the service.",
      pill: "Always available",
      enabled: true,
    },
    {
      value: "mtn_mobile_money",
      label: "MTN Mobile Money",
      meta: "Approve a phone prompt to confirm the booking immediately.",
      pill: "Instant",
      enabled: isBookingPaymentMethodEnabled("mtn_mobile_money", { onlinePaymentsEnabled }),
    },
  ].filter((option) => option.enabled);
}
