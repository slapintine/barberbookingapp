import { env } from "../config/env.js";

function getPesapalBaseUrl() {
  const baseUrl = env.pesapalBaseUrl ||
    (env.pesapalEnvironment === "live"
    ? "https://pay.pesapal.com/v3"
    : "https://cybqa.pesapal.com/pesapalv3");

  return baseUrl.replace(/\/api$/i, "");
}

async function requestPesapalToken() {
  if (!env.pesapalConsumerKey || !env.pesapalConsumerSecret) {
    throw new Error("PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET are required.");
  }

  const response = await fetch(`${getPesapalBaseUrl()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      consumer_key: env.pesapalConsumerKey,
      consumer_secret: env.pesapalConsumerSecret,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.token) {
    throw new Error(
      data?.message ||
      data?.error?.message ||
      `Could not authenticate with Pesapal. HTTP ${response.status}. Check that your consumer key/secret match ${getPesapalBaseUrl()}.`
    );
  }

  return data.token;
}

async function getRegisteredIpns(token) {
  const response = await fetch(`${getPesapalBaseUrl()}/api/URLSetup/GetIpnList`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || "Could not list Pesapal IPNs.");
  }

  return Array.isArray(data) ? data : [];
}

async function registerIpn(token, url) {
  const response = await fetch(`${getPesapalBaseUrl()}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url,
      ipn_notification_type: "POST",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ipn_id) {
    throw new Error(data?.message || data?.error?.message || "Could not register Pesapal IPN.");
  }

  return data;
}

export async function ensurePesapalIpn(url) {
  if (!url || !/^https:\/\//i.test(url)) {
    throw new Error("A public HTTPS IPN URL is required.");
  }

  const token = await requestPesapalToken();
  const existingIpns = await getRegisteredIpns(token);
  const existing = existingIpns.find((item) => String(item.url || "").trim() === url);

  if (existing?.ipn_id) {
    return {
      created: false,
      ipn: existing,
    };
  }

  return {
    created: true,
    ipn: await registerIpn(token, url),
  };
}
