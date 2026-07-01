import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderStandDiagnosis,
  detectProviderCoachIntent,
} from "./providerCoachDiagnosis.js";
import {
  generateProviderCoachAnswer,
} from "./providerCoachChatService.js";

const context = {
  stand: {
    name: "Kampala Beauty Studio",
    category: "Beauty",
    description: "Event beauty services.",
    location: "Kampala",
    delivery: "Customer visits provider location",
    status: "draft",
    verification: "not reviewed",
    plan: "free",
    planActive: true,
    profileCompleteness: 63,
    missingFields: ["opening hours", "at least three trust-building photos"],
  },
  services: [{
    name: "Event makeup",
    description: "Professional event makeup.",
    price: "UGX 85,000",
    durationMinutes: 90,
    available: true,
    hasPhoto: false,
  }, {
    name: "Bridal makeup",
    description: "Description missing",
    price: "Price missing",
    durationMinutes: 0,
    available: true,
    hasPhoto: false,
  }],
  availability: [],
  signals: {
    bookingsAvailable: false,
    totalBookings: 0,
    reviewsAvailable: false,
    reviewCount: 0,
    photoCount: 1,
  },
};

const ruleBasedConfig = {
  provider: "gemini",
  geminiApiKey: "",
  openAiApiKey: "",
};

test("stand diagnosis calculates every requested health indicator from available data", () => {
  const diagnosis = buildProviderStandDiagnosis(context);
  for (const key of [
    "profileCompletenessScore",
    "serviceClarityScore",
    "pricingClarityScore",
    "trustScore",
    "bookingReadinessScore",
    "photoCompletenessScore",
    "locationClarityScore",
    "responseReadinessScore",
    "overallStandHealthScore",
  ]) {
    assert.equal(Number.isInteger(diagnosis[key]), true, key);
    assert.ok(diagnosis[key] >= 0 && diagnosis[key] <= 100, key);
  }
  assert.equal(diagnosis.facts.servicesCount, 2);
  assert.equal(diagnosis.facts.totalBookings, null);
  assert.equal(diagnosis.facts.reviewCount, null);
});

test("an unclear message asks for clarification and returns useful chips", async () => {
  const result = await generateProviderCoachAnswer({
    message: "eh",
    history: [],
    context,
    config: ruleBasedConfig,
  });
  assert.equal(result.intent, "unclear");
  assert.equal(result.topic, "unclear");
  assert.match(result.answer, /what would you like to work on/i);
  assert.deepEqual(result.suggestedChips.slice(0, 3), [
    "Get more bookings",
    "Improve my description",
    "Check my prices",
  ]);
  assert.equal(result.nextBestAction, "");
});

test("a booking question returns a booking-specific diagnosis and next action", async () => {
  const result = await generateProviderCoachAnswer({
    message: "Why am I not getting bookings?",
    history: [],
    context,
    config: ruleBasedConfig,
  });
  assert.equal(result.topic, "bookings_help");
  assert.match(result.answer, /booking-readiness score/i);
  assert.match(result.answer, /does not have enough booking history/i);
  assert.ok(result.nextBestAction.length > 15);
});

test("how follows the previous booking topic instead of becoming generic", async () => {
  const history = [
    { role: "user", content: "Why am I not getting bookings?", intent: "bookings_help" },
    { role: "assistant", content: "Your booking readiness needs work.", intent: "bookings_help", topic: "bookings_help" },
  ];
  const detected = detectProviderCoachIntent("how?", history);
  assert.equal(detected.detectedIntent, "follow_up_question");
  assert.equal(detected.resolvedIntent, "bookings_help");

  const result = await generateProviderCoachAnswer({
    message: "how?",
    history,
    context,
    config: ruleBasedConfig,
  });
  assert.equal(result.intent, "follow_up_question");
  assert.equal(result.topic, "bookings_help");
  assert.match(result.answer, /staying with bookings/i);
  assert.match(result.answer, /booking-readiness/i);
});

test("description help uses the actual stand and service names", async () => {
  const result = await generateProviderCoachAnswer({
    message: "Improve my description",
    history: [],
    context,
    config: ruleBasedConfig,
  });
  assert.equal(result.topic, "description_help");
  assert.match(result.answer, /Kampala Beauty Studio/);
  assert.match(result.answer, /Event makeup/);
  assert.match(result.nextBestAction, /service descriptions/i);
});

test("pricing help checks saved fields without inventing market data", async () => {
  const result = await generateProviderCoachAnswer({
    message: "Is my pricing okay?",
    history: [],
    context,
    config: ruleBasedConfig,
  });
  assert.equal(result.topic, "pricing_help");
  assert.match(result.answer, /Bridal makeup/);
  assert.match(result.answer, /cannot judge market competitiveness/i);
  assert.doesNotMatch(result.answer, /average market price|customers prefer|competitors charge/i);
});

test("repeated questions do not return the exact same fallback response", async () => {
  const first = await generateProviderCoachAnswer({
    message: "Is my pricing okay?",
    history: [],
    context,
    config: ruleBasedConfig,
  });
  const second = await generateProviderCoachAnswer({
    message: "Is my pricing okay?",
    history: [
      { role: "user", content: "Is my pricing okay?", intent: "pricing_help" },
      { role: "assistant", content: first.answer, intent: "pricing_help", topic: "pricing_help" },
    ],
    context,
    config: ruleBasedConfig,
  });
  assert.notEqual(second.answer, first.answer);
  assert.match(second.answer, /next layer/i);
});
