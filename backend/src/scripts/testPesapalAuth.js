import { env } from "../config/env.js";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "").replace(/\/api$/i, "");
}

function getBaseUrlsToTry() {
  const configured = normalizeBaseUrl(env.pesapalBaseUrl);
  const urls = configured ? [configured] : [];

  for (const url of [
    "https://cybqa.pesapal.com/pesapalv3",
    "https://pay.pesapal.com/v3",
  ]) {
    if (!urls.includes(url)) urls.push(url);
  }

  return urls;
}

function mask(value = "") {
  const text = String(value || "");
  if (text.length <= 8) return `${text.length} chars`;
  return `${text.slice(0, 4)}...${text.slice(-4)} (${text.length} chars)`;
}

async function tryAuth(baseUrl) {
  const response = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
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
  return {
    baseUrl,
    ok: response.ok && Boolean(data?.token),
    status: response.status,
    message: data?.message || data?.error?.message || "",
    tokenPreview: data?.token ? mask(data.token) : "",
  };
}

console.log(JSON.stringify({
  configuredBaseUrl: normalizeBaseUrl(env.pesapalBaseUrl) || "(default)",
  pesapalEnvironment: env.pesapalEnvironment,
  keyPreview: mask(env.pesapalConsumerKey),
  secretPreview: mask(env.pesapalConsumerSecret),
}, null, 2));

for (const baseUrl of getBaseUrlsToTry()) {
  try {
    const result = await tryAuth(baseUrl);
    console.log(JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log(`\nPesapal auth works with: ${baseUrl}`);
      process.exit(0);
    }
  } catch (error) {
    console.log(JSON.stringify({
      baseUrl,
      ok: false,
      message: error.message || "Network error",
    }, null, 2));
  }
}

process.exitCode = 1;
