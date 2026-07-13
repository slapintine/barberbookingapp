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
  assert.match(overlay, /isDesktop \? <MapDashboard/);
  assert.match(overlay, /: <MobileMapView/);
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
  assert.match(css, /\.schedule-open-btn-v6 svg\s*\{[\s\S]*color: currentColor;[\s\S]*stroke: currentColor;/);
  assert.match(css, /\.light \.schedule-open-btn-v6\s*\{[\s\S]*color: #ffffff;/);
  assert.match(css, /\.schedule-open-btn-v6:focus-visible\s*\{/);
  assert.match(css, /\.schedule-open-btn-v6:disabled\s*\{/);
  assert.match(polish, /\.dark \.schedule-open-btn-v6\s*\{[\s\S]*color: #230038 !important;/);
  assert.match(polish, /\.schedule-open-btn-v6 svg\s*\{[\s\S]*stroke: currentColor !important;/);
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
