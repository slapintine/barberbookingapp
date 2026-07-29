import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");

test("Smart rebooking uses booking-capable provider handoff data", () => {
  assert.match(appSource, /import \{ buildSmartMatchProvider \}/);
  assert.match(appSource, /buildSmartMatchProvider\(/);
  assert.match(appSource, /previousBookingId: option\.bookingId/);
  assert.match(appSource, /serviceId: option\.currentService\.serviceId/);
});
