import { env } from "../config/env.js";
import { getMobileMoneyProviderLabel, normalizePhoneNumber } from "./paymentService.js";
import { logProviderRequest, logProviderResponse } from "./providerLoggingService.js";

function validatePhone(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("A valid phone number is required for mobile money.");
  }
  return normalizedPhone;
}

function buildHeaders() {
  return {
    Authorization: `Bearer ${env.airtelApiKey}`,
    "X-API-SECRET": env.airtelApiSecret,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function getEndpoint(operation) {
  if (operation === "collection") return env.airtelCollectionUrl;
  if (operation === "verification") return env.airtelVerificationUrl;
  return env.airtelDisbursementUrl;
}

async function postJson(endpoint, requestPayload, operation) {
  logProviderRequest({
    provider: "airtel_money",
    operation,
    endpoint,
    credentials: {
      apiKey: env.airtelApiKey,
      apiSecret: env.airtelApiSecret,
    },
    request: requestPayload,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(requestPayload),
  });
  const data = await response.json().catch(() => ({}));

  logProviderResponse({
    provider: "airtel_money",
    operation,
    endpoint,
    statusCode: response.status,
    response: data,
  });

  return { response, data };
}

export const airtelService = {
  providerKey: "airtel_money",
  async initiateCollection({ amount, phoneNumber, reference, description, callbackUrl }) {
    const normalizedPhone = validatePhone(phoneNumber);
    const requestPayload = {
      provider: "airtel_money",
      amount,
      currency: "UGX",
      phone_number: normalizedPhone,
      reference,
      description,
      callback_url: callbackUrl || `${env.appPublicUrl}/api/payments/webhooks/airtel`,
    };
    const { response, data } = await postJson(getEndpoint("collection"), requestPayload, "collection");

    if (!response.ok) {
      throw new Error(data?.message || "Could not start Airtel Money payment.");
    }

    return {
      provider: "airtel_money",
      status: String(data?.status || "initiated").toLowerCase(),
      providerReference: data?.provider_reference || data?.reference || reference,
      paymentUrl: data?.payment_url || "",
      instructions:
        data?.instructions ||
        `Approve the ${getMobileMoneyProviderLabel("airtel_money")} payment prompt on ${normalizedPhone}.`,
      rawResponse: data,
    };
  },
  async verifyTransaction({ providerReference, reference, amount }) {
    const requestPayload = {
      provider: "airtel_money",
      provider_reference: providerReference,
      reference,
    };
    const { response, data } = await postJson(getEndpoint("verification"), requestPayload, "verification");
    const paidAmount = Number(data?.amount || 0);
    const status = String(data?.status || "").toLowerCase();
    const success =
      response.ok &&
      ["success", "successful", "completed", "paid"].includes(status) &&
      paidAmount >= Number(amount || 0);

    return {
      success,
      status: success ? "successful" : status || "pending",
      providerReference: data?.provider_reference || providerReference || reference,
      amount: paidAmount,
      rawResponse: data,
    };
  },
  async disburseFunds({ amount, phoneNumber, reference }) {
    const normalizedPhone = validatePhone(phoneNumber);
    const requestPayload = {
      provider: "airtel_money",
      amount,
      currency: "UGX",
      phone_number: normalizedPhone,
      reference,
    };
    const { response, data } = await postJson(getEndpoint("disbursement"), requestPayload, "disbursement");

    if (!response.ok) {
      return {
        status: "failed",
        providerReference: "",
        rawResponse: data,
      };
    }

    return {
      status: String(data?.status || "pending").toLowerCase(),
      providerReference: data?.provider_reference || reference,
      rawResponse: data,
    };
  },
  async verifyDisbursement({ providerReference, reference, amount }) {
    const requestPayload = {
      provider: "airtel_money",
      provider_reference: providerReference,
      reference,
    };
    const { response, data } = await postJson(getEndpoint("verification"), requestPayload, "disbursement_verification");
    const paidAmount = Number(data?.amount || 0);
    const status = String(data?.status || "").toLowerCase();
    const success =
      response.ok &&
      ["success", "successful", "completed", "paid"].includes(status) &&
      paidAmount >= Number(amount || 0);

    return {
      success,
      status: success ? "successful" : ["failed", "rejected", "expired"].includes(status) ? "failed" : status || "pending",
      providerReference: data?.provider_reference || providerReference || reference,
      amount: paidAmount,
      rawResponse: data,
    };
  },
};
