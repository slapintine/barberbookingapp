import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccountStatusStripText,
  getBadgesFromSubscriptionStates,
  getMembershipSummaryText,
  getPrimaryMembershipLabel,
} from "./membershipDisplay.js";

test("free customer and provider membership labels display as Free", () => {
  const customerBadges = getBadgesFromSubscriptionStates(null, null, false);
  assert.equal(customerBadges[0].label, "Free");
  assert.equal(getPrimaryMembershipLabel(customerBadges), "Free");
  assert.equal(getMembershipSummaryText(customerBadges), "Free");
  assert.equal(getAccountStatusStripText(null, null, false, false), "Free");

  const providerBadges = getBadgesFromSubscriptionStates(null, { tier: "LOCKED", status: "none" }, true);
  assert.equal(providerBadges.at(-1).label, "Free");
  assert.equal(getAccountStatusStripText(null, { tier: "LOCKED", status: "none" }, true, true), "Free");
});
