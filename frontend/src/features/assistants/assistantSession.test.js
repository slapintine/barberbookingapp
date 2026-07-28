import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeAssistantSession,
  readAssistantSession,
  writeAssistantSession,
} from "./assistantSession.js";

function installSessionStorage() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  return store;
}

test("assistant session persistence survives valid and invalid stored data", () => {
  const store = installSessionStorage();
  assert.equal(writeAssistantSession("assistant:test", { step: "need", serviceKey: "beauty" }), true);
  assert.deepEqual(readAssistantSession("assistant:test", {}), { step: "need", serviceKey: "beauty" });

  store.set("assistant:test", "{not json");
  assert.deepEqual(readAssistantSession("assistant:test", { step: "fallback" }), { step: "fallback" });
  assert.equal(store.has("assistant:test"), false);
});

test("assistant session merge preserves context and records an update time", () => {
  const merged = mergeAssistantSession({ serviceKey: "beauty", when: "today" }, { when: "this_week" });

  assert.equal(merged.serviceKey, "beauty");
  assert.equal(merged.when, "this_week");
  assert.match(merged.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
