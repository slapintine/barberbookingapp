import assert from "node:assert/strict";
import test from "node:test";
import {
  generateProviderCoachAnswer,
} from "./providerCoachChatService.js";

const context = {
  stand: {
    name: "Kampala Beauty Studio",
    category: "Beauty",
    description: "Event beauty services.",
    location: "Kampala",
    plan: "free",
    missingFields: ["opening hours", "at least three trust-building photos"],
  },
  services: [{
    name: "Event makeup",
    description: "Professional event makeup.",
    price: "UGX 85,000",
    available: true,
  }],
  signals: {
    bookingsAvailable: false,
    totalBookings: 0,
    reviewsAvailable: false,
    reviewCount: 0,
  },
};

test("Gemini with a missing API key falls back to rule_based", async () => {
  let fetchCalled = false;
  const result = await generateProviderCoachAnswer({
    message: "Why am I not getting bookings?",
    history: [],
    context,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("should not call");
    },
    config: {
      provider: "gemini",
      geminiApiKey: "",
      openAiApiKey: "",
    },
  });

  assert.equal(fetchCalled, false);
  assert.equal(result.provider, "rule_based");
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, "missing_gemini_key");
  assert.match(result.answer, /does not have enough booking history/i);
  assert.equal(result.topic, "bookings_help");
  assert.ok(result.nextBestAction);
});

test("Gemini quota or API failure falls back to rule_based", async () => {
  const result = await generateProviderCoachAnswer({
    message: "Is my pricing okay?",
    history: [],
    context,
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "quota exhausted" } }),
    }),
    config: {
      provider: "gemini",
      geminiApiKey: "test-gemini-key",
    },
  });

  assert.equal(result.provider, "rule_based");
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, "gemini_quota_or_rate_limit");
  assert.match(result.answer, /price/i);
});

test("an invalid AI_PROVIDER falls back to rule_based", async () => {
  const result = await generateProviderCoachAnswer({
    message: "How can customers trust my stand?",
    history: [],
    context,
    config: {
      provider: "unexpected-provider",
      geminiApiKey: "unused",
      openAiApiKey: "unused",
    },
  });

  assert.equal(result.provider, "rule_based");
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, "invalid_ai_provider");
  assert.match(result.answer, /trust/i);
});

test("Provider Coach works with no OpenAI key", async () => {
  const result = await generateProviderCoachAnswer({
    message: "Improve my stand description",
    history: [],
    context,
    config: {
      provider: "gemini",
      geminiApiKey: "",
      openAiApiKey: "",
    },
  });

  assert.equal(result.provider, "rule_based");
  assert.ok(result.answer.length > 40);
  assert.match(result.answer, /Kampala Beauty Studio/);
});

test("Gemini success uses Flash-Lite generateContent and returns its answer", async () => {
  let requestUrl = "";
  let requestOptions;
  const result = await generateProviderCoachAnswer({
    message: "What should I post today?",
    history: [{ role: "user", content: "Help with marketing" }],
    context,
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: "Post one real work photo with your service price and availability." }],
            },
          }],
        }),
      };
    },
    config: {
      provider: "gemini",
      geminiApiKey: "server-only-test-key",
      geminiModel: "gemini-2.5-flash-lite",
      geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
  });

  assert.match(requestUrl, /gemini-2\.5-flash-lite:generateContent$/);
  assert.equal(requestOptions.headers["x-goog-api-key"], "server-only-test-key");
  const requestBody = JSON.parse(requestOptions.body);
  const diagnosticPrompt = requestBody.contents.at(-1).parts[0].text;
  assert.match(diagnosticPrompt, /"detectedIntent":"promo_help"/);
  assert.match(diagnosticPrompt, /"standHealth":/);
  assert.match(diagnosticPrompt, /"overallStandHealthScore":/);
  assert.equal(result.provider, "gemini");
  assert.equal(result.fallback, false);
  assert.match(result.answer, /real work photo/);
  assert.equal(result.topic, "promo_help");
  assert.ok(result.nextBestAction);
});
