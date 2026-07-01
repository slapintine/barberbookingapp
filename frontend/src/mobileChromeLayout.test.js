import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chromeCss = readFileSync(new URL("./styles/product-polish.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("mobile app chrome is safe-area aware and anchored", () => {
  assert.match(chromeCss, /@media \(max-width: 768px\)/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*var\(--device-safe-top/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*background: #2b063a !important/);
  assert.match(chromeCss, /\.bottom-nav-v4\.queless-bottom-nav[\s\S]*bottom: 0 !important/);
  assert.match(chromeCss, /\.bottom-nav-v4\.queless-bottom-nav[\s\S]*var\(--device-safe-bottom/);
  assert.match(indexHtml, /<meta name="theme-color" content="#2b063a" \/>/);
});

test("mobile reports fit filters and cards inside the viewport", () => {
  assert.match(chromeCss, /\.content-v4\.reports-page-v11[\s\S]*overflow-x: hidden !important/);
  assert.match(chromeCss, /\.reports-date-tabs-v11[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(chromeCss, /\.reports-date-tabs-v11 \.filter-btn[\s\S]*min-width: 0 !important/);
  assert.match(chromeCss, /\.reports-info-grid-v11,[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important/);
});
