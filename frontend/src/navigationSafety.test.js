import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("provider navigation has a cream fallback and stays above the map", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./styles/navigation-safety.css", import.meta.url), "utf8");
  const openBody = app.slice(app.indexOf("const openProviderProfile"), app.indexOf("const openProviderProfile") + 1400);
  assert.match(app, /Suspense fallback={<ProviderProfileSkeleton \/>}/);
  assert.doesNotMatch(openBody, /setMapState/);
  assert.match(openBody, /providerOpenRef/);
  assert.match(css, /#fff8f4/);
  assert.match(css, /z-index: 1491/);
});

test("provider profile hides unspecified service duration", () => {
  const profile = fs.readFileSync(new URL("./features/barbers/BarberProfileSheet.jsx", import.meta.url), "utf8");
  assert.match(profile, /if \(!Number\.isFinite\(m\) \|\| m <= 0\) return ""/);
  assert.match(profile, /\{duration && <span className="pps-svc-duration">/);
});

test("map navigation opens Smart Match instead of only closing the map", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const navigateFromMap = app.slice(app.indexOf("const navigateFromMap"), app.indexOf("const navigateFromMap") + 1000);
  assert.match(navigateFromMap, /target === "smart-match"/);
  assert.match(navigateFromMap, /openSmartMatch\(/);
  assert.match(app, /window\.history\.pushState\(\{\}, "", appPath\(SMART_MATCH_PATH\)\)/);
});

test("map overlay uses purpose-built desktop and mobile layouts", () => {
  const overlay = fs.readFileSync(new URL("./components/service-discovery/ProviderDiscoveryMapOverlay.jsx", import.meta.url), "utf8");
  assert.match(overlay, /min-width: 900px/);
  assert.match(overlay, /lazy\(\(\) => import\("\.\/MapDashboard\.jsx"\)\)/);
  assert.match(overlay, /lazy\(\(\) => import\("\.\/MobileMapView\.jsx"\)\)/);
  assert.match(overlay, /isDesktop \? <MapDashboard/);
  assert.match(overlay, /: <MobileMapView/);
});

test("map pages keep headers and escape controls above the map canvas", () => {
  const desktopMap = fs.readFileSync(new URL("./components/service-discovery/MapDashboard.jsx", import.meta.url), "utf8");
  const desktopCss = fs.readFileSync(new URL("./components/service-discovery/MapDashboard.css", import.meta.url), "utf8");
  const mobileMap = fs.readFileSync(new URL("./components/service-discovery/MobileMapView.jsx", import.meta.url), "utf8");
  const mobileCss = fs.readFileSync(new URL("./components/service-discovery/MobileMapView.css", import.meta.url), "utf8");

  assert.match(desktopMap, /data-testid="desktop-map-header"/);
  assert.match(desktopMap, /Services near you/);
  assert.match(desktopMap, /aria-label="Close map"/);
  assert.match(desktopCss, /\.qmd\s*\{[\s\S]*height: 100dvh;/);
  assert.match(desktopCss, /\.qmd-main\s*\{[\s\S]*env\(safe-area-inset-top, 0px\)/);
  assert.match(desktopCss, /\.qmd-page-title/);

  assert.match(mobileMap, /data-testid="mobile-map-header"/);
  assert.match(mobileMap, /Services near you/);
  assert.match(mobileMap, /aria-label="Back"/);
  assert.match(mobileMap, /aria-label="Close map"/);
  assert.match(mobileCss, /\.qmm\s*\{[\s\S]*height: 100dvh;/);
  assert.match(mobileCss, /--qmm-safe-top:\s*max\(0px, env\(safe-area-inset-top, 0px\)\);/);
  assert.match(mobileCss, /\.qmm-header\s*\{[\s\S]*z-index: 130;/);
  assert.match(mobileCss, /\.qmm-body\s*\{[\s\S]*min-height: 0;/);
  assert.match(mobileCss, /\.qmm-map-zone\s*\{[\s\S]*42dvh/);
  assert.match(mobileCss, /\.qmm-sheet\s*\{[\s\S]*100dvh/);
  assert.doesNotMatch(mobileMap, /<img src=\{quelessLogoFull\}/);
});

test("map and Smart Match controls have real handlers", () => {
  const desktopMap = fs.readFileSync(new URL("./components/service-discovery/MapDashboard.jsx", import.meta.url), "utf8");
  const mobileMap = fs.readFileSync(new URL("./components/service-discovery/MobileMapView.jsx", import.meta.url), "utf8");
  const smartMatch = fs.readFileSync(new URL("./features/smart-match/SmartMatchPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(desktopMap, /window\.prompt/);
  assert.match(desktopMap, /onSubmit=\{submitLocation\}/);
  assert.doesNotMatch(mobileMap, /Top rated/);
  assert.doesNotMatch(mobileMap, /setActiveCategoryIcon\(\(prev\) => prev\)/);
  assert.match(mobileMap, /setOpenNowOnly\(\(active\) => !active\)/);
  assert.match(mobileMap, /We couldn't load providers/);
  assert.match(smartMatch, /onClick=\{\(\) => setShowHelp/);
  assert.match(smartMatch, /onClick=\{loadMatches\}/);
});

test("admin reason capture uses an in-app confirmation field", () => {
  const admin = fs.readFileSync(new URL("./pages/AdminPanel.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(admin, /window\.prompt/);
  assert.match(admin, /Reason shown to provider/);
  assert.match(admin, /<textarea/);
});

test("provider dashboard wires schedule workspace without a missing lazy boundary", () => {
  const dashboard = fs.readFileSync(new URL("./pages/DashboardPage.jsx", import.meta.url), "utf8");
  const schedule = fs.readFileSync(new URL("./features/barbers/ScheduleWorkspace.jsx", import.meta.url), "utf8");
  assert.match(dashboard, /import ScheduleWorkspace from "\.\.\/features\/barbers\/ScheduleWorkspace\.jsx"/);
  assert.doesNotMatch(dashboard, /lazy\(\(\) => import\("\.\.\/features\/barbers\/ScheduleWorkspace\.jsx"\)\)/);
  assert.match(dashboard, /<ScheduleWorkspace/);
  assert.match(schedule, /Open Schedule/);
});

test("Open Schedule action keeps visible icon and interaction states", () => {
  const schedule = fs.readFileSync(new URL("./features/barbers/ScheduleWorkspace.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./styles/schedule.css", import.meta.url), "utf8");
  const polish = fs.readFileSync(new URL("./styles/structure-polish.css", import.meta.url), "utf8");
  assert.match(schedule, /className="primary-btn-v4 schedule-open-btn-v6"/);
  assert.match(schedule, /<FiCalendar aria-hidden="true" \/> Open Schedule/);
  assert.match(schedule, /aria-label="Back from schedule"/);
  assert.match(schedule, /aria-label="Close schedule"/);
  assert.match(schedule, /quelessScheduleOpen/);
  assert.match(schedule, /document\.body\.dataset\.quelessScheduleOpen = "true"/);
  assert.match(schedule, /window\.addEventListener\("queless:native-back"/);
  assert.match(schedule, /window\.history\.back\(\)/);
  assert.match(css, /\.schedule-open-btn-v6 svg\s*\{[\s\S]*color: currentColor;[\s\S]*stroke: currentColor;/);
  assert.match(css, /\.light \.schedule-open-btn-v6\s*\{[\s\S]*color: #ffffff;/);
  assert.match(css, /\.schedule-open-btn-v6:focus-visible\s*\{/);
  assert.match(css, /\.schedule-open-btn-v6:disabled\s*\{/);
  assert.match(css, /\.barber-schedule-sheet-v6\s*\{[\s\S]*height: 100dvh;/);
  assert.match(css, /\.barber-schedule-sheet-v6\s*\{[\s\S]*--schedule-sheet-safe-top: max\(10px, env\(safe-area-inset-top, 0px\)\);/);
  assert.match(css, /\.barber-schedule-card-v6\s*\{[\s\S]*max-height: calc\(100dvh - var\(--schedule-sheet-safe-top\) - var\(--schedule-sheet-safe-bottom\)\);/);
  assert.match(css, /\.barber-schedule-card-v6 \.barber-profile-topbar-v4\s*\{[\s\S]*position: sticky;/);
  assert.match(css, /\.schedule-workspace-shell-v7\s*\{[\s\S]*overflow-y: auto;/);
  assert.match(polish, /\.dark \.schedule-open-btn-v6\s*\{[\s\S]*color: #230038 !important;/);
  assert.match(polish, /\.schedule-open-btn-v6 svg\s*\{[\s\S]*stroke: currentColor !important;/);
  assert.match(polish, /\.barber-schedule-sheet-v6\.open\s*\{[\s\S]*z-index: 1902 !important;/);
});

test("Android hardware back closes the schedule sheet before leaving the app", () => {
  const mainActivity = fs.readFileSync(new URL("./../android/app/src/main/java/org/queless/app/MainActivity.java", import.meta.url), "utf8");
  assert.match(mainActivity, /installScheduleBackHandler\(\)/);
  assert.match(mainActivity, /OnBackPressedCallback\(true\)/);
  assert.match(mainActivity, /dataset\.quelessScheduleOpen/);
  assert.match(mainActivity, /queless:native-back/);
  assert.match(mainActivity, /return 'handled'/);
});

test("Android hardware back closes the map overlay before leaving the app", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const mainActivity = fs.readFileSync(new URL("./../android/app/src/main/java/org/queless/app/MainActivity.java", import.meta.url), "utf8");
  assert.match(app, /document\.body\.dataset\.quelessMapOpen = "true"/);
  assert.match(app, /window\.addEventListener\("queless:native-back", handleNativeBack\)/);
  assert.match(mainActivity, /dataset\.quelessMapOpen/);
  assert.match(mainActivity, /queless:native-back/);
});

test("light mode icons use semantic visible tokens instead of inherited pale text", () => {
  const theme = fs.readFileSync(new URL("./styles/queless-theme.css", import.meta.url), "utf8");
  const base = fs.readFileSync(new URL("./styles/base.css", import.meta.url), "utf8");
  assert.match(theme, /--icon-primary: #4B146F;/);
  assert.match(theme, /--icon-navigation: #4B235F;/);
  assert.match(theme, /--icon-disabled: rgba\(75, 35, 95, 0\.46\);/);
  assert.match(base, /\.light \.secondary-btn-v4 svg,[\s\S]*color: var\(--icon-secondary\);/);
  assert.match(base, /\.light \.nav-v4\s*\{[\s\S]*color: var\(--icon-navigation\);/);
});

test("bottom nav only hides for overlays that can actually render", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(app, /const isEditStandOverlayOpen = showEditBarber && Boolean\(myBarberProfile\)/);
  assert.match(app, /const isBookingOverlayOpen = showBookingModal && Boolean\(selectedBarber\)/);
  assert.match(app, /isOverlayOpen=\{isAppOverlayOpen\}/);
  assert.doesNotMatch(app, /isOverlayOpen=\{activeTab === "upgrade" \|\| showTrialUpgradeScreen/);
});

test("anonymous users can browse service discovery while private routes stay protected", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const screenFromPath = app.slice(app.indexOf("function getScreenFromPath"), app.indexOf("function getAuthModeFromPath"));
  const tabFromPath = app.slice(app.indexOf("function getTabFromPath"), app.indexOf("function isAuthRoutePath"));

  assert.match(screenFromPath, /const isPublicBrowsePath =/);
  assert.match(screenFromPath, /normalized === SERVICES_PATH/);
  assert.match(screenFromPath, /normalized === CATEGORIES_PATH/);
  assert.match(screenFromPath, /normalized === MAP_PATH/);
  assert.match(screenFromPath, /if \(isPublicBrowsePath\) \{\s*return "app";\s*\}/);
  assert.match(screenFromPath, /normalized === BOOKINGS_PATH[\s\S]*return hasToken \? "app" : "login";/);
  assert.match(screenFromPath, /normalized === DASHBOARD_PATH[\s\S]*return hasToken \? "app" : "login";/);
  assert.match(screenFromPath, /normalized === PROFILE_PATH[\s\S]*return hasToken \? "app" : "login";/);
  assert.match(tabFromPath, /if \(normalized === SERVICES_PATH\) return "searchResults";/);
});

test("anonymous provider and service details stay browseable but booking actions require login", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("./features/barbers/BarberProfileSheet.jsx", import.meta.url), "utf8");
  const openProviderProfile = app.slice(app.indexOf("const openProviderProfile"), app.indexOf("const openProviderProfile") + 900);
  const bookingAction = app.slice(app.indexOf("onBook={(service) =>"), app.indexOf("onRequestQuote={(service) =>"));

  assert.doesNotMatch(openProviderProfile, /setScreen\("login"\)|LOGIN_PATH|setAuthMode\("login"\)/);
  assert.match(openProviderProfile, /setSelectedBarber\(provider\)/);
  assert.match(profile, /pps-service-detail/);
  assert.match(profile, /setSelectedService/);
  assert.match(bookingAction, /if \(!currentUser\?\.username\)/);
  assert.match(bookingAction, /setAuthError\("Sign in to continue booking\."\)/);
  assert.match(bookingAction, /window\.history\.replaceState\(\{\}, "", appPath\(LOGIN_PATH\)\)/);
});

test("auth screens avoid mobile horizontal overflow contracts", () => {
  const authCss = fs.readFileSync(new URL("./styles/auth-redesign.css", import.meta.url), "utf8");
  assert.doesNotMatch(authCss, /100vw/);
  assert.match(authCss, /\.app-wrap-v4\.app-auth-v4\s*\{[\s\S]*width: 100% !important;/);
  assert.match(authCss, /\.phone-frame-v4\.phone-frame-auth-v4\s*\{[\s\S]*overflow-x: clip !important;/);
  assert.match(authCss, /\.screen-v4\.screen-auth-v4\s*\{[\s\S]*overflow-x: clip !important;/);
  assert.match(authCss, /@media \(max-width: 480px\)[\s\S]*\.lineup-auth-page,[\s\S]*width: 100% !important;/);
  assert.match(authCss, /@media \(max-width: 480px\)[\s\S]*\.lineup-auth-shell,[\s\S]*width: 100% !important;/);
});

test("profile logout does not surface the click event as an auth error", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("./pages/ProfilePage.jsx", import.meta.url), "utf8");

  assert.match(app, /const authMessage = typeof message === "string" \? message : ""/);
  assert.doesNotMatch(profile, /onClick=\{logout\}/);
  assert.match(profile, /onClick=\{\(\) => logout\(\)\}/);
});
