import assert from "node:assert/strict";
import test from "node:test";
import { formatServicePrice, getStableSelectedServiceId, normalizeServiceForBooking, serviceMatchesCategory } from "./serviceCatalog.js";

test("infers string service categories so cleaning does not appear as barbering", () => {
  const cleaning = normalizeServiceForBooking("Deep cleaning", 0);
  const barber = normalizeServiceForBooking("Men's haircut", 1);
  const plumbing = normalizeServiceForBooking("Leaking pipe repair", 2);

  assert.equal(cleaning.category, "Cleaning Services");
  assert.equal(barber.category, "Barber");
  assert.equal(plumbing.category, "Plumbing Services");
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
  assert.equal(formatServicePrice({ pricing_type: "quote", price_extra: 0 }), "Request quote");
  assert.equal(formatServicePrice({ pricing_type: "fixed", price_extra: 0 }), "Request quote");
});

test("preserves a selected service when provider data refreshes", () => {
  const services = [
    { id: 133, service_name: "Quote service", pricing_type: "quote" },
    { id: 426, service_name: "Fixed service", pricing_type: "fixed", price_extra: 25000 },
  ];

  assert.equal(getStableSelectedServiceId(services, 426), 426);
  assert.equal(getStableSelectedServiceId(services, 999), 133);
});
