import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LIVE_DELAY_OPTIONS, getProviderLiveStatusActions } from "./bookingLiveStatusUi.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("booking cards expose live status, delay, queue, ready and leave-now messaging", () => {
  const page = fs.readFileSync(path.resolve(here, "../pages/BookingsPage.jsx"), "utf8");
  const app = fs.readFileSync(path.resolve(here, "../App.jsx"), "utf8");

  assert.match(app, /liveStatus/);
  assert.match(app, /estimatedStartTime/);
  assert.match(app, /customersAhead/);
  assert.match(page, /Estimated start/);
  assert.match(page, /Approximate delay/);
  assert.match(page, /One customer is currently ahead of you/);
  assert.match(page, /Your provider is ready for you/);
  assert.match(page, /It may be a good time to leave now/);
});

test("provider booking cards keep contextual live update actions and delay choices", () => {
  const page = fs.readFileSync(path.resolve(here, "../pages/BookingsPage.jsx"), "utf8");
  const api = fs.readFileSync(path.resolve(here, "../api/bookingsApi.js"), "utf8");
  const delayLabels = LIVE_DELAY_OPTIONS.map((option) => option.label);

  assert.match(page, /Running late/);
  assert.ok(delayLabels.includes("10 minutes late"));
  assert.ok(delayLabels.includes("Custom delay"));
  assert.doesNotMatch(page, /<select[\s\S]*Customer did not arrive/);
  assert.match(api, /Idempotency-Key/);
});

test("provider live status actions follow the safe contextual sequence", () => {
  assert.deepEqual(getProviderLiveStatusActions({ status: "confirmed", liveStatus: "expected" }), [
    { value: "arrived", label: "Mark arrived" },
    { value: "running_late", label: "Running late" },
  ]);
  assert.deepEqual(getProviderLiveStatusActions({ status: "confirmed", liveStatus: "arrived" }), [
    { value: "ready", label: "Mark ready" },
    { value: "running_late", label: "Running late" },
  ]);
  assert.deepEqual(getProviderLiveStatusActions({ status: "confirmed", liveStatus: "ready" }), [
    { value: "service_started", label: "Start service" },
  ]);
  assert.deepEqual(getProviderLiveStatusActions({ status: "confirmed", liveStatus: "service_started" }), [
    { value: "service_completed", label: "Complete service" },
  ]);
  assert.deepEqual(getProviderLiveStatusActions({ status: "completed", liveStatus: "service_completed" }), []);
});
