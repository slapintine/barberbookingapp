import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDistanceKm,
  calculatePaymentScore,
  calculateSmartMatchScore,
  buildSmartMatchAssistantCriteria,
  categoryMatches,
  normalizeCategoryKey,
  scoreProvider,
} from "./smartMatchService.js";

test("Smart Match category matching supports Tutor aliases", () => {
  assert.equal(categoryMatches({ business_type: "Education", service_name: "Mathematics tutoring" }, "Tutor / Lessons"), true);
  assert.equal(categoryMatches({ business_type: "Cleaning Services", service_name: "Deep cleaning" }, "Tutor / Lessons"), false);
});

test("Smart Match normalizes service categories and legacy service keys", () => {
  assert.equal(normalizeCategoryKey("Plumbing Services"), "plumbing-services");
  assert.equal(normalizeCategoryKey("plumbing"), "plumbing-services");
  assert.equal(categoryMatches({ business_type: "Home Services", service_name: "Pipe leak repair" }, "plumbing-services"), true);
  assert.equal(categoryMatches({ business_type: "Cleaning Services", service_name: "Deep cleaning" }, "plumbing-services"), false);
});

test("Smart Match distance helper returns nearby distance", () => {
  const distance = calculateDistanceKm(0.3476, 32.5825, 0.35, 32.58);
  assert.equal(distance < 1, true);
});

test("Smart Match score ranks available nearby provider higher", () => {
  const base = {
    schedule_is_open: 1,
    schedule_start: "08:00",
    schedule_end: "18:00",
    rating: 4.8,
    total_reviews: 10,
    image: "image.jpg",
    intro_text: "A complete profile with enough detail for customers.",
    location: "Gayaza",
    latitude: 0.35,
    longitude: 32.58,
    service_name: "Math tutoring",
    accepts_wallet: 1,
    payment_provider: "mtn_mobile_money",
  };
  const good = calculateSmartMatchScore({
    row: base,
    price: { min: 15000, max: 25000 },
    distanceKm: 2,
    budgetMin: 10000,
    budgetMax: 30000,
    date: "2026-05-21",
    time: "10:00",
    preference: "best_match",
  });
  const weak = calculateSmartMatchScore({
    row: { ...base, schedule_is_open: 0, rating: 0, total_reviews: 0, image: "", payment_provider: "" },
    price: { min: 90000, max: 120000 },
    distanceKm: 30,
    budgetMin: 10000,
    budgetMax: 30000,
    date: "2026-05-21",
    time: "10:00",
    preference: "best_match",
  });
  assert.equal(good > weak, true);
  assert.equal(calculatePaymentScore(base), 5);
});

test("Smart Match Assistant preserves conversation criteria across follow-ups", () => {
  const first = buildSmartMatchAssistantCriteria({ message: "I need braids on Saturday around Makerere." });
  assert.equal(first.criteria.serviceKey, "salon");
  assert.equal(first.criteria.address, "Makerere");
  assert.equal(first.criteria.when, "this_week");
  assert.deepEqual(first.missing, []);

  const changedBudget = buildSmartMatchAssistantCriteria({
    message: "Change the budget to UGX 100,000.",
    conversation: [{ role: "assistant", criteria: first.criteria }],
  });
  assert.equal(changedBudget.criteria.serviceKey, "salon");
  assert.equal(changedBudget.criteria.address, "Makerere");
  assert.equal(changedBudget.criteria.when, "this_week");
  assert.equal(changedBudget.criteria.budgetMax, 100000);
});

test("Smart Match Assistant tracks verified-only requests without resetting service or location", () => {
  const previous = {
    serviceKey: "barber",
    address: "Ntinda",
    when: "today",
    budgetMax: 30000,
  };
  const next = buildSmartMatchAssistantCriteria({
    message: "Only show verified ones.",
    conversation: [{ role: "assistant", criteria: previous }],
  });

  assert.equal(next.criteria.serviceKey, "barber");
  assert.equal(next.criteria.address, "Ntinda");
  assert.equal(next.criteria.when, "today");
  assert.equal(next.criteria.budgetMax, 30000);
  assert.equal(next.criteria.verifiedOnly, true);
});

test("Smart Match Assistant can remove verified-only without resetting other criteria", () => {
  const previous = {
    serviceKey: "barber",
    address: "Ntinda",
    when: "today",
    budgetMax: 30000,
    verifiedOnly: true,
  };
  const next = buildSmartMatchAssistantCriteria({
    message: "Show all providers again.",
    conversation: [{ role: "assistant", criteria: previous }],
  });

  assert.equal(next.criteria.serviceKey, "barber");
  assert.equal(next.criteria.address, "Ntinda");
  assert.equal(next.criteria.when, "today");
  assert.equal(next.criteria.budgetMax, 30000);
  assert.equal(next.criteria.verifiedOnly, false);
});

test("Smart Match Assistant records closest, cheapest, and rated sort intents", () => {
  const previous = { serviceKey: "barber", address: "Ntinda", when: "today" };
  assert.equal(buildSmartMatchAssistantCriteria({
    message: "Which is closest?",
    conversation: [{ role: "assistant", criteria: previous }],
  }).criteria.sortIntent, "closest");
  assert.equal(buildSmartMatchAssistantCriteria({
    message: "Which is cheapest?",
    conversation: [{ role: "assistant", criteria: previous }],
  }).criteria.sortIntent, "cheapest");
  assert.equal(buildSmartMatchAssistantCriteria({
    message: "Show the best rated ones.",
    conversation: [{ role: "assistant", criteria: previous }],
  }).criteria.sortIntent, "rated");
});

