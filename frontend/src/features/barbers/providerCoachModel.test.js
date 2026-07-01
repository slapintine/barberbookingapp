import test from "node:test";
import assert from "node:assert/strict";
import {
  getCoachFocusAction,
  getCoachPlanState,
  getProfileCompletion,
  rankProviderCoachQuestions,
} from "./providerCoachModel.js";

test("ranks missing photos as a recommended provider action", () => {
  const result = rankProviderCoachQuestions({
    insights: {
      setupChecklist: [{ label: "Add service photos", complete: false }],
      dataQuality: { bookingsCount: 5, reviewsCount: 5, servicesCount: 4 },
    },
  });
  assert.equal(result.recommended[0].id, "photos_to_upload");
});

test("prioritizes conversion when views substantially exceed bookings", () => {
  const result = rankProviderCoachQuestions({
    barber: { profile_views: 40 },
    insights: {
      setupChecklist: [],
      dataQuality: { bookingsCount: 2, reviewsCount: 4, servicesCount: 4 },
    },
  });
  assert.equal(result.recommended[0].id, "views_no_booking");
});

test("uses subscription state while preferring API entitlement", () => {
  assert.equal(getCoachPlanState({ subscription: { tier: "PLATINUM", status: "active" } }).enabled, true);
  assert.equal(getCoachPlanState({
    subscription: { tier: "PLATINUM", status: "active" },
    questionsData: { access: { allowed: false }, usage: { plan: "free" } },
  }).enabled, false);
});

test("maps contextual focus copy to the correct action", () => {
  assert.deepEqual(getCoachFocusAction("Upload more photos to build trust"), { label: "Add photos", target: "photos" });
  assert.deepEqual(getCoachFocusAction("Confirm bookings faster"), { label: "Review bookings", target: "bookings" });
});

test("calculates profile completion from checklist state", () => {
  assert.equal(getProfileCompletion([{ complete: true }, { complete: true }, { complete: false }]), 67);
  assert.equal(getProfileCompletion([]), 0);
});
