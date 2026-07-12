import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

test("uploaded stand, service, portfolio, and booking images use the shared asset URL builder", () => {
  const standWizard = source("./features/barbers/BarberStandModals.jsx");
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const booking = source("./features/bookings/BookingModal.jsx");

  assert.match(standWizard, /src=\{buildAssetUrl\(image\)\}/);
  assert.match(standWizard, /src=\{buildAssetUrl\(service\.image\)\}/);
  assert.match(profile, /buildAssetUrl\(getPortfolioImage\(item\)\)/);
  assert.match(booking, /\.map\(buildAssetUrl\)/);
});

test("product commerce modules are not part of the active frontend surface", () => {
  const app = source("./App.jsx");
  const dashboard = source("./pages/DashboardPage.jsx");
  const home = source("./pages/HomePage.jsx");

  assert.doesNotMatch(app, /productsApi|ProductMarketplace|ProviderProduct/);
  assert.doesNotMatch(dashboard, /ProductMarketplace|ProviderProduct|productWorkspace/);
  assert.doesNotMatch(home, /ProductMarketplace|Shop from Sellers|Browse sellers/);
});

test("current frontend discovery clients use canonical service-discovery routes", () => {
  const quoteApi = source("./api/quoteRequestsApi.js");
  const supportApi = source("./api/supportApi.js");
  const smartMatchApi = source("./api/smartMatchApi.js");
  const combined = [quoteApi, supportApi, smartMatchApi].join("\n");

  assert.match(quoteApi, /\/api\/discovery\/quote-requests/);
  assert.match(supportApi, /\/api\/discovery\/support-requests/);
  assert.match(smartMatchApi, /\/api\/discovery\/smart-match\/search/);
  assert.doesNotMatch(combined, /\/api\/marketplace/);
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
