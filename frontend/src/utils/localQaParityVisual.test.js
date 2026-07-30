import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

const repoRoot = path.resolve(process.cwd(), "..");

test("customer home keeps the real-app benchmark copy for Local QA parity", () => {
  const homePage = fs.readFileSync(path.join(repoRoot, "frontend", "src", "pages", "HomePage.jsx"), "utf8");
  const homeCss = fs.readFileSync(path.join(repoRoot, "frontend", "src", "styles", "customer-home.css"), "utf8");

  assert.match(homePage, />\s*Find services\s*</);
  assert.match(homePage, /title="Featured service providers"/);
  assert.doesNotMatch(homePage, /Trusted local services/);
  assert.doesNotMatch(homePage, />\s*Find Services\s*</);
  assert.doesNotMatch(homePage, /title="Top Providers"/);
  assert.match(homeCss, /\.customer-home-eyebrow\s*{\s*display:\s*none;/);
  assert.match(homeCss, /\.customer-home-search-btn\.smart\s*{[^}]*var\(--qh-secondary\)[^}]*var\(--qh-primary\)/s);
});

test("customer bookings imports the Queless tab styling", () => {
  const appCss = fs.readFileSync(path.join(repoRoot, "frontend", "src", "App.css"), "utf8");
  const bookingsCss = fs.readFileSync(path.join(repoRoot, "frontend", "src", "styles", "bookings-tabs.css"), "utf8");
  const bookingsPage = fs.readFileSync(path.join(repoRoot, "frontend", "src", "pages", "BookingsPage.jsx"), "utf8");

  assert.match(appCss, /@import "\.\/styles\/bookings-tabs\.css";/);
  assert.match(bookingsCss, /\.bookings-tabs-v6\s*{/);
  assert.match(bookingsCss, /\.bookings-tab-v6\.active\s*{[^}]*color:\s*#fff;/s);
  assert.match(bookingsPage, /className=\{activeTab === tab\.id \? "bookings-tab-v6 active" : "bookings-tab-v6"\}/);
});

test("Android system bars match the installed real-app visual benchmark", () => {
  const styles = fs.readFileSync(
    path.join(repoRoot, "android", "android", "app", "src", "main", "res", "values", "styles.xml"),
    "utf8"
  );
  const mainActivity = fs.readFileSync(
    path.join(repoRoot, "android", "android", "app", "src", "main", "java", "org", "queless", "app", "MainActivity.java"),
    "utf8"
  );

  assert.match(styles, /<item name="android:windowLightStatusBar">true<\/item>/);
  assert.match(styles, /<item name="android:windowLightNavigationBar">true<\/item>/);
  assert.match(mainActivity, /controller\.setAppearanceLightStatusBars\(true\)/);
  assert.match(mainActivity, /controller\.setAppearanceLightNavigationBars\(true\)/);
});
