import test from "node:test";
import assert from "node:assert/strict";
import {
  convertDurationToMinutes,
  formatServiceDuration,
  getUgandaStandPhoneError,
  inferDurationInput,
  normalizeUgandaStandPhone,
  requiresFixedBusinessLocation,
} from "./standSetupUtils.js";

test("normalizes valid Uganda stand phones and rejects incomplete values", () => {
  assert.equal(normalizeUgandaStandPhone("0772 123 456"), "+256772123456");
  assert.equal(normalizeUgandaStandPhone("+256 700 123 456"), "+256700123456");
  assert.equal(normalizeUgandaStandPhone("7123"), "");
  assert.match(getUgandaStandPhoneError("7123"), /9 digits/);
});

test("converts flexible service durations without changing database storage", () => {
  assert.equal(convertDurationToMinutes(2, "hours"), 120);
  assert.equal(convertDurationToMinutes(2, "days"), 2880);
  assert.deepEqual(inferDurationInput(2880), { value: 2, unit: "days" });
  assert.equal(formatServiceDuration(10080), "1 week");
});

test("only fixed-location delivery modes require a stand address", () => {
  assert.equal(requiresFixedBusinessLocation([{ location_type: "online" }]), false);
  assert.equal(requiresFixedBusinessLocation([{ location_type: "mobile_area" }]), false);
  assert.equal(requiresFixedBusinessLocation([{ location_type: "provider_location" }]), true);
});
