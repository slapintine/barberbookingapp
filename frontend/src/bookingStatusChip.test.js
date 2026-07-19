import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chip = readFileSync(new URL("./components/ui/BookingStatusChip.jsx", import.meta.url), "utf8");
const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const bookingsPage = readFileSync(new URL("./pages/BookingsPage.jsx", import.meta.url), "utf8");
const scheduleWorkspace = readFileSync(
  new URL("./features/barbers/ScheduleWorkspace.jsx", import.meta.url),
  "utf8"
);
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("booking status chip communicates confirmed state with check icon and text", () => {
  assert.match(chip, /confirmed:\s*\{[\s\S]*label:\s*"Confirmed"/);
  assert.match(chip, /confirmed:\s*\{[\s\S]*Icon:\s*FiCheckCircle/);
  assert.match(chip, /confirmed:\s*\{[\s\S]*description:\s*"Your booking is confirmed"/);
  assert.match(chip, /<Icon aria-hidden="true" \/>/);
  assert.match(chip, /<span>\{meta\.label\}<\/span>/);
  assert.match(chip, /aria-label=\{meta\.description\}/);
});

test("booking status chip covers the supported booking lifecycle labels", () => {
  assert.match(chip, /pending:\s*\{[\s\S]*label:\s*"Waiting for confirmation"[\s\S]*FiClock/);
  assert.match(chip, /completed:\s*\{[\s\S]*label:\s*"Completed"[\s\S]*FiCheck/);
  assert.match(chip, /cancelled:\s*\{[\s\S]*label:\s*"Cancelled"[\s\S]*FiXCircle/);
  assert.match(chip, /declined:\s*\{[\s\S]*label:\s*"Not accepted"[\s\S]*FiAlertCircle/);
  assert.match(chip, /rescheduled:\s*\{[\s\S]*label:\s*"Rescheduled"[\s\S]*FiRefreshCw/);
  assert.match(chip, /rejected:\s*\{[\s\S]*label:\s*"Not accepted"/);
});

test("booking status chip is a non-interactive status treatment", () => {
  assert.match(chip, /return \(\s*<span/);
  assert.doesNotMatch(chip, /<button/);
  assert.match(appCss, /\.booking-status-chip-v1\s*\{[\s\S]*cursor:\s*default;/);
  assert.match(appCss, /\.booking-status-chip-v1\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(appCss, /\.booking-status-chip-v1\s*\{[\s\S]*white-space:\s*nowrap;/);
});

test("booking status chip uses accessible success styling in light and dark mode", () => {
  assert.match(appCss, /\.booking-status-chip-v1\.confirmed\s*\{[\s\S]*#17633b/);
  assert.match(appCss, /\.light \.booking-status-chip-v1\.confirmed,[\s\S]*color:\s*#17633b !important/);
  assert.match(appCss, /\.dark \.booking-status-chip-v1\.confirmed\s*\{[\s\S]*#b7f7d6/);
  assert.match(appCss, /\.dark \.booking-status-chip-v1\.confirmed,[\s\S]*color:\s*#b7f7d6 !important/);
  assert.match(appCss, /\.booking-status-chip-v1 svg\s*\{[\s\S]*stroke-width:\s*2\.25/);
});

test("booking status chip animation respects reduced motion", () => {
  assert.match(appCss, /@keyframes bookingStatusSettleV1/);
  assert.match(appCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.booking-status-chip-v1\s*\{[\s\S]*animation:\s*none !important/);
});

test("booking pages use the shared booking status chip", () => {
  assert.match(bookingsPage, /import BookingStatusChip from "\.\.\/components\/ui\/BookingStatusChip\.jsx"/);
  assert.match(bookingsPage, /<BookingStatusChip status=\{booking\.status\} className="booking-badge-v4" \/>/);
  assert.match(scheduleWorkspace, /import BookingStatusChip from "\.\.\/\.\.\/components\/ui\/BookingStatusChip\.jsx"/);
  assert.match(scheduleWorkspace, /<BookingStatusChip status=\{item\.status\} className="schedule-status-pill-v9" \/>/);
});

test("success toasts use friendly action-completion copy", () => {
  assert.match(app, /showSystemToast\("Changes saved", "Your account settings are up to date\.", "system"\)/);
  assert.match(app, /"Booking sent"[\s\S]*"The provider will review your request\."/);
  assert.match(app, /confirmed:\s*\["Booking confirmed", "You're all set\."\]/);
  assert.match(app, /cancelled:\s*\["Booking cancelled", "This booking is no longer active\."\]/);
  assert.match(app, /showSystemToast\("Payment recorded", "Cash payment has been marked as received\.", "booking"\)/);
  assert.match(app, /showSystemToast\("Booking updated", "Your new time has been saved\.", "booking"\)/);
  assert.doesNotMatch(app, /Status changed to \$\{status\}/);
  assert.doesNotMatch(app, /Your booking was created successfully/);
});
