import crypto from "crypto";
import { env } from "../config/env.js";
import { getMobileMoneyProviderLabel, normalizePhoneNumber } from "./paymentService.js";
import { logProviderRequest, logProviderResponse } from "./providerLoggingService.js";

const MTN_PROVIDER = "mtn_mobile_money";

function httpError(statusCode, message, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function ensureConfigured() {
  const missing = [];

  if (!env.mtnApiUserId) missing.push("MTN_API_USER_ID");
  if (!env.mtnApiKey) missing.push("MTN_API_KEY");
  if (!env.mtnCollectionSubscriptionKey) missing.push("MTN_COLLECTION_SUBSCRIPTION_KEY or MTN_SUBSCRIPTION_KEY");
  if (!env.mtnDisbursementSubscriptionKey) missing.push("MTN_DISBURSEMENT_SUBSCRIPTION_KEY or MTN_SUBSCRIPTION_KEY");

  if (missing.length) {
    throw httpError(500, `MTN Mobile Money is not fully configured: ${missing.join(", ")}`);
  }
}

function validatePhone(phoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw httpError(400, "A valid phone number is required for mobile money.");
  }
  return normalizedPhone;
}

function toIsoPhone(phoneNumber) {
  return validatePhone(phoneNumber).replace(/^\+/, "");
}

function toAmount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw httpError(400, "Amount must be greater than 0.");
  }
  return numeric.toFixed(2);
}

function buildCollectionTokenUrl() {
  return `${env.mtnBaseUrl}/collection/token/`;
}

function buildDisbursementTokenUrl() {
  return `${env.mtnBaseUrl}/disbursement/token/`;
}

function buildProvisioningApiUserUrl() {
  return `${env.mtnBaseUrl}/v1_0/apiuser`;
}

function buildProvisioningApiKeyUrl(apiUserId) {
  return `${env.mtnBaseUrl}/v1_0/apiuser/${apiUserId}/apikey`;
}

function buildCollectionStatusUrl(referenceId) {
  return `${env.mtnVerificationUrl.replace(/\/$/, "")}/${referenceId}`;
}

function buildDisbursementStatusUrl(referenceId) {
  return `${env.mtnDisbursementUrl.replace(/\/$/, "")}/${referenceId}`;
}

function basicAuthValue() {
  return Buffer.from(`${env.mtnApiUserId}:${env.mtnApiKey}`).toString("base64");
}

