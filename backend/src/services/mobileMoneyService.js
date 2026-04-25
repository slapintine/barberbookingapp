import { env } from "../config/env.js";
import { airtelService } from "./airtel.service.js";
import { mockMobileMoneyService } from "./mockMobileMoneyService.js";
import { mtnService } from "./mtn.service.js";

function isLiveConfigured() {
  return Boolean(
    (env.mtnApiUserId &&
      env.mtnApiKey &&
      env.mtnCollectionSubscriptionKey &&
      env.mtnDisbursementSubscriptionKey &&
      env.mtnCollectionUrl &&
      env.mtnVerificationUrl &&
      env.mtnDisbursementUrl) ||
      (env.airtelEnabled &&
        env.airtelApiKey &&
        env.airtelApiSecret &&
        env.airtelCollectionUrl &&
        env.airtelVerificationUrl &&
        env.airtelDisbursementUrl)
  );
}

function resolveDefaultService() {
  const mode = String(env.mobileMoneyMode || "mock").trim().toLowerCase();

  if (mode === "mock") {
    return mockMobileMoneyService;
  }

  if (["sandbox", "provider", "live"].includes(mode) || (mode === "auto" && isLiveConfigured())) {
    return String(env.mobileMoneyDefaultProvider || "mtn").trim().toLowerCase() === "airtel"
      ? airtelService
      : mtnService;
  }

  return mockMobileMoneyService;
}

function resolveProviderService(provider) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const mode = String(env.mobileMoneyMode || "mock").trim().toLowerCase();

  if (mode === "mock") {
    return mockMobileMoneyService;
  }

  if (normalizedProvider === "airtel_money") {
    if (!env.airtelEnabled) {
      throw Object.assign(new Error("Airtel Money is currently disabled."), { statusCode: 503 });
    }
    return airtelService;
  }
  if (normalizedProvider === "mtn_mobile_money") return mtnService;

  return resolveDefaultService();
}

export function getMobileMoneyService(provider) {
  const service = provider ? resolveProviderService(provider) : resolveDefaultService();

  return {
    providerKey: service.providerKey,
    initiateCollection(input) {
      return resolveProviderService(input?.provider || provider || service.providerKey).initiateCollection(input);
    },
    verifyTransaction(input) {
      return resolveProviderService(input?.provider || provider || service.providerKey).verifyTransaction(input);
    },
    verifyDisbursement(input) {
      return resolveProviderService(input?.provider || provider || service.providerKey).verifyDisbursement(input);
    },
    disburseFunds(input) {
      return resolveProviderService(input?.provider || provider || service.providerKey).disburseFunds(input);
    },
  };
}
