import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-sec-headers-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "sec-headers-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "sec-headers.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "https://queless.org";

let app;
let db;
let server;
let baseUrl;

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

test("baseline security headers are present on an API response", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.ok(res.headers.get("permissions-policy"), "expected Permissions-Policy");
});

test("Content-Security-Policy is set with strict directives and no dangerous wildcards", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const csp = res.headers.get("content-security-policy");
  assert.ok(csp, "expected a Content-Security-Policy header");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  // No dangerous wildcards / unsafe script eval.
  assert.ok(!/default-src[^;]*\*/.test(csp), "default-src must not contain a wildcard");
  assert.ok(!/script-src[^;]*\*/.test(csp), "script-src must not contain a wildcard");
  assert.ok(!csp.includes("'unsafe-eval'"), "CSP must not allow unsafe-eval");
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), "script-src must not allow unsafe-inline");
});

test("error responses do not leak stack traces or internal paths", async () => {
  const res = await fetch(`${baseUrl}/api/this-route-does-not-exist`);
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.ok(!/\bat\s+.+:\d+:\d+/.test(text), "response must not contain stack frames");
  assert.ok(!text.includes("node_modules"), "response must not leak internal paths");
});
