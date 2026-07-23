import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSISTANT_USAGE_LIMITS,
  CAPABILITY,
  PROVIDER_PLAN,
  getCustomerCapabilityList,
  getProviderCapabilityList,
  hasCapability,
} from "./entitlementMatrix.js";

test("Free Customer keeps regular Smart Match and booking capabilities", () => {
  const capabilities = getCustomerCapabilityList("FREE");

  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_DISCOVERY_PUBLIC), true);
  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_BOOKING_STANDARD), true);
  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_SMART_MATCH_STANDARD), true);
  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_SMART_MATCH_CONVERSATIONAL), false);
});

test("Premium Customer adds conversational Smart Match only", () => {
  const capabilities = getCustomerCapabilityList("PREMIUM");

  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_SMART_MATCH_STANDARD), true);
  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_SMART_MATCH_CONVERSATIONAL), true);
  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_SMART_MATCH_SAVED_PREFERENCES), false);
  assert.equal(hasCapability(capabilities, CAPABILITY.CUSTOMER_SMART_MATCH_REBOOKING), false);
});

test("provider assistant capabilities deepen by provider plan", () => {
  const free = getProviderCapabilityList("FREE");
  const premium = getProviderCapabilityList("PREMIUM");
  const platinum = getProviderCapabilityList("PLATINUM");

  assert.equal(hasCapability(free, CAPABILITY.PROVIDER_ASSISTANT_BASIC), true);
  assert.equal(hasCapability(free, CAPABILITY.PROVIDER_ASSISTANT_ANALYTICS), false);
  assert.equal(hasCapability(premium, CAPABILITY.PROVIDER_ASSISTANT_BASIC), true);
  assert.equal(hasCapability(premium, CAPABILITY.PROVIDER_ASSISTANT_ANALYTICS), true);
  assert.equal(hasCapability(premium, CAPABILITY.PROVIDER_ASSISTANT_FORECASTING), false);
  assert.equal(hasCapability(platinum, CAPABILITY.PROVIDER_ASSISTANT_ANALYTICS), true);
  assert.equal(hasCapability(platinum, CAPABILITY.PROVIDER_ASSISTANT_FORECASTING), false);
  assert.equal(ASSISTANT_USAGE_LIMITS.provider[PROVIDER_PLAN.PLATINUM].forecasting, false);
});
