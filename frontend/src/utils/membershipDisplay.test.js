import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccountStatusStripText,
  getBadgesFromSubscriptionStates,
  getMembershipSummaryText,
  getPrimaryMembershipLabel,
  MEMBERSHIP_BADGE_CONFIGS,
} from "./membershipDisplay.js";

test("free customer and provider badges use explicit Free plan labels", () => {
  assert.equal(MEMBERSHIP_BADGE_CONFIGS.customer_free.label, "Free Customer");
  assert.equal(MEMBERSHIP_BADGE_CONFIGS.provider_free.label, "Free Provider");

  const badges = getBadgesFromSubscriptionStates(null, { tier: "FREE", status: "free" }, true);
  assert.deepEqual(badges.map((badge) => badge.label), ["Free Customer", "Free Provider"]);
  assert.equal(getPrimaryMembershipLabel([]), "Free Customer");
  assert.equal(getMembershipSummaryText(badges), "Free Customer");
  assert.equal(getAccountStatusStripText(null, { tier: "FREE", status: "free" }, true, true), "Free Provider");
});

test("paid customer and provider badges remain independent", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const badges = getBadgesFromSubscriptionStates(
    { tier: "PREMIUM", status: "active", payment_status: "paid", expires_at: future },
    { tier: "PLATINUM", status: "active" },
    true
  );

  assert.deepEqual(badges.map((badge) => badge.label), ["Premium Customer", "Platinum Provider"]);
  const summary = getMembershipSummaryText(badges);
  assert.match(summary, /Premium Customer/);
  assert.match(summary, /Platinum Provider/);
});
