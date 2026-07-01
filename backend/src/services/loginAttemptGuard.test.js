import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGIN_GUARD_CONFIG,
  clearLoginFailures,
  getLoginLock,
  normalizeLoginKey,
  recordLoginFailure,
  __resetLoginAttempts,
} from "./loginAttemptGuard.js";

test.beforeEach(() => __resetLoginAttempts());

test("locks an account only after the configured number of failures", () => {
  const id = "victim@example.test";
  for (let i = 1; i < LOGIN_GUARD_CONFIG.MAX_FAILURES; i += 1) {
    const r = recordLoginFailure(id);
    assert.equal(r.locked, false, `attempt ${i} should not lock yet`);
    assert.equal(getLoginLock(id).locked, false);
  }
  const final = recordLoginFailure(id);
  assert.equal(final.locked, true, "should lock on the threshold failure");
  assert.ok(final.retryAfterSeconds > 0, "lock should report a retry-after");
  assert.equal(getLoginLock(id).locked, true);
});

test("the lock is temporary and reports a retry-after within the lock window", () => {
  const id = "temp@example.test";
  for (let i = 0; i < LOGIN_GUARD_CONFIG.MAX_FAILURES; i += 1) recordLoginFailure(id);
  const lock = getLoginLock(id);
  assert.equal(lock.locked, true);
  assert.ok(lock.retryAfterSeconds <= Math.ceil(LOGIN_GUARD_CONFIG.LOCK_MS / 1000));
});

test("a successful login clears the failure counter", () => {
  const id = "recover@example.test";
  recordLoginFailure(id);
  recordLoginFailure(id);
  clearLoginFailures(id);
  assert.equal(getLoginLock(id).locked, false);
  // Counter restarts from zero, so one more failure does not immediately lock.
  assert.equal(recordLoginFailure(id).locked, false);
});

test("identifiers are matched case-insensitively and trimmed (no bypass by case)", () => {
  for (let i = 0; i < LOGIN_GUARD_CONFIG.MAX_FAILURES; i += 1) recordLoginFailure("  Victim@Example.TEST ");
  assert.equal(getLoginLock("victim@example.test").locked, true);
  assert.equal(normalizeLoginKey("  Victim@Example.TEST "), "victim@example.test");
});

test("empty identifiers are ignored (never tracked or locked)", () => {
  assert.equal(recordLoginFailure("").locked, false);
  assert.equal(getLoginLock("").locked, false);
});
