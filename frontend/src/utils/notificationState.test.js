import test from "node:test";
import assert from "node:assert/strict";
import { getBrowserNotificationState } from "./notificationState.js";

test("maps browser notification permissions without guessing backend state", () => {
  const supported = { hasNotification: true, hasServiceWorker: true };
  assert.equal(getBrowserNotificationState({ ...supported, permission: "default" }), "default");
  assert.equal(getBrowserNotificationState({ ...supported, permission: "granted" }), "granted");
  assert.equal(getBrowserNotificationState({ ...supported, permission: "denied" }), "denied");
});

test("reports unsupported devices explicitly", () => {
  assert.equal(getBrowserNotificationState({ hasNotification: false, hasServiceWorker: true }), "unsupported");
  assert.equal(getBrowserNotificationState({ hasNotification: true, hasServiceWorker: false }), "unsupported");
});
