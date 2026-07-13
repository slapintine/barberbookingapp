import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chromeCss = [
  "./styles/base.css",
  "./styles/queless-theme.css",
  "./styles/customer-home.css",
  "./styles/structure-polish.css",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainActivity = readFileSync(
  new URL("../android/app/src/main/java/org/queless/app/MainActivity.java", import.meta.url),
  "utf8"
);
const androidStyles = readFileSync(
  new URL("../android/app/src/main/res/values/styles.xml", import.meta.url),
  "utf8"
);

test("mobile app chrome is safe-area aware and anchored", () => {
  assert.match(chromeCss, /@media\s*\(max-width:/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*var\(--device-safe-top/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*background:/);
  assert.match(chromeCss, /\.bottom-nav-v4\.queless-bottom-nav[\s\S]*bottom:/);
  assert.match(chromeCss, /\.bottom-nav-v4\.queless-bottom-nav[\s\S]*var\(--device-safe-bottom/);
  assert.match(indexHtml, /<meta name="theme-color" content="#2b063a" \/>/);
});

test("Android status and navigation bars keep system icons readable", () => {
  assert.match(mainActivity, /setStatusBarColor\(Color\.parseColor\("#2B063A"\)\)/);
  assert.match(mainActivity, /setNavigationBarColor\(Color\.parseColor\("#24102F"\)\)/);
  assert.match(mainActivity, /setAppearanceLightStatusBars\(false\)/);
  assert.match(mainActivity, /setAppearanceLightNavigationBars\(false\)/);
  assert.match(androidStyles, /<item name="android:statusBarColor">#2B063A<\/item>/);
  assert.match(androidStyles, /<item name="android:navigationBarColor">#24102F<\/item>/);
  assert.match(androidStyles, /<item name="android:windowLightStatusBar">false<\/item>/);
});

test("mobile app header paints a dark safe-area strip behind Android status icons", () => {
  assert.match(chromeCss, /body::before[\s\S]*height: var\(--device-safe-top/);
  assert.match(chromeCss, /body::before[\s\S]*#2b063a/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*#2b063a/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*var\(--device-safe-top/);
});

test("mobile reports fit filters and cards inside the viewport", () => {
  assert.match(chromeCss, /\.content-v4\.reports-page-v11[\s\S]*overflow-x: hidden !important/);
  assert.match(chromeCss, /\.reports-date-tabs-v11[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(chromeCss, /\.reports-date-tabs-v11(?: \.filter-btn| button)[\s\S]*min-width:/);
  assert.match(chromeCss, /\.reports-info-grid-v11,[\s\S]*max-width: 100% !important/);
});
