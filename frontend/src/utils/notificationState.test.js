import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBrowserNotificationState } from "./notificationState.js";

test("maps browser notification permissions without guessing backend state", () => {
  assert.equal(getBrowserNotificationState({ hasNotification: false }), "unsupported");
  assert.equal(getBrowserNotificationState({ hasNotification: true, hasServiceWorker: false }), "unsupported");
  assert.equal(getBrowserNotificationState({
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: false,
  }), "unsupported");
  assert.equal(getBrowserNotificationState({
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    permission: "denied",
  }), "denied");
  assert.equal(getBrowserNotificationState({
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    permission: "granted",
  }), "granted");
  assert.equal(getBrowserNotificationState({
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    permission: "default",
  }), "default");
});

test("supports native Android push with honest user-facing settings states", () => {
  const pushSource = fs.readFileSync(new URL("../pushNotifications.js", import.meta.url), "utf8");
  const settingsSource = fs.readFileSync(
    new URL("../features/notifications/PushNotificationSettings.jsx", import.meta.url),
    "utf8"
  );
  const profileStyles = fs.readFileSync(new URL("../styles/home-profile.css", import.meta.url), "utf8");
  const customerHomeStyles = fs.readFileSync(new URL("../styles/customer-home.css", import.meta.url), "utf8");
  const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

  assert.match(pushSource, /import\("@capacitor\/push-notifications"\)/);
  assert.match(pushSource, /plugin: module\.PushNotifications \|\| null/);
  assert.doesNotMatch(pushSource, /then\(\(module\) => module\.PushNotifications \|\| null\)/);
  assert.match(pushSource, /PushNotifications\.requestPermissions\(\)/);
  assert.match(pushSource, /PushNotifications\.register\(\)/);
  assert.match(pushSource, /registerTokenWithBackend\(token/);
  assert.match(pushSource, /disableFirebaseNotifications/);
  assert.match(pushSource, /getNativeNotificationPermissionState/);
  assert.match(pushSource, /unregister-token/);
  assert.match(pushSource, /openPhoneNotificationSettings/);
  assert.match(pushSource, /QuelessNotificationSettings/);
  assert.match(pushSource, /platform: nativePlatformLabel\(\)/);
  assert.match(pushSource, /pushNotificationReceived/);
  assert.match(pushSource, /pushNotificationActionPerformed/);
  assert.match(pushSource, /queless:push-open/);
  assert.match(pushSource, /queless-booking-updates/);
  assert.match(pushSource, /return "setup_missing";/);
  assert.match(pushSource, /getStoredPushToken\(\) \? "granted" : "default"/);

  assert.match(settingsSource, /Phone notifications are on/);
  assert.match(settingsSource, /Phone notifications are off/);
  assert.match(settingsSource, /Turn off phone notifications/);
  assert.match(settingsSource, /getNativeNotificationPermissionState/);
  assert.match(settingsSource, /getStoredPushToken/);
  assert.match(settingsSource, /getNotificationTokenStatusRequest/);
  assert.match(settingsSource, /disableFirebaseNotifications/);
  assert.match(settingsSource, /Your updates are still available under the notification bell|IN_APP_NOTE/);
  assert.match(profileStyles, /\.push-settings-v1/);
  assert.match(profileStyles, /\.queless-switch-v1/);
  assert.match(profileStyles, /\.push-settings-actions-v1/);
  assert.match(customerHomeStyles, /bottom:\s*calc\(8px \+ var\(--device-safe-bottom/);

  assert.match(appSource, /queless:push-open/);
  assert.match(appSource, /handleNativePushOpen/);
  assert.match(appSource, /disableFirebaseNotifications\(\)\.catch/);
});
