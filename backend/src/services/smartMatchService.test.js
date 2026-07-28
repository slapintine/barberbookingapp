import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDistanceKm,
  calculatePaymentScore,
  calculateSmartMatchScore,
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

test("Smart Match exposes real booking facts and reasons for the selected service", () => {
  const match = scoreProvider({
    id: 44,
    business_name: "Spark Beauty",
    business_type: "Beauty",
    map_icon_type: "beauty",
    location: "Ntinda",
    latitude: 0.35,
    longitude: 32.58,
    service_id: 801,
    service_name: "Gel nails",
    category: "Beauty",
    pricing_type: "fixed",
    price_extra: 25000,
    duration_minutes: 45,
    schedule_is_open: 1,
    schedule_start: "08:00",
    schedule_end: "18:00",
    rating: 4.8,
    total_reviews: 12,
  }, {
    serviceKey: "beauty",
    serviceLabel: "Beauty",
    coordinates: { lat: 0.3476, lng: 32.5825 },
    when: "today",
    date: "2026-07-28",
    time: "15:30",
    budgetMax: 30000,
    minimumRating: 4.5,
  });

  assert.equal(match.serviceId, 801);
  assert.equal(match.serviceName, "Gel nails");
  assert.equal(match.durationMinutes, 45);
  assert.equal(match.priceLabel, "UGX 25,000");
  assert.equal(match.requestedDate, "2026-07-28");
  assert.equal(match.requestedTime, "15:30");
  assert.equal(match.budgetCompatible, true);
  assert.equal(match.timingExact, true);
  assert.equal(match.meetsRatingPreference, true);
  assert.match(match.reasons.join(" | "), /Within your selected price range/);
  assert.match(match.reasons.join(" | "), /Available near your preferred time/);
});

test("Smart Match does not claim budget or timing reasons without supporting data", () => {
  const match = scoreProvider({
    id: 45,
    business_name: "Late Premium",
    business_type: "Beauty",
    service_id: 802,
    service_name: "Makeup",
    category: "Beauty",
    pricing_type: "fixed",
    price_extra: 80000,
    duration_minutes: 60,
    schedule_is_open: 1,
    schedule_start: "08:00",
    schedule_end: "12:00",
    rating: 0,
    total_reviews: 0,
  }, {
    serviceKey: "beauty",
    serviceLabel: "Beauty",
    when: "today",
    time: "15:30",
    budgetMax: 30000,
    minimumRating: 4.5,
  });

  const reasons = match.reasons.join(" | ");
  assert.equal(match.budgetCompatible, false);
  assert.equal(match.timingExact, false);
  assert.equal(match.meetsRatingPreference, true);
  assert.doesNotMatch(reasons, /Within your selected price range/);
  assert.doesNotMatch(reasons, /Available near your preferred time/);
  assert.doesNotMatch(reasons, /Meets your rating preference/);
});

test("Smart Match does not use provider base price as matched service price", () => {
  const match = scoreProvider({
    id: 46,
    business_name: "Base Price Stand",
    business_type: "Beauty",
    price_from: 25000,
    service_id: 803,
    service_name: "Consultation",
    category: "Beauty",
    pricing_type: "fixed",
    price_extra: 0,
    duration_minutes: 20,
    schedule_is_open: 1,
    schedule_start: "08:00",
    schedule_end: "18:00",
    rating: 4.8,
    total_reviews: 12,
  }, {
    serviceKey: "beauty",
    serviceLabel: "Beauty",
    when: "today",
    time: "15:30",
    budgetMax: 30000,
  });

  assert.equal(match.priceLabel, "Quote required");
  assert.equal(match.priceMin, 0);
  assert.equal(match.priceMax, 0);
  assert.doesNotMatch(match.reasons.join(" | "), /Within your selected price range/);
});
