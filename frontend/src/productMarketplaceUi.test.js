import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const wizard = source("./features/barbers/BarberStandModals.jsx");
const dashboard = source("./pages/DashboardPage.jsx");
const home = source("./pages/HomePage.jsx");
const app = source("./App.jsx");
const bottomNav = source("./components/ui/BottomNav.jsx");
const providerProfile = source("./features/barbers/BarberProfileSheet.jsx");

test("stand setup uses marketplace_mode and keeps legacy stand_type separate", () => {
  assert.match(wizard, /name="marketplaceMode"/);
  assert.match(wizard, /marketplaceMode:\s*value/);
  assert.match(wizard, /name="standType"/);
  assert.match(wizard, /productOnly \? \[1, 2, 4, 6\]/);
});

test("shop setup hides booking-only steps and requires fulfilment and products", () => {
  assert.match(wizard, /\{serviceStand \? <><div className="business-field-grid-v10 two-v10">/);
  assert.match(wizard, /currentStep === 4 && productOnly/);
  assert.match(wizard, /Choose at least one way customers can receive products/);
  assert.match(wizard, /At least one active product is required/);
});

test("dashboard separates schedules from product orders", () => {
  assert.match(dashboard, /\{serviceStand \? \(\s*<ScheduleWorkspace/);
  assert.match(dashboard, /\{shopStand \? \(\s*<ProviderProductWorkspace/);
  assert.match(dashboard, /Recent booking activity/);
});

test("customer home separates service discovery from product requests", () => {
  assert.match(home, /Book Services/);
  assert.match(home, /Shop from Sellers/);
  assert.match(home, /Products listed by local businesses/);
  assert.match(home, /<ProductMarketplacePanel[\s\S]*currentUser=\{currentUser\}[\s\S]*shopStands=\{filteredBarbers\}/);
  assert.match(app, /syncStagedStandProducts\(payload\)[\s\S]*publishMyBarberStand/);
});

test("seller marketplace copy and empty states never imply Queless owns inventory", () => {
  const marketplace = source("./features/products/ProductMarketplacePanel.jsx");
  const styles = source("./styles/product-marketplace.css");
  assert.match(marketplace, /Shop Stands are almost ready/);
  assert.match(marketplace, /No shop stands yet/);
  assert.match(marketplace, /Local businesses will appear here once they publish products/);
  assert.match(marketplace, /Browse Shop Stands/);
  assert.match(marketplace, /Visit shop stand/);
  assert.doesNotMatch(marketplace, /Shop Products is coming soon/);
  assert.match(styles, /\.marketplace-mode-options-v21[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(min-width: 700px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("global provider navigation uses Orders and Products only for product-only stands", () => {
  assert.match(bottomNav, /isProductOnlyProvider/);
  assert.match(bottomNav, /<span>Orders<\/span>/);
  assert.match(bottomNav, /isProductOnlyProvider \? "Products" : "Dashboard"/);
  assert.match(bottomNav, /<span>Bookings<\/span>/);
  assert.match(app, /onOpenProviderDashboardSection/);
});

test("public provider CTAs keep product orders separate from service bookings", () => {
  assert.match(providerProfile, /const serviceStand = supportsServices\(barber\)/);
  assert.match(providerProfile, /const shopStand = supportsProducts\(barber\)/);
  assert.match(providerProfile, /\{serviceStand && !currentUserIsBarber && safeBarber\.services\.length > 0 && \(/);
  assert.match(providerProfile, /\{shopStand && !currentUserIsBarber \? \(/);
  assert.match(providerProfile, /\{serviceStand \? <><div className="pps-info-row">/);
});

test("closed product forms normalize null safely", () => {
  const editor = source("./features/products/ProductCatalogueEditor.jsx");
  assert.match(editor, /product = product && typeof product === "object" \? product : \{\}/);
});
