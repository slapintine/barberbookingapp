import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(process.cwd(), "..");

function readStyle(relativePath) {
  return fs.readFileSync(path.join(repoRoot, "frontend", "src", relativePath), "utf8");
}

test("booking primary actions keep a light foreground on purple backgrounds", () => {
  const bookingCss = readStyle(path.join("styles", "booking.css"));

  assert.match(bookingCss, /\.bk-cta-primary\s*\{[\s\S]*color:\s*#fff;/);
  assert.match(bookingCss, /\.bk-cta-primary\s*\{[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(bookingCss, /\.bk-cta-primary:hover\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(bookingCss, /\.bk-cta-primary:focus-visible,\s*[\r\n]+\.bk-cta-primary:active\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(bookingCss, /\.bk-cta-primary\.is-disabled,\s*[\r\n]+\.bk-cta-primary:disabled\s*\{[\s\S]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.82\);[\s\S]*-webkit-text-fill-color:\s*rgba\(255,\s*255,\s*255,\s*0\.82\);/);
  assert.match(bookingCss, /\.bk-cta-primary svg,\s*[\r\n]+\.bk-cta-primary \[aria-hidden="true"\]\s*\{[\s\S]*color:\s*currentColor;[\s\S]*stroke:\s*currentColor;/);

  assert.match(bookingCss, /\.booking-confirm-primary\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(bookingCss, /\.booking-confirm-primary:hover,\s*[\r\n]+\.booking-confirm-primary:focus-visible,\s*[\r\n]+\.booking-confirm-primary:active\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
});

test("Smart Match booking handoff primary buttons keep a light foreground", () => {
  const smartMatchCss = readStyle(path.join("features", "smart-match", "SmartMatchPage.css"));

  assert.match(smartMatchCss, /\.smart-match-primary-button\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(smartMatchCss, /\.smart-match-primary-button:hover,\s*[\r\n]+\.smart-match-primary-button:focus-visible,\s*[\r\n]+\.smart-match-primary-button:active\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(smartMatchCss, /\.smart-match-primary-button:disabled\s*\{[\s\S]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.82\);[\s\S]*-webkit-text-fill-color:\s*rgba\(255,\s*255,\s*255,\s*0\.82\);/);

  assert.match(smartMatchCss, /\.smart-match-result-btn\.primary\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(smartMatchCss, /\.smart-match-result-btn\.primary:hover,\s*[\r\n]+\.smart-match-result-btn\.primary:focus-visible,\s*[\r\n]+\.smart-match-result-btn\.primary:active\s*\{[\s\S]*color:\s*#fff;[\s\S]*-webkit-text-fill-color:\s*#fff;/);
  assert.match(smartMatchCss, /\.smart-match-result-btn\.primary:disabled\s*\{[\s\S]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.82\);[\s\S]*-webkit-text-fill-color:\s*rgba\(255,\s*255,\s*255,\s*0\.82\);/);
});
