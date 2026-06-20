import test from "node:test";
import assert from "node:assert/strict";
import { classifyInboxError, normalizeConversations } from "./inboxState.js";

test("normalizes empty and populated conversation responses defensively", () => {
  assert.deepEqual(normalizeConversations({ conversations: [] }), []);
  assert.deepEqual(normalizeConversations(undefined), []);
  assert.deepEqual(normalizeConversations({ conversations: [{ id: 1 }] }), [{ id: 1 }]);
});

test("treats legacy 404 as empty and auth failures as signed out", () => {
  assert.equal(classifyInboxError({ status: 404 }), "empty");
  assert.equal(classifyInboxError({ status: 401 }), "unauthenticated");
  assert.equal(classifyInboxError({ status: 403 }), "unauthenticated");
});

test("reserves the inbox error state for server and network failures", () => {
  assert.equal(classifyInboxError({ status: 500 }), "error");
  assert.equal(classifyInboxError({ status: 0, serverUnavailable: true }), "error");
});
