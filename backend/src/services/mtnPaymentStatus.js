function classifyTargetEnvironment(value) {
  const target = String(value || "").trim().toLowerCase();
  if (target === "sandbox") return "sandbox";
  if (target === "mtnuganda") return "mtnuganda";
  return "unknown";
}

function classifyCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return ["UGX", "EUR"].includes(currency) ? currency : "unknown";
}

function classifyEndpoint(value) {
  try {
    const endpoint = new URL(String(value || ""));
    const hostname = endpoint.hostname.toLowerCase();
    if (hostname === "sandbox.momodeveloper.mtn.com") return "sandbox";
    if (endpoint.protocol === "https:" && (hostname === "mtn.com" || hostname.endsWith(".mtn.com"))) {
      return "production";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

function classifyCallback(value) {
  if (!String(value || "").trim()) return "missing";

  try {
    const callback = new URL(value);
    return callback.origin === "https://queless.org" && callback.pathname === "/api/payments/mtn/callback"
      ? "approved"
      : "mismatch";
  } catch {
    return "mismatch";
  }
}

export function buildMtnPaymentStatus({
  health = {},
  mode = "mock",
  liveMode = false,
  requireLive = false,
  targetEnvironment = "",
  currency = "",
  baseUrl = "",
  collectionUrl = "",
  callbackUrl = "",
} = {}) {
  const normalizedMode = String(mode || "mock").toLowerCase();
  const credentialsLoaded = Boolean(health.credentialsLoaded);
  const callbackConfigured = Boolean(health.callbackConfigured);
  const authStatus = String(health.authStatus || "not_tested").toLowerCase();
  const statusCode = Number(health.statusCode || 0);
  const configuration = {
    mode: ["mock", "sandbox", "provider", "live", "auto"].includes(normalizedMode) ? normalizedMode : "unknown",
    targetEnvironment: classifyTargetEnvironment(targetEnvironment),
    currency: classifyCurrency(currency),
    baseEndpoint: classifyEndpoint(baseUrl),
    collectionEndpoint: classifyEndpoint(collectionUrl),
    callback: callbackConfigured ? classifyCallback(callbackUrl) : "missing",
    authenticationFlow: ["mtn_api_user", "oauth_consumer"].includes(health.authFlow)
      ? health.authFlow
      : "unknown",
  };

  let reasonCode = "UNKNOWN";
  let userMessage = "MTN Mobile Money setup could not be verified.";

  if (normalizedMode === "mock") {
    reasonCode = "PROVIDER_DISABLED";
    userMessage = "Live MTN Mobile Money payments are disabled.";
  } else if (requireLive && (normalizedMode === "sandbox" || !liveMode)) {
    reasonCode = "SANDBOX_MODE";
    userMessage = "MTN Mobile Money is authenticated in sandbox mode, not Uganda live mode.";
  } else if (
    requireLive &&
    (configuration.baseEndpoint !== "production" || configuration.collectionEndpoint !== "production")
  ) {
    reasonCode = "SANDBOX_ENDPOINT";
    userMessage = "MTN Mobile Money production endpoints are not configured.";
  } else if (
    requireLive &&
    (configuration.targetEnvironment !== "mtnuganda" ||
      configuration.currency !== "UGX" ||
      configuration.callback !== "approved" ||
      configuration.authenticationFlow !== "oauth_consumer")
  ) {
    reasonCode = "CONFIG_MISSING";
    userMessage = "MTN Mobile Money Uganda live configuration is incomplete.";
  } else if (!credentialsLoaded || !callbackConfigured) {
    reasonCode = "CONFIG_MISSING";
    userMessage = "MTN Mobile Money setup is incomplete.";
  } else if (authStatus === "success") {
    return {
      serverReachable: true,
      paymentsEnabled: true,
      provider: "mtn_mobile_money",
      liveMode: Boolean(liveMode),
      configuration,
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
    provider: "mtn_mobile_money",
    liveMode: Boolean(liveMode),
    configuration,
    reasonCode,
    userMessage,
  };
}
