import assert from "node:assert/strict";
import test from "node:test";
import { formatServicePrice, normalizeServiceForBooking, serviceMatchesCategory } from "./serviceCatalog.js";

test("infers string service categories so cleaning does not appear as barbering", () => {
  const cleaning = normalizeServiceForBooking("Deep cleaning", 0);
  const barber = normalizeServiceForBooking("Men's haircut", 1);

  assert.equal(cleaning.category, "Cleaning Services");
  assert.equal(barber.category, "Beauty & Grooming");
});

test("matches category services without leaking unrelated provider services", () => {
  const cleaning = normalizeServiceForBooking("Deep cleaning", 0);
  const barber = normalizeServiceForBooking("Men's haircut", 0);

  assert.equal(serviceMatchesCategory(cleaning, "Cleaning Services"), true);
  assert.equal(serviceMatchesCategory(barber, "Cleaning Services"), false);
});

test("formats structured service prices", () => {
  assert.equal(formatServicePrice({ pricing_type: "fixed", price_extra: 10000 }), "UGX 10,000");
  assert.equal(formatServicePrice({ pricing_type: "range", min_price: 10000, max_price: 20000 }), "UGX 10,000 - UGX 20,000");
  assert.equal(formatServicePrice({ pricing_type: "starting_from", starting_price: 10000 }), "From UGX 10,000");
});
