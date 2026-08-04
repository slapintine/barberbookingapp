import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const coachCss = fs.readFileSync(new URL("./features/barbers/AiCoachScreen.css", import.meta.url), "utf8");

test("startup uses one original animated Queless loading experience", () => {
  assert.match(appSource, /import LoadingScreen/);
  assert.match(appSource, /const \[showInitialLoadingScreen, setShowInitialLoadingScreen\] = useState\(true\)/);
  assert.match(appSource, /setTimeout\(\(\) => setShowInitialLoadingScreen\(false\), 1800\)/);
  assert.match(appSource, /\{showInitialLoadingScreen \? <LoadingScreen \/> : null\}/);
  assert.doesNotMatch(indexSource, /queless-boot/);
  assert.match(appSource, /const \[sessionChecked, setSessionChecked\]/);
});

test("first launch requires a valid authenticated identity and never trusts a generic cached user", () => {
  assert.match(appSource, /authBootState/);
  assert.match(appSource, /hasPlausibleProductionAuthToken/);
  assert.match(appSource, /hasAuthenticatedUserIdentity/);
  assert.match(appSource, /readStoredAuthUserForBoot/);
  assert.match(appSource, /const renderScreen =\s*authBootState === "checking"/);
  assert.match(appSource, /Checking your Queless session/);
  assert.match(appSource, /const dropToGuest = \(\) => \{/);
  assert.match(appSource, /clearAuthSession\(\);[\s\S]*setCurrentUser\(null\);/);
  assert.match(appSource, /if \(hasAuthenticatedUserIdentity\(freshUser\)\)/);
  assert.doesNotMatch(appSource, /username:\s*["']user["']/i);
  assert.doesNotMatch(appSource, /role:\s*["']customer["'][\s\S]{0,80}username:\s*["']user["']/i);
});

test("Provider Coach preview CTA always has a dark Queless background", () => {
  assert.match(coachCss, /\.provider-coach-preview\s*\{[\s\S]*?--coach-plum:\s*#3b0b46/);
  assert.match(coachCss, /\.provider-coach-preview-actions \.provider-coach-primary\s*\{[\s\S]*?background:\s*linear-gradient/);
  assert.match(coachCss, /color:\s*#fffaf7\s*!important/);
});
