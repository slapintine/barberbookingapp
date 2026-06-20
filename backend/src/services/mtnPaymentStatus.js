export function buildMtnPaymentStatus({ health = {}, mode = "mock", liveMode = false } = {}) {
  const normalizedMode = String(mode || "mock").toLowerCase();
  const credentialsLoaded = Boolean(health.credentialsLoaded);
  const callbackConfigured = Boolean(health.callbackConfigured);
  const authStatus = String(health.authStatus || "not_tested").toLowerCase();
  const statusCode = Number(health.statusCode || 0);

  let reasonCode = "UNKNOWN";
  let userMessage = "MTN Mobile Money setup could not be verified.";

  if (normalizedMode === "mock") {
    reasonCode = "PROVIDER_DISABLED";
    userMessage = "Live MTN Mobile Money payments are disabled.";
  } else if (!credentialsLoaded || !callbackConfigured) {
    reasonCode = "CONFIG_MISSING";
    userMessage = "MTN Mobile Money setup is incomplete.";
  } else if (authStatus === "success") {
    return {
      serverReachable: true,
      paymentsEnabled: true,
      provider: "mtn_momo",
      liveMode: Boolean(liveMode),
      reasonCode: null,
      userMessage: "MTN Mobile Money is ready.",
    };
  } else if ([401, 403].includes(statusCode)) {
    reasonCode = "APPROVAL_PENDING";
    userMessage = "MTN Mobile Money approval or provider access is incomplete.";
  } else if (statusCode === 0 || statusCode >= 500) {
    reasonCode = "NETWORK_ERROR";
    userMessage = "The MTN payment provider could not be reached.";
  }

  return {
    serverReachable: true,
    paymentsEnabled: false,
    provider: "mtn_momo",
    liveMode: Boolean(liveMode),
    reasonCode,
    userMessage,
  };
}
