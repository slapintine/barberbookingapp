import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_ENTITLEMENTS,
  DEFAULT_CUSTOMER_ENTITLEMENT_SNAPSHOT,
  canUseCustomerEntitlement,
  customerFavouriteLimit,
} from "./customerEntitlements.js";

test("customer entitlement helpers keep Free limited without unlocking Premium features", () => {
  const snapshot = DEFAULT_CUSTOMER_ENTITLEMENT_SNAPSHOT;

  assert.equal(canUseCustomerEntitlement(snapshot, CUSTOMER_ENTITLEMENTS.SMART_MATCH_PREVIEW), true);
  assert.equal(canUseCustomerEntitlement(snapshot, CUSTOMER_ENTITLEMENTS.SMART_MATCH_FULL), false);
  assert.equal(canUseCustomerEntitlement(snapshot, CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE), false);
  assert.equal(canUseCustomerEntitlement(snapshot, CUSTOMER_ENTITLEMENTS.FAVOURITES_BASIC), true);
  assert.equal(canUseCustomerEntitlement(snapshot, CUSTOMER_ENTITLEMENTS.SMART_REBOOKING), false);
  assert.equal(canUseCustomerEntitlement(snapshot, CUSTOMER_ENTITLEMENTS.EARLIER_SLOT_ALERTS), false);
  assert.equal(customerFavouriteLimit(snapshot), 3);
});

test("customer entitlement helpers allow Premium comparison and expanded favourites when server grants them", () => {
  const premium = {
    plan: "PREMIUM",
    entitlements: {
      [CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE]: true,
      [CUSTOMER_ENTITLEMENTS.FAVOURITES_EXPANDED]: true,
    },
    limits: { favourites: 50 },
  };

  assert.equal(canUseCustomerEntitlement(premium, CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE), true);
  assert.equal(canUseCustomerEntitlement(premium, CUSTOMER_ENTITLEMENTS.FAVOURITES_EXPANDED), true);
  assert.equal(customerFavouriteLimit(premium), 50);
});
