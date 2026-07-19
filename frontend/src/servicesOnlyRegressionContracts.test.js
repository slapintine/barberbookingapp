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
  assert.match(standWizard, /SUPPORTED_UPLOAD_ACCEPT = "image\/png,image\/jpeg,image\/webp"/);
  assert.match(standWizard, /SUPPORTED_UPLOAD_IMAGE_TYPES = new Set\(\["image\/png", "image\/jpeg", "image\/webp"\]\)/);
  assert.doesNotMatch(standWizard, /accept="image\/\*"/);
  assert.match(profile, /sourceBarber\.cover_image_url/);
  assert.match(profile, /sourceBarber\.profile_image/);
  assert.match(profile, /buildAssetUrl\(getPortfolioImage\(item\)\)/);
  assert.match(booking, /\.map\(buildAssetUrl\)/);
});

test("product commerce modules are not part of the active frontend surface", () => {
  const app = source("./App.jsx");
  const dashboard = source("./pages/DashboardPage.jsx");
  const home = source("./pages/HomePage.jsx");
  const booking = source("./features/bookings/BookingModal.jsx");

  assert.doesNotMatch(app, /productsApi|ProductMarketplace|ProviderProduct/);
  assert.doesNotMatch(dashboard, /ProductMarketplace|ProviderProduct|productWorkspace/);
  assert.doesNotMatch(home, /ProductMarketplace|Shop from Sellers|Browse sellers|Products\s*\|/);
  assert.doesNotMatch(booking, /\bHybrid\b/);
});

test("customer homepage stays service-only and avoids unsupported ranking claims", () => {
  const home = source("./pages/HomePage.jsx");
  const modal = source("./features/barbers/BarberStandModals.jsx");

  assert.match(home, /Featured service providers/);
  assert.match(home, /Browse by Category/);
  assert.match(home, /View all services/);
  assert.match(home, /customer-home-provider-card--skeleton/);
  assert.doesNotMatch(home, /Top Providers|Trusted Providers|Verified Professionals|Product/);
  assert.doesNotMatch(modal, /Top Providers/);
});

test("owner profile view is ID-aware and routes to management actions", () => {
  const app = source("./App.jsx");
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const dashboard = source("./pages/DashboardPage.jsx");

  assert.match(app, /function isOwnedStand\(stand = \{\}, user = \{\}\)/);
  assert.match(app, /stand\?\.isOwnedByCurrentUser === true/);
  assert.match(app, /Number\(user\.id\) === Number\(stand\.owner_user_id \|\| stand\.ownerUserId \|\| stand\.userId \|\| stand\.user_id\)/);
  assert.match(app, /This is your stand\. Open your dashboard to manage bookings\./);
  assert.match(profile, /ownerUserId: sourceBarber\.ownerUserId \|\| sourceBarber\.owner_user_id/);
  assert.match(profile, /safeBarber\.isOwnedByCurrentUser === true/);
  assert.match(profile, /<FiCheckCircle size=\{12\} \/> Your stand/);
  assert.match(profile, /Manage stand/);
  assert.doesNotMatch(profile, /Owner view/);
  assert.match(app, /item\.isOwnedByCurrentUser === true \|\| item\.is_owned_by_current_user === true/);
  assert.match(app, /Promise\.allSettled\(\[\s*getBarbers\(\{ limit: 50, page: 1 \}\),\s*canLoadMine \? getMyBarberStand\(\) : Promise\.resolve\(null\),\s*\]\)/);
  assert.match(app, /providersResult\.status === "rejected" && !mine\.length/);
  assert.match(app, /providerDashboardRecoveryRef/);
  assert.match(app, /currentUser\.username}:dashboard-stand/);
  assert.match(dashboard, /We could not load your stand\./);
  assert.match(dashboard, /Your stand has not been removed\./);
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

test("logged-out booking return uses safe pending intents instead of external redirects", () => {
  const app = source("./App.jsx");
  const bookingReturn = source("./utils/bookingReturn.js");

  assert.match(app, /createPendingBookingIntent/);
  assert.match(app, /resolvePendingBookingIntent/);
  assert.match(app, /Sign in to continue booking\./);
  assert.match(bookingReturn, /isSafeInternalAppPath/);
  assert.ok(bookingReturn.includes("/^[a-z][a-z0-9+.-]*:/i.test(target)"));
  assert.doesNotMatch(app, /window\.location\.href\s*=\s*.*returnTo/);
});

test("quote request UI only submits quote-enabled services", () => {
  const quoteModal = source("./features/bookings/QuoteRequestModal.jsx");
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const app = source("./App.jsx");

  assert.match(quoteModal, /quoteServices = services\.filter/);
  assert.match(quoteModal, /initialServiceId/);
  assert.match(app, /setQuoteInitialServiceId\(service\?\.id \|\| ""\)/);
  assert.doesNotMatch(profile, /onRequestQuote\?\.\(service\) \|\| onOpenChat/);
  assert.match(profile, /selectedServiceIsQuote/);
  assert.match(profile, /<FiTag \/> Request quote/);
  assert.doesNotMatch(profile, /<FiCalendar \/> Book Service/);
});

test("portfolio viewer and service details are real accessible overlays", () => {
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const css = source("./styles/provider-profile.css");

  assert.match(profile, /role="dialog" aria-modal="true" aria-label="Portfolio image viewer"/);
  assert.match(profile, /aria-label="Close image viewer"/);
  assert.match(profile, /aria-label="Previous image"/);
  assert.match(profile, /aria-label="Next image"/);
  assert.match(profile, /event\.key === "Escape"/);
  assert.match(profile, /event\.key === "ArrowLeft"/);
  assert.match(profile, /event\.key === "ArrowRight"/);
  assert.match(profile, /document\.body\.style\.overflow = "hidden"/);
  assert.match(profile, /role="dialog" aria-modal="true" aria-labelledby="pps-service-detail-title"/);
  assert.match(css, /\.pps-lightbox\s*\{[\s\S]*env\(safe-area-inset-top/);
  assert.match(css, /\.pps-lightbox img\s*\{[\s\S]*object-fit: contain;/);
  assert.match(css, /\.pps-service-detail\s*\{[\s\S]*max-height: min\(86dvh, 760px\);/);
});

test("unverified providers never receive completed verification claims", () => {
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const badge = source("./components/ui/VerificationBadge.jsx");

  assert.match(profile, /Verification not completed/);
  assert.match(profile, /Verification under review/);
  assert.match(profile, /Verified provider/);
  assert.match(badge, /Under review/);
  assert.match(badge, /verified_status/);
  assert.doesNotMatch(profile, /ID verified,\s*background checked/);
  assert.doesNotMatch(profile, /Background checked/);
  assert.doesNotMatch(profile, /Stand details reviewed by Queless/);
});

test("Android and disposable builds can carry an explicit traceable build version", () => {
  const viteConfig = source("../vite.config.js");

  assert.match(viteConfig, /QUELESS_BUILD_VERSION/);
  assert.match(viteConfig, /VITE_BUILD_VERSION/);
  assert.match(viteConfig, /__QUELESS_BUILD_VERSION__/);
});
