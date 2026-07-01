import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketplaceMode,
  getPlanProductLimits,
  getPublishRequirements,
  normalizeStandForClient,
  supportsProducts,
  supportsServices,
} from "./marketplaceCapabilities.js";
import { env } from "../config/env.js";
import { requireProductMarketplaceEnabled } from "../middleware/productMarketplaceMiddleware.js";

const baseStand = {
  business_name: "Kampala Local Shop",
  business_type: "Boutique & Fashion",
  phone: "+256700123456",
  location: "Nakasero, Kampala",
  map_icon_type: "boutique-fashion",
  subscription_tier: "FREE",
};

test("legacy stands normalize to service without changing legacy stand_type", () => {
  const stand = normalizeStandForClient({ ...baseStand, stand_type: "shop" });
  assert.equal(getMarketplaceMode(stand), "service");
  assert.equal(stand.stand_type, "shop");
  assert.equal(supportsServices(stand), true);
  assert.equal(supportsProducts(stand), false);
});

test("product and hybrid capabilities stay separate from team stand_type", () => {
  assert.equal(supportsServices({ marketplace_mode: "product", stand_type: "shop" }), false);
  assert.equal(supportsProducts({ marketplace_mode: "product", stand_type: "individual" }), true);
  assert.equal(supportsServices({ marketplace_mode: "hybrid" }), true);
  assert.equal(supportsProducts({ marketplace_mode: "hybrid" }), true);
});

test("product publish requirements do not require services or appointment availability", () => {
  const notReady = getPublishRequirements({
    stand: { ...baseStand, marketplace_mode: "product", pickup_available: 1 },
    services: [],
    products: [],
    schedule: [],
  });
  assert.deepEqual(notReady.missing, ["at least one active product"]);

  const ready = getPublishRequirements({
    stand: { ...baseStand, marketplace_mode: "product", pickup_available: 1 },
    services: [],
    products: [{ id: 1, is_active: 1, is_deleted: 0, stock_status: "in_stock" }],
    schedule: [],
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.serviceReady, true);
  assert.equal(ready.productReady, true);
});

test("hybrid publish requires independently ready service and product sides", () => {
  const result = getPublishRequirements({
    stand: { ...baseStand, marketplace_mode: "hybrid", pickup_available: 1 },
    services: [{
      service_name: "Tailoring",
      pricing_type: "fixed",
      price_extra: 20000,
      duration_minutes: 60,
    }],
    products: [],
    schedule: [{ is_open: 1, start_time: "09:00", end_time: "17:00" }],
  });
  assert.equal(result.serviceReady, true);
  assert.equal(result.productReady, false);
  assert.deepEqual(result.missing, ["at least one active product"]);
});

test("provider plans expose configured product and image limits", () => {
  assert.deepEqual(getPlanProductLimits({ subscription_tier: "FREE" }), {
    tier: "FREE",
    productLimit: 5,
    productImageLimit: 3,
  });
  assert.deepEqual(getPlanProductLimits({ subscription_tier: "PREMIUM" }), {
    tier: "PREMIUM",
    productLimit: 50,
    productImageLimit: 6,
  });
  assert.equal(getPlanProductLimits({ subscription_tier: "PLATINUM" }).productLimit, -1);
  assert.equal(getPlanProductLimits({ subscription_tier: "PLATINUM" }).productImageLimit, 10);
});

test("disabled product marketplace middleware returns a non-success response", () => {
  const previous = env.productMarketplaceEnabled;
  env.productMarketplaceEnabled = false;
  let statusCode = 0;
  let body = null;
  requireProductMarketplaceEnabled({}, {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  }, () => assert.fail("disabled marketplace must not continue"));
  env.productMarketplaceEnabled = previous;
  assert.equal(statusCode, 404);
  assert.equal(body.success, false);
  assert.equal(body.code, "PRODUCT_MARKETPLACE_DISABLED");
});
