import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("service cards open a reusable service details modal without replacing portfolio viewing", () => {
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const serviceModal = source("./components/ui/ServiceDetailsModal.jsx");

  assert.match(profile, /import ServiceDetailsModal/);
  assert.match(profile, /<ServiceDetailsModal/);
  assert.match(serviceModal, /export default function ServiceDetailsModal/);
  assert.match(profile, /data-testid="service-card"/);
  assert.match(profile, /onOpenDetails=\{openServiceDetails\}/);
  assert.match(profile, /event\.stopPropagation\(\); handleAction\(\);/);
  assert.match(profile, /unavailable\s*\?\s*\["Currently unavailable"\]/);
  assert.match(profile, /<PortfolioLightbox/);
  assert.doesNotMatch(serviceModal, /PortfolioLightbox/);
});

test("service details modal exposes accessible dialog, focus, Escape, native Back, and scroll restoration", () => {
  const serviceModal = source("./components/ui/ServiceDetailsModal.jsx");
  const css = source("./components/ui/ServiceDetailsModal.css");
  const mainActivity = source("./../android/app/src/main/java/org/queless/app/MainActivity.java");

  assert.match(serviceModal, /role="dialog"/);
  assert.match(serviceModal, /aria-modal="true"/);
  assert.match(serviceModal, /aria-labelledby="ql-service-details-title"/);
  assert.match(serviceModal, /aria-label="Close service details"/);
  assert.match(serviceModal, /document\.body\.dataset\.quelessServiceDetailsOpen = "true"/);
  assert.match(serviceModal, /window\.addEventListener\("queless:native-back", closeModal\)/);
  assert.match(serviceModal, /event\.key === "Escape"/);
  assert.match(serviceModal, /event\.key === "Tab"/);
  assert.match(serviceModal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(serviceModal, /window\.scrollTo\(scrollPositionRef\.current\.x, scrollPositionRef\.current\.y\)/);
  assert.match(serviceModal, /returnFocusTarget \|\| previousFocusRef\.current/);
  assert.match(mainActivity, /dataset\.quelessServiceDetailsOpen/);
  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
});

test("service details modal uses real service data and safe price and duration formatting", () => {
  const serviceModal = source("./components/ui/ServiceDetailsModal.jsx");
  const catalog = source("./utils/serviceCatalog.js");

  assert.match(serviceModal, /formatServicePrice\(service\)/);
  assert.match(catalog, /if \(pricingType === "quote"\) return "Request quote"/);
  assert.match(catalog, /return money\(service\.price_extra \?\? service\.price \?\? service\.extra\) \|\| "Request quote"/);
  assert.match(serviceModal, /Book this service/);
  assert.match(serviceModal, /Request Quote/);
  assert.match(serviceModal, /Currently unavailable/);
  assert.match(serviceModal, /formatServiceDuration/);
  assert.match(serviceModal, /if \(!Number\.isFinite\(total\) \|\| total <= 0\) return ""/);
  assert.doesNotMatch(serviceModal, /UGX 0/);
});

test("service details modal keeps service imagery separate from portfolio imagery", () => {
  const serviceModal = source("./components/ui/ServiceDetailsModal.jsx");
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const portfolio = source("./components/ui/PortfolioLightbox.jsx");

  assert.match(serviceModal, /service\.image/);
  assert.match(serviceModal, /service\.image_url/);
  assert.match(serviceModal, /service\.service_image/);
  assert.match(serviceModal, /Service image unavailable/);
  assert.match(profile, /portfolioLightboxItems = safeBarber\.portfolio/);
  assert.match(portfolio, /Portfolio image/);
  assert.doesNotMatch(serviceModal, /safeBarber\.portfolio/);
});

test("service details actions preserve booking and quote service context", () => {
  const serviceModal = source("./components/ui/ServiceDetailsModal.jsx");

  assert.match(serviceModal, /onBook\?\.\(service\)/);
  assert.match(serviceModal, /onRequestQuote\?\.\(service\)/);
  assert.match(serviceModal, /onManageStand/);
  assert.match(serviceModal, /currentUserIsBarber/);
  assert.match(serviceModal, /Provider accounts cannot book customer services/);
  assert.match(serviceModal, /disabled/);
});

test("service details modal supports light, dark, mobile safe areas, and reduced motion", () => {
  const css = source("./components/ui/ServiceDetailsModal.css");

  assert.match(css, /\.ql-service-details__panel/);
  assert.match(css, /object-fit: contain;/);
  assert.match(css, /\.dark \.ql-service-details__panel/);
  assert.match(css, /body\[data-theme="dark"\] \.ql-service-details__panel/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /user-select: text;/);
  assert.match(css, /:focus-visible/);
});

test("service imagery uses a protected overlay without blocking foreground actions", () => {
  const profile = source("./features/barbers/BarberProfileSheet.jsx");
  const serviceModal = source("./components/ui/ServiceDetailsModal.jsx");
  const modalCss = source("./components/ui/ServiceDetailsModal.css");
  const discovery = source("./pages/CategoryServicesPage.jsx");
  const results = source("./pages/SearchResultsPage.jsx");
  const discoveryCss = source("./styles/service-discovery.css");
  const profileCss = source("./styles/provider-profile.css");

  assert.match(profile, /pps-svc-img-overlay/);
  assert.match(serviceModal, /ql-service-details__media-overlay/);
  assert.match(discovery, /queless-service-media-protected/);
  assert.match(results, /queless-result-media-protected/);
  assert.match(modalCss, /\.ql-service-details__media-overlay\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(discoveryCss, /\.queless-service-media-overlay\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(profileCss, /\.pps-svc-img-overlay\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(modalCss, /linear-gradient\(to bottom, rgba\(20, 8, 18, 0\.08\)/);
  assert.match(discoveryCss, /linear-gradient\(to bottom, rgba\(20, 8, 18, 0\.12\)/);
  assert.match(profileCss, /linear-gradient\(to bottom, rgba\(20, 8, 18, 0\.12\)/);
  assert.match(profileCss, /\.pps-svc-cat-badge\s*\{[\s\S]*z-index:\s*2;/);
});
