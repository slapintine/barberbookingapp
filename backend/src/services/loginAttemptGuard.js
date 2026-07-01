// Per-account failed-login guard.
//
// Layered on top of the per-IP authRateLimiter so a distributed/IP-rotating
// attacker still can't brute-force a single account: failures are counted per
// normalized account identifier and trigger a short, temporary lockout.
//
// Storage is an in-memory Map today. It is deliberately wrapped in a tiny
// synchronous store interface (get/set/delete) so it can be swapped for a
// Redis-backed store later without changing any call site or the guard logic.
// The lockout is always temporary (never permanent) and identical whether or not
// the account exists, so it never reveals which accounts are real.

const WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count
const MAX_FAILURES = 8; // lock after this many failures within the window
const LOCK_MS = 15 * 60 * 1000; // how long the temporary lock lasts

const store = new Map(); // key -> { failures, firstAt, lockedUntil }

// Drop stale entries so random-identifier probing can't grow memory unbounded.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of store.entries()) {
    const expired = (rec.lockedUntil || 0) <= now && (rec.firstAt || 0) + WINDOW_MS <= now;
    if (expired) store.delete(key);
  }
}, 5 * 60 * 1000);
cleanup.unref?.();

export function normalizeLoginKey(identifier) {
  return String(identifier || "").trim().toLowerCase();
}

function secondsUntil(ts) {
  return Math.max(1, Math.ceil((ts - Date.now()) / 1000));
}

// Returns { locked, retryAfterSeconds } without mutating state — call before
// checking the password so a locked account never reaches the hash comparison.
export function getLoginLock(identifier) {
  const key = normalizeLoginKey(identifier);
  if (!key) return { locked: false, retryAfterSeconds: 0 };
  const rec = store.get(key);
  if (!rec) return { locked: false, retryAfterSeconds: 0 };
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return { locked: true, retryAfterSeconds: secondsUntil(rec.lockedUntil) };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

// Records one failed attempt; returns the resulting lock state.
export function recordLoginFailure(identifier) {
  const key = normalizeLoginKey(identifier);
  if (!key) return { locked: false, retryAfterSeconds: 0 };
  const now = Date.now();
  let rec = store.get(key);

  // Start a fresh window if there's no record or the previous window has elapsed
  // and no active lock remains.
  if (!rec || (now - (rec.firstAt || 0) > WINDOW_MS && (!rec.lockedUntil || rec.lockedUntil <= now))) {
    rec = { failures: 0, firstAt: now, lockedUntil: 0 };
  }

  rec.failures += 1;
  if (rec.failures >= MAX_FAILURES) {
    rec.lockedUntil = now + LOCK_MS;
  }
  store.set(key, rec);

  return rec.lockedUntil > now
    ? { locked: true, retryAfterSeconds: secondsUntil(rec.lockedUntil) }
    : { locked: false, retryAfterSeconds: 0 };
}

// Clears all failures for an account after a successful login.
export function clearLoginFailures(identifier) {
  const key = normalizeLoginKey(identifier);
  if (key) store.delete(key);
}

// Test-only helper to reset state between cases.
export function __resetLoginAttempts() {
  store.clear();
}

export const LOGIN_GUARD_CONFIG = Object.freeze({ WINDOW_MS, MAX_FAILURES, LOCK_MS });
