import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("provider booking cards keep quick live update actions and delay choices", () => {
  const page = fs.readFileSync(path.resolve(here, "../pages/BookingsPage.jsx"), "utf8");
  const api = fs.readFileSync(path.resolve(here, "../api/bookingsApi.js"), "utf8");

  assert.match(page, /Customer expected/);
  assert.match(page, /Ready for customer/);
  assert.match(page, /Running late/);
  assert.match(page, /Customer did not arrive/);
  assert.match(page, /10 minutes late/);
  assert.match(page, /Custom delay/);
  assert.match(api, /Idempotency-Key/);
});
