import assert from "node:assert/strict";
import test from "node:test";
import { getServicePrice, isProviderVerified } from "./providerDiscovery.js";

test("provider service prices do not add the stand base price to a selected service", () => {
  const provider = { price_from: 20000 };
  const service = { pricing_type: "fixed", price_extra: 1000 };

  assert.equal(getServicePrice(service, provider), "UGX 1,000");
});

test("provider service prices fall back to stand base price only when the service has no price", () => {
  const provider = { price_from: 20000 };
  const service = { pricing_type: "fixed", price_extra: 0 };

  assert.equal(getServicePrice(service, provider), "From UGX 20,000");
});

test("provider verification does not treat reputation labels as completed verification", () => {
  assert.equal(isProviderVerified({ verified: "Top rated" }), false);
  assert.equal(isProviderVerified({ verified_status: "approved" }), true);
});
