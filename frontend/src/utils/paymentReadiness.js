const DETAIL_LABELS = {
  CONFIG_MISSING: "Payment setup incomplete",
  PROVIDER_DISABLED: "Live payment provider disabled",
  APPROVAL_PENDING: "Provider approval pending",
  NETWORK_ERROR: "Network check failed",
  SERVER_UNREACHABLE: "Server unreachable",
  UNKNOWN: "Payment status could not be verified",
};

export function getMtnReadiness(health) {
  const legacyReady = Boolean(health?.credentialsLoaded) &&
    Boolean(health?.callbackConfigured) &&
    String(health?.authStatus || "").toLowerCase() === "success";
  const ready = typeof health?.paymentsEnabled === "boolean" ? health.paymentsEnabled : legacyReady;
  const reasonCode = ready ? null : String(health?.reasonCode || "UNKNOWN");
  return {
    ready,
    reasonCode,
    detail: ready ? "Ready" : DETAIL_LABELS[reasonCode] || DETAIL_LABELS.UNKNOWN,
  };
}

export function getMtnUnavailableMessage(reasonCode) {
  const detail = DETAIL_LABELS[reasonCode] || DETAIL_LABELS.UNKNOWN;
  return `MTN Mobile Money is not ready yet. You can still continue with cash booking where available. Details: ${detail}.`;
}
