import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

test("uploaded stand, service, portfolio, and product images use the shared asset URL builder", () => {
  const standWizard = source("./features/barbers/BarberStandModals.jsx");
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const booking = source("./features/bookings/BookingModal.jsx");
  const products = source("./features/products/ProductMarketplacePanel.jsx");

  assert.match(standWizard, /src=\{buildAssetUrl\(image\)\}/);
  assert.match(standWizard, /src=\{buildAssetUrl\(service\.image\)\}/);
  assert.match(profile, /buildAssetUrl\(getPortfolioImage\(item\)\)/);
  assert.match(booking, /\.map\(buildAssetUrl\)/);
  assert.match(products, /src=\{buildAssetUrl\(image\)\}/);
});

test("structured booking details remain supported without exposing the old raw validation message", () => {
  const app = source("./App.jsx");
  const bookingModal = source("./features/bookings/BookingModal.jsx");

  assert.match(bookingModal, /bookingDetails: isTutorService \? \{ type: "tutor_lesson", \.\.\.tutorDetails \} : null/);
  assert.match(app, /booking_details: options\.bookingDetails \|\| null/);
  assert.match(app, /booking_details\.\*\(\?:must\|should\)\.\*string/i);
  assert.doesNotMatch(app, /setGlobalError\(error\.message \|\| "Could not create booking\."\)/);
});

test("login errors are sanitized before rendering", () => {
  const authScreen = source("./features/auth/AuthScreen.jsx");
  const errorUtilities = source("./utils/errorMessages.js");

  assert.match(authScreen, /sanitizeErrorMessage\(authError\)/);
  assert.match(errorUtilities, /never reach the UI as "\[object Object\]"/);
});