test("Smart Match Assistant clears stale sort intent when a later follow-up changes criteria", () => {
  const previous = {
    serviceKey: "barber",
    address: "Ntinda",
    when: "this_week",
    budgetMax: 30000,
    verifiedOnly: true,
    sortIntent: "closest",
  };
  const next = buildSmartMatchAssistantCriteria({
    message: "Change the budget to UGX 50,000.",
    conversation: [{ role: "assistant", criteria: previous }],
  });

  assert.equal(next.criteria.serviceKey, "barber");
  assert.equal(next.criteria.address, "Ntinda");
  assert.equal(next.criteria.when, "this_week");
  assert.equal(next.criteria.budgetMax, 50000);
  assert.equal(next.criteria.verifiedOnly, true);
  assert.equal(next.criteria.sortIntent, "");
});

test("Smart Match Assistant clears stale sort intent when location or verified preference changes", () => {
  const cheapestPrevious = {
    serviceKey: "barber",
    address: "Ntinda",
    when: "this_week",
    budgetMax: 30000,
    sortIntent: "cheapest",
  };
  const moved = buildSmartMatchAssistantCriteria({
    message: "Search around Kira.",
    conversation: [{ role: "assistant", criteria: cheapestPrevious }],
  });
  assert.equal(moved.criteria.address, "Kira");
  assert.equal(moved.criteria.sortIntent, "");

  const ratedPrevious = {
    serviceKey: "barber",
    address: "Ntinda",
    when: "this_week",
    budgetMax: 30000,
    verifiedOnly: true,
    sortIntent: "rated",
  };
  const allProviders = buildSmartMatchAssistantCriteria({
    message: "Remove verified only.",
    conversation: [{ role: "assistant", criteria: ratedPrevious }],
  });
  assert.equal(allProviders.criteria.verifiedOnly, false);
  assert.equal(allProviders.criteria.sortIntent, "");
});

test("Smart Match Assistant applies a newly requested sort after criteria changes", () => {
  const previous = {
    serviceKey: "barber",
    address: "Ntinda",
    when: "this_week",
    budgetMax: 50000,
    verifiedOnly: true,
    sortIntent: "",
  };
  const next = buildSmartMatchAssistantCriteria({
    message: "Show the cheapest one.",
    conversation: [{ role: "assistant", criteria: previous }],
  });
  assert.equal(next.criteria.budgetMax, 50000);
  assert.equal(next.criteria.verifiedOnly, true);
  assert.equal(next.criteria.sortIntent, "cheapest");
});

test("Smart Match Assistant treats a short standalone follow-up as the missing location", () => {
  const first = buildSmartMatchAssistantCriteria({ message: "I need a barber." });
  assert.equal(first.criteria.serviceKey, "barber");
  assert.equal(first.criteria.address, "");
  assert.deepEqual(first.missing, ["location"]);

  const location = buildSmartMatchAssistantCriteria({
    message: "Ntinda.",
    conversation: [{ role: "assistant", criteria: first.criteria }],
  });

  assert.equal(location.criteria.serviceKey, "barber");
  assert.equal(location.criteria.address, "Ntinda");
  assert.equal(location.criteria.when, "today");
  assert.deepEqual(location.missing, []);
});

test("Smart Match Assistant extracts richer natural-language constraints", () => {
  const result = buildSmartMatchAssistantCriteria({
    message: "Find me an affordable barber near Ntinda who is available after 5 and can come to my location.",
  });

  assert.equal(result.criteria.serviceKey, "barber");
  assert.equal(result.criteria.address, "Ntinda");
  assert.equal(result.criteria.time, "17:00");
  assert.equal(result.criteria.serviceLocationPreference, "customer_location");
});

test("Smart Match ranks exact and budget-fitting services above weaker partial matches", () => {
  const exact = scoreProvider({
    id: 1,
    business_name: "Exact Barber",
    business_type: "Barber",
    service_name: "Classic haircut",
    category: "Barber",
    description: "Clean haircut",
    price_extra: 25000,
    pricing_type: "fixed",
    schedule_is_open: 1,
    schedule_start: "08:00",
    schedule_end: "20:00",
    rating: 4.7,
    total_reviews: 8,
    location: "Ntinda",
    latitude: 0.35,
    longitude: 32.58,
  }, { serviceKey: "barber", budgetMax: 30000, time: "17:00" });
  const partial = scoreProvider({
    id: 2,
    business_name: "General Grooming",
    business_type: "Beauty",
    service_name: "General grooming consultation",
    category: "Beauty",
    description: "Can advise on haircut preparation",
    price_extra: 90000,
    pricing_type: "fixed",
    schedule_is_open: 1,
    schedule_start: "08:00",
    schedule_end: "20:00",
    rating: 4.9,
    total_reviews: 20,
    location: "Kira",
    latitude: 0.5,
    longitude: 32.7,
  }, { serviceKey: "barber", budgetMax: 30000, time: "17:00" });

  assert.equal(exact.matchType, "exact");
  assert.equal(exact.score > (partial?.score || 0), true);
});
