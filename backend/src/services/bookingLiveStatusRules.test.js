import assert from "node:assert/strict";
import test from "node:test";
import {
  getLiveStatusTransition,
  normalizeDelayMinutes,
  normalizeLiveBookingStatus,
} from "../controllers/bookingController.js";

test("live status transition rules protect inactive and terminal bookings", () => {
  assert.deepEqual(
    getLiveStatusTransition({ booking: { status: "pending" }, liveStatus: "ready" }),
    { ok: false, message: "Live updates are only available for confirmed bookings." }
  );
  assert.deepEqual(
    getLiveStatusTransition({ booking: { status: "completed", live_status: "service_completed" }, liveStatus: "running_late" }),
    { ok: false, message: "This booking is already closed." }
  );
  assert.deepEqual(
    getLiveStatusTransition({ booking: { status: "cancelled", live_status: "booking_cancelled" }, liveStatus: "service_started" }),
    { ok: false, message: "This booking is already closed." }
  );
});

test("live status transition rules allow the intended provider workflow", () => {
  assert.equal(getLiveStatusTransition({ booking: { status: "confirmed", live_status: "expected" }, liveStatus: "arrived" }).ok, true);
  assert.equal(getLiveStatusTransition({ booking: { status: "confirmed", live_status: "arrived" }, liveStatus: "ready" }).ok, true);
  assert.equal(getLiveStatusTransition({ booking: { status: "confirmed", live_status: "ready" }, liveStatus: "service_started" }).ok, true);
  const completed = getLiveStatusTransition({ booking: { status: "confirmed", live_status: "service_started" }, liveStatus: "service_completed" });
  assert.equal(completed.ok, true);
  assert.equal(completed.lifecycleStatus, "completed");
});

test("live status aliases and delay normalization are bounded", () => {
  assert.equal(normalizeLiveBookingStatus("Ready for customer"), "ready");
  assert.equal(normalizeLiveBookingStatus("Customer did not arrive"), "no_show");
  assert.equal(normalizeDelayMinutes("on time"), 0);
  assert.equal(normalizeDelayMinutes("-20"), 0);
  assert.equal(normalizeDelayMinutes("9999 minutes"), 240);
});
