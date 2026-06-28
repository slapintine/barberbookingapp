import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-login-sec-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "login-sec-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "login-sec.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let server;
let baseUrl;

async function login(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  const { initDb } = await import("./db/initDb.js");
  await initDb();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("login to a non-existent account returns a friendly, non-enumerating message", async () => {
  const res = await login({ username: "nobody@example.test", password: "whatever123" });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, "INVALID_CREDENTIALS");
  assert.match(body.message, /couldn't find an account/i);
  assert.ok(/create an account/i.test(body.message), "should guide the user to create an account");
  // The old confusing wording must be gone.
  assert.ok(!/incorrect username\/email or password/i.test(body.message));
});

test("repeated failed logins are rate limited (429) on /api/auth/login", async () => {
  let saw429 = false;
  // authRateLimiter allows 30/window; send enough to cross it.
  for (let i = 0; i < 40; i += 1) {
    const res = await login({ username: `attacker${i}@example.test`, password: "x" });
    if (res.status === 429) {
      saw429 = true;
      assert.ok(res.headers.get("retry-after"), "429 should include Retry-After");
      break;
    }
    assert.equal(res.status, 401); // before the limit, normal auth failure
  }
  assert.ok(saw429, "expected a 429 after repeated failed login attempts");
});
