import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDistanceKm,
  calculatePaymentScore,
  calculateSmartMatchScore,
  categoryMatches,
} from "./smartMatchService.js";

test("Smart Match category matching supports Tutor aliases", () => {
  assert.equal(categoryMatches({ business_type: "Education", service_name: "Mathematics tutoring" }, "Tutor / Lessons"), true);
  assert.equal(categoryMatches({ business_type: "Cleaning Services", service_name: "Deep cleaning" }, "Tutor / Lessons"), false);
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
