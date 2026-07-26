import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("live booking status stores audit history and enforces provider-only idempotent updates", () => {
  const controller = fs.readFileSync(path.resolve(here, "../controllers/bookingController.js"), "utf8");
  const routes = fs.readFileSync(path.resolve(here, "../routes/bookingRoutes.js"), "utf8");
  const migration = fs.readFileSync(path.resolve(here, "../db/migrations/postgres/040_live_booking_status.sql"), "utf8");

  assert.match(routes, /router\.patch\("\/:id\/status", protect, validateRequest\(schemas\.bookingStatus\), updateBookingStatus\)/);
  assert.match(controller, /LIVE_BOOKING_STATUSES/);
  assert.match(controller, /Only the provider can update live appointment status/);
  assert.match(controller, /Live updates are only available for confirmed bookings/);
  assert.match(controller, /live_status_changed/);
  assert.match(controller, /idempotency_key/);
  assert.match(controller, /duplicate: true/);
  assert.match(controller, /settlePendingBarberShare/);
  assert.match(controller, /reversePendingBarberShare/);
  assert.match(controller, /normalizeLiveBookingStatus\(booking\.live_status \|\| ""\) === transition\.liveStatus/);
  assert.match(migration, /ALTER TABLE bookings ADD COLUMN IF NOT EXISTS live_status/);
  assert.match(migration, /uniq_booking_events_idempotency_present/);
});

test("live booking status exposes customer estimates and reliable queue-ahead calculation", () => {
  const controller = fs.readFileSync(path.resolve(here, "../controllers/bookingController.js"), "utf8");

  assert.match(controller, /estimated_start_time/);
  assert.match(controller, /delay_minutes/);
  assert.match(controller, /customers_ahead/);
  assert.match(controller, /getCustomersAhead/);
  assert.match(controller, /status = 'confirmed'/);
  assert.match(controller, /COALESCE\(live_status, ''\) NOT IN \('service_completed', 'no_show', 'booking_cancelled'\)/);
});
