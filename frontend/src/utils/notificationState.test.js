import test from "node:test";
import assert from "node:assert/strict";
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
