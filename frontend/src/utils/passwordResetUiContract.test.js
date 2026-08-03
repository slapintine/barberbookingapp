import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("password reset UI provides email-code flow with confirmation and resend cooldown", () => {
  const authScreen = read("src/features/auth/AuthScreen.jsx");
  const app = read("src/App.jsx");
  const authApi = read("src/api/authApi.js");

  assert.match(authScreen, /Forgot password/);
  assert.match(authScreen, /Send reset code/);
  assert.match(authScreen, /Verification code/);
  assert.match(authScreen, /Confirm new password/);
  assert.match(authScreen, /Resend Code/);
  assert.match(authScreen, /Resend code in/);
  assert.match(authScreen, /setResetCooldown\(60\)/);

  assert.match(app, /Enter your registered email address\./);
  assert.match(app, /The passwords do not match\./);
  assert.match(app, /Your password has been changed\. You can now sign in\./);
  assert.match(app, /resetConfirmPasswordRef/);

  assert.match(authApi, /confirmPassword/);
  assert.match(authApi, /password-reset\/confirm/);
});

test("service image surfaces use protected overlays that do not block tapping", () => {
  const categoryServices = read("src/pages/CategoryServicesPage.jsx");
  const searchResults = read("src/pages/SearchResultsPage.jsx");
  const providerProfile = read("src/features/barbers/BarberProfileSheet.jsx");
  const serviceDiscoveryCss = read("src/styles/service-discovery.css");
  const providerProfileCss = read("src/styles/provider-profile.css");

  assert.match(categoryServices, /queless-service-media-protected/);
  assert.match(searchResults, /queless-result-media-protected/);
  assert.match(providerProfile, /pps-svc-img-overlay/);

  assert.match(serviceDiscoveryCss, /\.queless-service-media-overlay,\s*\.pps-svc-img-overlay/);
  assert.match(serviceDiscoveryCss, /pointer-events:\s*none/);
  assert.match(serviceDiscoveryCss, /linear-gradient\(to bottom,\s*rgba\(20,\s*8,\s*18,\s*0\.14\)/);
  assert.match(serviceDiscoveryCss, /\.queless-result-media-protected img/);
  assert.match(serviceDiscoveryCss, /\.queless-service-media-protected img/);
  assert.match(providerProfileCss, /\.pps-svc-cat-badge[\s\S]*z-index:\s*2/);
});
