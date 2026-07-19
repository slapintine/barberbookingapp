import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

test("notification API uses bounded history, unread count, and mark-all endpoint", () => {
  const api = source("./notificationsApi.js");
  const app = source("../App.jsx");

  assert.match(api, /\/api\/notifications\/me\?limit=50/);
  assert.match(api, /\/api\/notifications\/unread-count/);
  assert.match(api, /\/api\/notifications\/token-status/);
  assert.match(api, /\/api\/notifications\/unregister-token/);
  assert.match(api, /\/api\/notifications\/read-all/);
  assert.match(app, /markAllNotificationsReadRequest\(\)/);
  assert.doesNotMatch(app, /unread\.map\(\(item\)\s*=>\s*markNotificationReadRequest/);
});