function buildCallbackUrl(callbackUrl) {
  const rawUrl = String(callbackUrl || env.mobileMoneyCallbackUrl || "").trim();
  if (!rawUrl) return "";

  const url = new URL(rawUrl);
  if (env.mobileMoneyWebhookToken && !url.searchParams.has("token")) {
    url.searchParams.set("token", env.mobileMoneyWebhookToken);
  }
  return url.toString();
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function requestJson({ endpoint, method = "GET", operation, headers = {}, body }) {
  logProviderRequest({
    provider: MTN_PROVIDER,
    operation,
    endpoint,
    credentials: {
      apiUserId: env.mtnApiUserId,
      apiKey: env.mtnApiKey,
      collectionSubscriptionKey: env.mtnCollectionSubscriptionKey,
      disbursementSubscriptionKey: env.mtnDisbursementSubscriptionKey,
    },
    request: body || {},
  });

  const response = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await readJson(response);

  logProviderResponse({
    provider: MTN_PROVIDER,
    operation,
    endpoint,
    statusCode: response.status,
    response: data,
  });

  return { response, data };
}

async function getAccessToken(scope) {
  ensureConfigured();

  const isCollection = scope === "collection";
  const endpoint = isCollection ? buildCollectionTokenUrl() : buildDisbursementTokenUrl();
  const subscriptionKey = isCollection ? env.mtnCollectionSubscriptionKey : env.mtnDisbursementSubscriptionKey;

  const { response, data } = await requestJson({
    endpoint,
    method: "POST",
    operation: `${scope}_token`,
    headers: {
      Authorization: `Basic ${basicAuthValue()}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
  });

  if (!response.ok || !data?.access_token) {
    throw httpError(response.status || 502, data?.message || `Could not get MTN ${scope} access token.`, {
      providerResponse: data,
    });
  }

  return data.access_token;
}

function buildAuthorizedHeaders({ accessToken, referenceId = "", callbackUrl = "", subscriptionKey }) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "X-Target-Environment": env.mtnTargetEnvironment,
    "Ocp-Apim-Subscription-Key": subscriptionKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (referenceId) headers["X-Reference-Id"] = referenceId;
  if (callbackUrl) headers["X-Callback-Url"] = callbackUrl;

  return headers;
}

function parseCollectionStatus(data = {}) {
  return String(
    data?.status || data?.financialTransactionStatus || data?.reason?.code || "pending"
  ).trim().toLowerCase();
}

function parseDisbursementStatus(data = {}) {
  return String(
    data?.status || data?.financialTransactionStatus || data?.reason?.code || "pending"
  ).trim().toLowerCase();
}

function isSuccessfulStatus(status) {
  return ["successful", "success", "completed", "paid"].includes(String(status || "").toLowerCase());
}

function isFailedStatus(status) {
  return ["failed", "rejected", "expired", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

export const mtnService = {
  providerKey: MTN_PROVIDER,

  async createApiUser({ providerCallbackHost } = {}) {
    const apiUserId = crypto.randomUUID();
    const callbackHost = String(providerCallbackHost || env.mobileMoneyCallbackUrl || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0];

    if (!callbackHost) {
      throw httpError(400, "providerCallbackHost is required to create an MTN API user.");
    }

    if (!env.mtnProvisioningSubscriptionKey) {
      throw httpError(500, "MTN_PROVISIONING_SUBSCRIPTION_KEY is required to create an MTN API user.");
    }

    const { response, data } = await requestJson({
      endpoint: buildProvisioningApiUserUrl(),
      method: "POST",
      operation: "create_api_user",
      headers: {
        "X-Reference-Id": apiUserId,
        "Ocp-Apim-Subscription-Key": env.mtnProvisioningSubscriptionKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        providerCallbackHost: callbackHost,
      },
    });

    if (![201, 202].includes(response.status)) {
      throw httpError(response.status || 502, data?.message || "Could not create MTN API user.", {
        providerResponse: data,
      });
    }

    return {
      apiUserId,
      rawResponse: data,
    };
  },

  async createApiKey({ apiUserId } = {}) {
    const resolvedApiUserId = String(apiUserId || env.mtnApiUserId || "").trim();

    if (!resolvedApiUserId) {
      throw httpError(400, "apiUserId is required to create an MTN API key.");
    }

    if (!env.mtnProvisioningSubscriptionKey) {
      throw httpError(500, "MTN_PROVISIONING_SUBSCRIPTION_KEY is required to create an MTN API key.");
    }

    const { response, data } = await requestJson({
      endpoint: buildProvisioningApiKeyUrl(resolvedApiUserId),
      method: "POST",
      operation: "create_api_key",
      headers: {
        "Ocp-Apim-Subscription-Key": env.mtnProvisioningSubscriptionKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {},
    });

    if (!response.ok || !data?.apiKey) {
      throw httpError(response.status || 502, data?.message || "Could not create MTN API key.", {
        providerResponse: data,
      });
    }

    return {
      apiUserId: resolvedApiUserId,
      apiKey: data.apiKey,
      rawResponse: data,
    };
  },

  async initiateCollection({ amount, phoneNumber, reference, description, callbackUrl }) {
    ensureConfigured();

    const providerReference = crypto.randomUUID();
    const normalizedPhone = toIsoPhone(phoneNumber);
    const accessToken = await getAccessToken("collection");
    const requestPayload = {
      amount: toAmount(amount),
      currency: env.mtnCurrency,
      externalId: String(reference || providerReference),
      payer: {
        partyIdType: "MSISDN",
        partyId: normalizedPhone,
      },
      payerMessage: String(description || "Booking payment").slice(0, 160),
      payeeNote: String(reference || "barber-booking-payment").slice(0, 160),
    };

    const { response, data } = await requestJson({
      endpoint: env.mtnCollectionUrl,
      method: "POST",
      operation: "collection",
      headers: buildAuthorizedHeaders({
        accessToken,
        referenceId: providerReference,
        callbackUrl: buildCallbackUrl(callbackUrl || env.mobileMoneyCallbackUrl),
        subscriptionKey: env.mtnCollectionSubscriptionKey,
      }),
      body: requestPayload,
    });

    if (response.status !== 202) {
      throw httpError(response.status || 502, data?.message || "Could not start MTN Mobile Money payment.", {
        providerResponse: data,
      });
    }

    return {
      provider: MTN_PROVIDER,
      status: "initiated",
      providerReference,
      paymentUrl: "",
      instructions: `Approve the ${getMobileMoneyProviderLabel(MTN_PROVIDER)} payment prompt on ${validatePhone(phoneNumber)}.`,
      rawResponse: {
        ...data,
        requestToPayAccepted: true,
        requestReferenceId: providerReference,
        externalId: requestPayload.externalId,
      },
    };
  },

  async verifyTransaction({ providerReference, reference, amount }) {
    ensureConfigured();

    const resolvedReference = String(providerReference || "").trim();
    if (!resolvedReference) {
      throw httpError(400, "providerReference is required to verify an MTN collection.");
    }

    const accessToken = await getAccessToken("collection");
    const { response, data } = await requestJson({
      endpoint: buildCollectionStatusUrl(resolvedReference),
      method: "GET",
      operation: "collection_verification",
      headers: buildAuthorizedHeaders({
        accessToken,
        subscriptionKey: env.mtnCollectionSubscriptionKey,
      }),
    });

    const paidAmount = Number(data?.amount || 0);
    const status = parseCollectionStatus(data);
    const success = response.ok && isSuccessfulStatus(status) && paidAmount >= Number(amount || 0);

    return {
      success,
      status: success ? "successful" : isFailedStatus(status) ? "failed" : status || "pending",
      providerReference: resolvedReference,
      reference: data?.externalId || reference || "",
      amount: paidAmount,
      currency: data?.currency || env.mtnCurrency,
      rawResponse: data,
    };
  },

  async disburseFunds({ amount, phoneNumber, reference }) {
    ensureConfigured();

    const providerReference = crypto.randomUUID();
    const normalizedPhone = toIsoPhone(phoneNumber);
    const accessToken = await getAccessToken("disbursement");
    const requestPayload = {
      amount: toAmount(amount),
      currency: env.mtnCurrency,
      externalId: String(reference || providerReference),
      payee: {
        partyIdType: "MSISDN",
        partyId: normalizedPhone,
      },
      payerMessage: "Barber payout",
      payeeNote: String(reference || "barber-payout").slice(0, 160),
    };

    const { response, data } = await requestJson({
      endpoint: env.mtnDisbursementUrl,
      method: "POST",
      operation: "disbursement",
      headers: buildAuthorizedHeaders({
        accessToken,
        referenceId: providerReference,
        callbackUrl: buildCallbackUrl(env.mobileMoneyCallbackUrl),
        subscriptionKey: env.mtnDisbursementSubscriptionKey,
      }),
      body: requestPayload,
    });

    if (response.status !== 202) {
      return {
        status: "failed",
        providerReference,
        rawResponse: data,
      };
    }

    return {
      status: "pending",
      providerReference,
      rawResponse: {
        ...data,
        transferAccepted: true,
        requestReferenceId: providerReference,
        externalId: requestPayload.externalId,
      },
    };
  },

  async verifyDisbursement({ providerReference, reference, amount }) {
    ensureConfigured();

    const resolvedReference = String(providerReference || "").trim();
    if (!resolvedReference) {
      throw httpError(400, "providerReference is required to verify an MTN disbursement.");
    }

    const accessToken = await getAccessToken("disbursement");
    const { response, data } = await requestJson({
      endpoint: buildDisbursementStatusUrl(resolvedReference),
      method: "GET",
      operation: "disbursement_verification",
      headers: buildAuthorizedHeaders({
        accessToken,
        subscriptionKey: env.mtnDisbursementSubscriptionKey,
      }),
    });

    const settledAmount = Number(data?.amount || 0);
    const status = parseDisbursementStatus(data);
    const success = response.ok && isSuccessfulStatus(status) && settledAmount >= Number(amount || 0);

    return {
      success,
      status: success ? "successful" : isFailedStatus(status) ? "failed" : status || "pending",
      providerReference: resolvedReference,
      reference: data?.externalId || reference || "",
      amount: settledAmount,
      currency: data?.currency || env.mtnCurrency,
      rawResponse: data,
    };
  },
};
