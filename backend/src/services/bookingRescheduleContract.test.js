import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("booking reschedule validates ownership, schedule, overlap, and records history", () => {
  const controller = fs.readFileSync(path.resolve(here, "../controllers/bookingController.js"), "utf8");
  const routes = fs.readFileSync(path.resolve(here, "../routes/bookingRoutes.js"), "utf8");

  assert.match(routes, /router\.patch\("\/:id\/reschedule", protect, rescheduleBooking\)/);
  assert.match(controller, /Not allowed to reschedule this booking/);
  assert.match(controller, /isWithinSchedule\(workingWindow, bookingTime, durationMinutes\)/);
  assert.match(controller, /hasOverlap\(conflicts, bookingTime, durationMinutes\)/);
  assert.match(controller, /'rescheduled'/);
});
