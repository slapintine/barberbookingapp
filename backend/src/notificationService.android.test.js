import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Firebase sender includes Android tray notification channel and private visibility", () => {
  const source = fs.readFileSync(new URL("./services/notificationService.js", import.meta.url), "utf8");

  assert.match(source, /ANDROID_NOTIFICATION_CHANNEL_ID = "queless-booking-updates"/);
  assert.match(source, /android:\s*\{/);
  assert.match(source, /priority:\s*data\.type === "booking"/);
  assert.match(source, /notification:\s*\{\s*title:\s*compactString\(title, 160\)/);
  assert.match(source, /body:\s*compactString\(body, 240\)/);
  assert.match(source, /channelId:\s*ANDROID_NOTIFICATION_CHANNEL_ID/);
  assert.match(source, /visibility:\s*"private"/);
  assert.match(source, /defaultSound:\s*true/);
  assert.match(source, /notificationId:\s*notificationId \|\| data\.notificationId/);
});

test("booking notification copy stays concise and privacy-safe", () => {
  const source = fs.readFileSync(new URL("./controllers/bookingController.js", import.meta.url), "utf8");

  assert.match(source, /"New booking request"/);
  assert.match(source, /"You have a new booking to review\."/);
  assert.match(source, /"Booking confirmed"/);
  assert.match(source, /"Booking not accepted"/);
  assert.match(source, /"This booking has been cancelled\."/);
  assert.doesNotMatch(source, /booked \$\{mappedBooking\.service_name\}/);
});
