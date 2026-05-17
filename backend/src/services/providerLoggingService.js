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
