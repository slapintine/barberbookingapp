import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chromeCss = [
  "./styles/queless-theme.css",
  "./styles/customer-home.css",
  "./styles/structure-polish.css",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("mobile app chrome is safe-area aware and anchored", () => {
  assert.match(chromeCss, /@media\s*\(max-width:/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*var\(--device-safe-top/);
  assert.match(chromeCss, /\.header-v4\.queless-app-header[\s\S]*background:/);
  assert.match(chromeCss, /\.bottom-nav-v4\.queless-bottom-nav[\s\S]*bottom:/);
  assert.match(chromeCss, /\.bottom-nav-v4\.queless-bottom-nav[\s\S]*var\(--device-safe-bottom/);
  assert.match(indexHtml, /<meta name="theme-color" content="#2b063a" \/>/);
});

test("mobile reports fit filters and cards inside the viewport", () => {
  assert.match(chromeCss, /\.content-v4\.reports-page-v11[\s\S]*overflow-x: hidden !important/);
  assert.match(chromeCss, /\.reports-date-tabs-v11[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(chromeCss, /\.reports-date-tabs-v11(?: \.filter-btn| button)[\s\S]*min-width:/);
  assert.match(chromeCss, /\.reports-info-grid-v11,[\s\S]*max-width: 100% !important/);
});
