import crypto from "crypto";
import { env } from "../config/env.js";
import { normalizeUgandaPhoneNumber } from "./paymentService.js";
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

  if (!hasMomoCollectionCredentials() && !usesConsumerCredentials()) {
    if (!env.mtnApiUserId) missing.push("MTN_API_USER or MTN_API_USER_ID");
    if (!env.mtnApiKey) missing.push("MTN_API_KEY");
    if (!env.mtnCollectionSubscriptionKey) {
      missing.push("MTN_SUBSCRIPTION_KEY, MTN_COLLECTION_PRIMARY_KEY, or MTN_COLLECTION_SECONDARY_KEY");
    }
  }

  if (missing.length) {
    throw httpError(500, `MTN Mobile Money is not fully configured: ${missing.join(", ")}`);
  }
}

function validatePhone(phoneNumber) {
  const normalizedPhone = normalizeUgandaPhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw httpError(400, "Enter a valid Uganda phone number, for example 0772123456 or +256772123456.");
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

function buildOAuthTokenUrl() {
  const endpoint = new URL(env.mtnOAuthTokenUrl);
  endpoint.searchParams.set("grant_type", "client_credentials");
  return endpoint.toString();
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

function usesConsumerCredentials() {
  return Boolean(env.mtnConsumerKey && env.mtnConsumerSecret);
}

function hasMomoCollectionCredentials() {
  return Boolean(env.mtnApiUserId && env.mtnApiKey && env.mtnCollectionSubscriptionKey);
}

function hasMomoDisbursementCredentials() {
  return Boolean(env.mtnApiUserId && env.mtnApiKey && env.mtnDisbursementSubscriptionKey);
}

function buildCallbackUrl(callbackUrl) {
  const rawUrl = String(callbackUrl || env.mobileMoneyCallbackUrl || "").trim();
  if (!rawUrl) return "";

  const url = new URL(rawUrl);
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

async function requestForm({ endpoint, method = "POST", operation, headers = {}, form }) {
  logProviderRequest({
    provider: MTN_PROVIDER,
    operation,
    endpoint,
    credentials: {
      consumerKey: env.mtnConsumerKey,
      consumerSecret: env.mtnConsumerSecret,
    },
    request: { grant_type: form?.get("grant_type") || "client_credentials" },
  });

  const response = await fetch(endpoint, {
    method,
    headers,
    body: form,
  });
  const data = await readJson(response);

  logProviderResponse({
    provider: MTN_PROVIDER,
    operation,
    endpoint,
    statusCode: response.status,
    response: {
      success: response.ok,
      token_type: data?.token_type,
      expires_in: data?.expires_in,
      message: data?.message || data?.error_description || data?.error,
    },
  });

  return { response, data };
}

function sanitizedProviderMessage(data = {}) {
  return String(
    data?.message ||
      data?.error_description ||
      data?.error ||
      data?.reason ||
      data?.code ||
      ""
  ).slice(0, 220);
}

function inferLikelyCause({ statusCode, message = "", endpoint = "", flow = "" } = {}) {
  const normalizedMessage = String(message || "").toLowerCase();
  const normalizedEndpoint = String(endpoint || "").toLowerCase();

  if (!statusCode) return "token endpoint was not reached";
  if (normalizedMessage.includes("product") || normalizedMessage.includes("subscribe") || normalizedMessage.includes("not enabled")) {
    return "product not enabled or missing Collections subscription";
  }
  if (normalizedMessage.includes("invalid_client") || normalizedMessage.includes("client") || normalizedMessage.includes("credential")) {
    return "wrong credentials or wrong auth format";
  }
  if ([401, 403].includes(Number(statusCode || 0))) {
    if (flow === "oauth" && normalizedEndpoint.includes("/v1/oauth/access_token")) {
      return "wrong Consumer Key/Secret, app not approved for OAuth product, or Mobile Money Collections not enabled";
    }
    return "wrong auth format, missing subscription key, or product not enabled";
  }
  if ([404, 405].includes(Number(statusCode || 0))) return "wrong endpoint";
  return "MTN returned an unsuccessful token response";
}

async function requestOAuthAccessToken({ useBasicAuth = false } = {}) {
  const form = new URLSearchParams();
  form.set("grant_type", "client_credentials");

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (useBasicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${env.mtnConsumerKey}:${env.mtnConsumerSecret}`).toString("base64")}`;
  } else {
    form.set("client_id", env.mtnConsumerKey);
    form.set("client_secret", env.mtnConsumerSecret);
  }

  const { response, data } = await requestForm({
    endpoint: buildOAuthTokenUrl(),
    operation: useBasicAuth ? "oauth_token_basic_auth" : "oauth_token_form_credentials",
    headers,
    form,
  });

  if (!response.ok || !data?.access_token) {
    const message = sanitizedProviderMessage(data) || "Unable to generate MTN OAuth access token.";
    throw httpError(response.status || 502, "MTN authentication failed.", {
      providerResponse: {
        status: response.status,
        message,
      },
      diagnostic: {
        flow: "oauth",
        endpoint: buildOAuthTokenUrl(),
        statusCode: response.status,
        tokenEndpointReached: true,
        sanitizedError: message,
      },
    });
  }

  return data.access_token;
}

async function getMomoAccessToken(scope) {
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
    const message = sanitizedProviderMessage(data) || `Could not get MTN ${scope} access token.`;
    throw httpError(response.status || 502, message, {
      providerResponse: data,
      diagnostic: {
        flow: "momo",
        endpoint,
        statusCode: response.status,
        tokenEndpointReached: true,
        sanitizedError: message,
      },
    });
  }

  return data.access_token;
}

async function getAccessToken(scope) {
  ensureConfigured();

  if (scope === "collection" && hasMomoCollectionCredentials()) {
    return getMomoAccessToken(scope);
  }

  if (scope === "disbursement" && hasMomoDisbursementCredentials()) {
    return getMomoAccessToken(scope);
  }

  if (usesConsumerCredentials()) {
    return requestOAuthAccessToken();
  }

  throw httpError(500, "MTN Mobile Money is not fully configured.");
}

async function getAuthHealth() {
  const credentialsLoaded = usesConsumerCredentials() || hasMomoCollectionCredentials();
  const callbackConfigured = Boolean(env.mtnCallbackUrl || env.mobileMoneyCallbackUrl);

  if (!credentialsLoaded) {
    return {
      credentialsLoaded: false,
      callbackConfigured,
      authStatus: "not_tested",
      statusCode: undefined,
      sanitizedError: "No complete MTN credential set was loaded.",
    };
  }

  const preferredFlow = hasMomoCollectionCredentials() ? "momo" : "oauth";

  try {
    if (preferredFlow === "momo") {
      await getMomoAccessToken("collection");
    } else {
      await requestOAuthAccessToken({ useBasicAuth: false });
    }

    return {
      credentialsLoaded: true,
      callbackConfigured,
      authStatus: "success",
      statusCode: 200,
      sanitizedError: undefined,
    };
  } catch (error) {
    let statusCode = error?.diagnostic?.statusCode || error.statusCode || 502;
    let sanitizedError = error?.diagnostic?.sanitizedError || error.message || "MTN authentication failed.";

    if (
      preferredFlow === "oauth" &&
      [400, 401, 403].includes(Number(statusCode || 0)) &&
      usesConsumerCredentials()
    ) {
      try {
        await requestOAuthAccessToken({ useBasicAuth: true });
        return {
          credentialsLoaded: true,
          callbackConfigured,
          authStatus: "success",
          statusCode: 200,
          sanitizedError: undefined,
        };
      } catch (basicError) {
        statusCode = basicError?.diagnostic?.statusCode || basicError.statusCode || statusCode;
        sanitizedError = basicError?.diagnostic?.sanitizedError || sanitizedError;
      }
    }

    const likelyCause = inferLikelyCause({
      statusCode,
      message: sanitizedError,
      endpoint: error?.diagnostic?.endpoint || env.mtnOAuthTokenUrl,
      flow: preferredFlow,
    });

    if ([401, 403].includes(Number(statusCode || 0)) || String(sanitizedError).toLowerCase().includes("product")) {
      console.warn(
        "MTN authentication is configured, but Mobile Money Collections may not be enabled for this app. Contact MTN or enable/subscribe to Collections/MoMo product in the developer portal."
      );
    }

    return {
      credentialsLoaded: true,
      callbackConfigured,
      authStatus: "failed",
      statusCode,
      sanitizedError: `${sanitizedError} Likely cause: ${likelyCause}.`,
    };
  }
}

function buildAuthorizedHeaders({ accessToken, referenceId = "", callbackUrl = "", subscriptionKey }) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "X-Target-Environment": env.mtnTargetEnvironment,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (subscriptionKey) headers["Ocp-Apim-Subscription-Key"] = subscriptionKey;
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

  async checkAuthentication() {
    const health = await getAuthHealth();
    return {
      success: health.authStatus === "success",
      statusCode: health.statusCode,
      message:
        health.authStatus === "success"
          ? "MTN authentication succeeded."
          : health.sanitizedError || "MTN authentication failed.",
    };
  },

  async getHealth() {
    return getAuthHealth();
  },

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
      const providerMessage = data?.message || data?.error_description || data?.error || "";
      const unauthorized = [401, 403].includes(response.status);
      throw httpError(
        response.status || 502,
        unauthorized
          ? "MTN Mobile Money Collections may not be enabled for this app yet."
          : providerMessage || "Could not start MTN Mobile Money payment.",
        {
        providerResponse: data,
        }
      );
    }

    return {
      provider: MTN_PROVIDER,
      status: "initiated",
      providerReference,
      paymentUrl: "",
      instructions: "Payment request sent. Please approve the prompt on your phone.",
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
