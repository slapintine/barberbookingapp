import { logger } from "../config/logger.js";

function redactCredentials(credentials) {
  const entries = Object.entries(credentials || {}).map(([key, value]) => {
    if (!value) return [key, value];
    const stringValue = String(value);
    if (stringValue.length <= 8) return [key, "***"];
    return [key, `${stringValue.slice(0, 4)}...${stringValue.slice(-4)}`];
  });
  return Object.fromEntries(entries);
}

export function logProviderRequest({ provider, operation, endpoint, request, credentials = {} }) {
  logger.info({
    domain: "mobile_money",
    provider,
    operation,
    stage: "request",
    endpoint,
    credentials: redactCredentials(credentials),
    payload: request,
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
    payload: response,
  });
}
