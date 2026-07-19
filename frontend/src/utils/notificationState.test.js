import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBrowserNotificationState } from "./notificationState.js";

test("maps browser notification permissions without guessing backend state", () => {
  const supported = { hasNotification: true, hasServiceWorker: true, hasPushManager: true };
  assert.equal(getBrowserNotificationState({ ...supported, permission: "default" }), "default");
  assert.equal(getBrowserNotificationState({ ...supported, permission: "granted" }), "granted");
  assert.equal(getBrowserNotificationState({ ...supported, permission: "denied" }), "denied");
});

test("reports unsupported devices explicitly", () => {
  const supported = { hasNotification: true, hasServiceWorker: true, hasPushManager: true };
  assert.equal(getBrowserNotificationState({ ...supported, hasNotification: false }), "unsupported");
  assert.equal(getBrowserNotificationState({ ...supported, hasServiceWorker: false }), "unsupported");
  assert.equal(getBrowserNotificationState({ ...supported, hasPushManager: false }), "unsupported");
});

test("supports native Android push with honest user-facing settings states", () => {
  const pushSource = fs.readFileSync(new URL("../pushNotifications.js", import.meta.url), "utf8");
  const settingsSource = fs.readFileSync(
    new URL("../features/notifications/PushNotificationSettings.jsx", import.meta.url),
    "utf8"
  );
  const manifestSource = fs.readFileSync(
    new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url),
    "utf8"
  );
  const stringsSource = fs.readFileSync(
    new URL("../../android/app/src/main/res/values/strings.xml", import.meta.url),
    "utf8"
  );
  const mainActivitySource = fs.readFileSync(
    new URL("../../android/app/src/main/java/org/queless/app/MainActivity.java", import.meta.url),
    "utf8"
  );
  const nativeSettingsSource = fs.readFileSync(
    new URL("../../android/app/src/main/java/org/queless/app/QuelessNotificationSettingsPlugin.java", import.meta.url),
    "utf8"
  );

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
  assert.match(settingsSource, /Open phone settings/);
  assert.match(settingsSource, /getNativeNotificationPermissionState/);
  assert.match(settingsSource, /visibilitychange/);
  assert.match(settingsSource, /getNotificationTokenStatusRequest/);
  assert.match(settingsSource, /disableFirebaseNotifications/);
  assert.match(settingsSource, /Your updates are still available under the notification bell|IN_APP_NOTE/);
  const visibleSettingsText = [...settingsSource.matchAll(
    /(?:title|description):\s*"([^"]+)"|setMessage\("([^"]+)"|onToast\?\.\("([^"]+)",\s*"([^"]+)"/g
  )]
    .flatMap((match) => match.slice(1).filter(Boolean))
    .join(" ");
  assert.doesNotMatch(visibleSettingsText, /Firebase|FCM|token registration|registration ID/);
  assert.match(settingsSource, /const signedIn = Boolean\(currentUser\?\.id \|\| currentUser\?\.username \|\| currentUser\?\.email \|\| getAuthToken\(\)\)/);

  assert.match(manifestSource, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifestSource, /com\.google\.firebase\.messaging\.default_notification_channel_id/);
  assert.match(stringsSource, /<string name="default_notification_channel_id">queless-booking-updates<\/string>/);
  assert.match(mainActivitySource, /registerPlugin\(QuelessNotificationSettingsPlugin\.class\)/);
  assert.match(nativeSettingsSource, /ACTION_APP_NOTIFICATION_SETTINGS/);
  assert.match(nativeSettingsSource, /EXTRA_APP_PACKAGE/);
});
