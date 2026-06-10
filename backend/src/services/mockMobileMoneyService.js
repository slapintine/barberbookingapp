import { getMobileMoneyProviderLabel, normalizePhoneNumber } from "./paymentService.js";
import { logProviderRequest, logProviderResponse } from "./providerLoggingService.js";

function makeMockProviderReference(reference) {
  return `mock-${reference}-${Math.random().toString(36).slice(2, 8)}`;
}

function validateProvider(provider, phoneNumber) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!["mtn_mobile_money", "airtel_money"].includes(normalizedProvider)) {
    throw new Error("Unsupported mobile money provider.");
  }

  if (!normalizedPhone) {
    throw new Error("A valid phone number is required for mobile money.");
  }

  return {
    normalizedProvider,
    normalizedPhone,
  };
}

export const mockMobileMoneyService = {
  providerKey: "mock",
  async initiateCollection({ provider, amount, phoneNumber, reference, description }) {
    const { normalizedProvider, normalizedPhone } = validateProvider(provider, phoneNumber);
    const requestPayload = {
      provider: normalizedProvider,
      amount,
      currency: "UGX",
      phone_number: normalizedPhone,
      reference,
      description,
    };
    const responsePayload = {
      provider: normalizedProvider,
      status: "initiated",
      providerReference: makeMockProviderReference(reference),
      paymentUrl: "",
      instructions: `Approve the ${getMobileMoneyProviderLabel(normalizedProvider)} payment prompt on ${normalizedPhone}.`,
      rawResponse: {
        mock: true,
        request: requestPayload,
      },
    };

    logProviderRequest({ provider: normalizedProvider, operation: "collection", endpoint: "mock://collection", request: requestPayload });
    logProviderResponse({ provider: normalizedProvider, operation: "collection", endpoint: "mock://collection", statusCode: 200, response: responsePayload });
    return responsePayload;
  },
  async verifyTransaction({ providerReference, reference, amount }) {
    const requestPayload = {
      provider_reference: providerReference,
      reference,
      expected_amount: amount,
    };
    const responsePayload = {
      success: true,
      status: "successful",
      providerReference: providerReference || reference,
      amount: Number(amount || 0),
      currency: "UGX",
      rawResponse: {
        mock: true,
        request: requestPayload,
      },
    };

    logProviderRequest({ provider: "mock", operation: "verification", endpoint: "mock://verification", request: requestPayload });
    logProviderResponse({ provider: "mock", operation: "verification", endpoint: "mock://verification", statusCode: 200, response: responsePayload });
    return responsePayload;
  },
  async disburseFunds({ provider, amount, phoneNumber, reference }) {
    const { normalizedProvider, normalizedPhone } = validateProvider(provider, phoneNumber);
    const requestPayload = {
      provider: normalizedProvider,
      amount,
      currency: "UGX",
      phone_number: normalizedPhone,
      reference,
    };
    const responsePayload = {
      status: "successful",
      providerReference: makeMockProviderReference(reference),
      rawResponse: {
        mock: true,
        request: requestPayload,
      },
    };

    logProviderRequest({ provider: normalizedProvider, operation: "disbursement", endpoint: "mock://disbursement", request: requestPayload });
    logProviderResponse({ provider: normalizedProvider, operation: "disbursement", endpoint: "mock://disbursement", statusCode: 200, response: responsePayload });
    return responsePayload;
  },
  async verifyDisbursement({ providerReference, reference, amount }) {
    const requestPayload = {
      provider_reference: providerReference,
      reference,
      expected_amount: amount,
    };
    const responsePayload = {
      success: true,
      status: "successful",
      providerReference: providerReference || reference,
      amount: Number(amount || 0),
      currency: "UGX",
      rawResponse: {
        mock: true,
        request: requestPayload,
      },
    };

    logProviderRequest({ provider: "mock", operation: "disbursement_verification", endpoint: "mock://disbursement-verification", request: requestPayload });
    logProviderResponse({ provider: "mock", operation: "disbursement_verification", endpoint: "mock://disbursement-verification", statusCode: 200, response: responsePayload });
    return responsePayload;
  },
};
