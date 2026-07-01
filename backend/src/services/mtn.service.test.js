import assert from "node:assert/strict";
import test from "node:test";

test("consumer credentials win for Collections when both MTN credential sets exist", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  const requestedEndpoints = [];

  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      MOBILE_MONEY_MODE: "provider",
      MTN_CONSUMER_KEY: "consumer-key",
      MTN_CONSUMER_SECRET: "consumer-secret",
      MTN_API_USER_ID: "api-user-id",
      MTN_API_KEY: "api-key",
      MTN_COLLECTION_SUBSCRIPTION_KEY: "subscription-key",
      MTN_BASE_URL: "https://example.test",
      MTN_OAUTH_TOKEN_URL: "https://example.test/v1/oauth/access_token",
      MTN_CALLBACK_URL: "https://queless.org/api/payments/mtn/callback",
    });

    globalThis.fetch = async (endpoint) => {
      requestedEndpoints.push(String(endpoint));
      return new Response(JSON.stringify({ access_token: "test-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const { mtnService } = await import(`./mtn.service.js?consumer-preference=${Date.now()}`);
    const health = await mtnService.getHealth();

    assert.equal(health.authFlow, "oauth_consumer");
    assert.equal(health.authStatus, "success");
    assert.deepEqual(requestedEndpoints, ["https://example.test/v1/oauth/access_token?grant_type=client_credentials"]);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
});
