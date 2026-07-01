import { logger } from "../config/logger.js";

function redactCredentials(credentials) {
  const entries = Object.entries(credentials || {}).map(([key, value]) => {
    if (!value) return [key, value];
    return [key, "[REDACTED]"];
  });
  return Object.fromEntries(entries);
}

function redactSensitivePayload(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSensitivePayload(item));

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      const normalizedKey = String(key || "").toLowerCase();
      if (
        normalizedKey.includes("token") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("apikey") ||
        normalizedKey.includes("api_key") ||
        normalizedKey.includes("authorization") ||
        normalizedKey.includes("partyid") ||
        normalizedKey.includes("phone") ||
        normalizedKey.includes("msisdn")
      ) {
        return [key, "[REDACTED]"];
      }
      return [key, redactSensitivePayload(entryValue)];
    })
  );
}

export function sanitizeProviderLogText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export function maskPaymentPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "[REDACTED]";
  const countryPrefix = digits.startsWith("256") ? "+256" : "";
  return `${countryPrefix}***${digits.slice(-4)}`;
}

export function logProviderRequest({ provider, operation, endpoint, request, credentials = {} }) {
  logger.info({
    domain: "mobile_money",
    provider,
    operation,
    stage: "request",
    endpoint,
    credentials: redactCredentials(credentials),
    payload: redactSensitivePayload(request),
  });
}

export function logProviderResponse({ provider, operation, endpoint, statusCode, response }) {
  logger.info({
    domain: "mobile_money",
    provider,
    operation,
    stage: "response",
    endpoint,
    statusCode,
    payload: redactSensitivePayload(response),
  });
}

export function logMtnCollectionAttempt({
  mode,
  targetEnvironment,
  currency,
  amount,
  phoneNumber,
  reference,
  providerReference,
}) {
  logger.info({
    domain: "mobile_money",
    provider: "mtn",
    operation: "collection",
    stage: "request_to_pay",
    mode,
    targetEnvironment,
    currency,
    amount: Number(amount || 0),
    phone: maskPaymentPhone(phoneNumber),
    reference: sanitizeProviderLogText(reference),
    providerReference: sanitizeProviderLogText(providerReference),
  });
}

export function logMtnCollectionOutcome({
  statusCode,
  providerCode,
  providerMessage,
  reference,
  providerReference,
  outcome,
}) {
  logger.info({
    domain: "mobile_money",
    provider: "mtn",
    operation: "collection",
    stage: "request_to_pay_result",
    outcome: sanitizeProviderLogText(outcome, "unknown"),
    statusCode: Number(statusCode || 0),
    providerCode: sanitizeProviderLogText(providerCode),
    providerMessage: sanitizeProviderLogText(providerMessage),
    reference: sanitizeProviderLogText(reference),
    providerReference: sanitizeProviderLogText(providerReference),
  });
}
