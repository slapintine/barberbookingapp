import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const bookingsSource = fs.readFileSync(new URL("./pages/BookingsPage.jsx", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("./api/customerPremiumApi.js", import.meta.url), "utf8");

test("Bookings page exposes Earlier Slot Alert only through the customer booking action", () => {
  assert.match(bookingsSource, /onCreateEarlierSlotAlert/);
  assert.match(bookingsSource, /Earlier slot alert/);
  assert.match(bookingsSource, /String\(booking\.status \|\| ""\)\.toLowerCase\(\) === "confirmed"/);
  assert.match(bookingsSource, /!isBarberView/);
  assert.match(bookingsSource, /slotAlertSubmittingId === String\(booking\.id\)/);
});

test("App handoff sends booking, provider, and selected service context", () => {
  assert.match(appSource, /const bookingDetails = item\.booking_details/);
  assert.match(appSource, /serviceId: item\.service_id \?\? item\.serviceId \?\? bookingDetails\.service_id \?\? bookingDetails\.serviceId \?\? null/);
  assert.match(appSource, /createBookingEarlierSlotAlert/);
  assert.match(appSource, /providerId/);
  assert.match(appSource, /serviceId/);
  assert.match(appSource, /existingBookingId: booking\.id/);
  assert.match(appSource, /This booking does not have enough service information/);
});

test("Earlier Slot Alert API uses the recovered customer-premium route", () => {
  assert.match(apiSource, /\/api\/customer-premium\/slot-alerts/);
  assert.match(apiSource, /createEarlierSlotAlert/);
  assert.match(apiSource, /cancelEarlierSlotAlert/);
});
