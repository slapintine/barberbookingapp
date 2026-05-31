import test from "node:test";
import assert from "node:assert/strict";
import { formatCustomerPremiumPrice, isCustomerPremiumActive } from "./customerPremium.js";

test("customer Premium unlock requires active non-expired plan", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isCustomerPremiumActive({ tier: "PREMIUM", status: "active", expires_at: future, features: { smartMatch: true } }), true);
  assert.equal(isCustomerPremiumActive({ tier: "PREMIUM", status: "pending", expires_at: future, features: { smartMatch: true } }), false);
  assert.equal(isCustomerPremiumActive({ tier: "FREE", status: "free", features: { smartMatch: false } }), false);
});

test("customer Premium price formatter keeps customer plan separate", () => {
  assert.equal(formatCustomerPremiumPrice({ monthlyPrice: 10000, annualPrice: 120000, currency: "UGX" }, "monthly"), "UGX 10,000 / month");
  assert.equal(formatCustomerPremiumPrice({ monthlyPrice: 10000, annualPrice: 120000, currency: "UGX" }, "annual"), "UGX 120,000 / year");
});
