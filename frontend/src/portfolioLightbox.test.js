import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("portfolio images use one reusable full-screen viewer", () => {
  const viewer = fs.readFileSync(new URL("./components/ui/PortfolioLightbox.jsx", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("./features/barbers/BarberProfileSheet.jsx", import.meta.url), "utf8");
  const booking = fs.readFileSync(new URL("./features/bookings/BookingModal.jsx", import.meta.url), "utf8");

  assert.match(profile, /import PortfolioLightbox/);
  assert.match(booking, /import PortfolioLightbox/);
  assert.match(profile, /<PortfolioLightbox/);
  assert.match(booking, /<PortfolioLightbox/);
  assert.doesNotMatch(profile, /className="pps-lightbox"/);
  assert.doesNotMatch(booking, /className="bk-lightbox"/);
  assert.match(viewer, /data-testid="portfolio-lightbox"/);
  assert.match(viewer, /role="dialog"/);
  assert.match(viewer, /aria-modal="true"/);
});

test("portfolio viewer opens the selected image and excludes unrelated images", () => {
  const profile = fs.readFileSync(new URL("./features/barbers/BarberProfileSheet.jsx", import.meta.url), "utf8");
  const booking = fs.readFileSync(new URL("./features/bookings/BookingModal.jsx", import.meta.url), "utf8");

  assert.match(profile, /portfolioLightboxItems = safeBarber\.portfolio/);
  assert.match(profile, /\.filter\(\(item\) => item\.src\)/);
  assert.match(profile, /openPortfolioLightbox\(i, event\)/);
  assert.match(profile, /data-testid="portfolio-thumbnail"/);
  assert.match(booking, /workLightboxItems = workImages\.map/);
  assert.match(booking, /setLightboxIndex\(index\)/);
  assert.match(booking, /data-testid="booking-portfolio-thumbnail"/);
});

test("portfolio viewer supports close, keyboard navigation, swipe, and native Back", () => {
  const viewer = fs.readFileSync(new URL("./components/ui/PortfolioLightbox.jsx", import.meta.url), "utf8");
  const mainActivity = fs.readFileSync(new URL("./../android/app/src/main/java/org/queless/app/MainActivity.java", import.meta.url), "utf8");

  assert.match(viewer, /aria-label="Close image viewer"/);
  assert.match(viewer, /aria-label="Previous portfolio image"/);
  assert.match(viewer, /aria-label="Next portfolio image"/);
  assert.match(viewer, /event\.key === "Escape"/);
  assert.match(viewer, /event\.key === "ArrowLeft"/);
  assert.match(viewer, /event\.key === "ArrowRight"/);
  assert.match(viewer, /onTouchStart=\{handleTouchStart\}/);
  assert.match(viewer, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(viewer, /window\.addEventListener\("queless:native-back", closeViewer\)/);
  assert.match(viewer, /document\.body\.dataset\.quelessPortfolioLightboxOpen = "true"/);
  assert.match(mainActivity, /dataset\.quelessPortfolioLightboxOpen/);
});

test("portfolio viewer locks scroll, restores focus and scroll position, and handles broken images", () => {
  const viewer = fs.readFileSync(new URL("./components/ui/PortfolioLightbox.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./components/ui/PortfolioLightbox.css", import.meta.url), "utf8");

  assert.match(viewer, /document\.body\.style\.overflow = "hidden"/);
  assert.match(viewer, /window\.scrollTo\(scrollPositionRef\.current\.x, scrollPositionRef\.current\.y\)/);
  assert.match(viewer, /const returnFocusTarget = returnFocusRef\?\.current \|\| null/);
  assert.match(viewer, /returnFocusTarget \|\| previousFocusRef\.current/);
  assert.match(viewer, /onError=\{\(\) => setImageState\(\{ src: activeItem\.src, status: "error" \}\)\}/);
  assert.match(viewer, /Image unavailable/);
  assert.match(css, /object-fit: contain;/);
  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
