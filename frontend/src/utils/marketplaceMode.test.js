import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketplaceMode,
  getMarketplacePlanContent,
  normalizeMarketplaceFields,
  supportsProducts,
  supportsServices,
} from "./marketplaceMode.js";

test("legacy stands default to service capability", () => {
  assert.equal(getMarketplaceMode({}), "service");
  assert.equal(getMarketplaceMode(null), "service");
  assert.equal(supportsServices({}), true);
  assert.equal(supportsServices(null), true);
  assert.equal(supportsProducts({}), false);
});

test("product and hybrid capabilities stay separate", () => {
  assert.equal(supportsServices("product"), false);
  assert.equal(supportsProducts("product"), true);
  assert.equal(supportsServices("hybrid"), true);
  assert.equal(supportsProducts("hybrid"), true);
});

test("normalizes API booleans without treating string zero as true", () => {
  const normalized = normalizeMarketplaceFields({
    marketplace_mode: "product",
    pickup_available: "1",
    delivery_available: "0",
    delivery_areas_json: '["Kampala"]',
  });
  assert.equal(normalized.pickupAvailable, true);
  assert.equal(normalized.deliveryAvailable, false);
  assert.deepEqual(normalized.deliveryAreas, ["Kampala"]);
});

test("adapts plan wording without changing service plan content", () => {
  const freePlan = {
    tier: "FREE",
    summary: "Create your stand, take bookings, and chat with customers for free.",
    bestFor: "Service providers",
    features: ["Service listings", "Customer bookings & requests"],
  };

  assert.equal(getMarketplacePlanContent(freePlan, "service"), freePlan);
  assert.match(getMarketplacePlanContent(freePlan, "product").summary, /order requests/i);
  assert.ok(getMarketplacePlanContent(freePlan, "product").features.includes("Up to 5 active products"));
  assert.match(getMarketplacePlanContent(freePlan, "hybrid").summary, /bookings and order requests/i);
  assert.ok(getMarketplacePlanContent(freePlan, "hybrid").features.includes("Product catalogue"));
});
