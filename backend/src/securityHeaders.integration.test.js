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

test("uploaded provider media can be embedded by the Android WebView", async () => {
  const uploadDir = path.join(tempDir, "uploads", "providers", "3");
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, "cover-test.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(
    path.join(uploadDir, "cover-test.png"),
    Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")
  );
  fs.writeFileSync(path.join(uploadDir, "cover-test.webp"), Buffer.from("RIFF\x00\x00\x00\x00WEBP", "binary"));

  for (const [filename, contentType] of [
    ["cover-test.jpg", /image\/jpeg/],
    ["cover-test.png", /image\/png/],
    ["cover-test.webp", /image\/webp/],
  ]) {
    const res = await fetch(`${baseUrl}/api/uploads/providers/3/${filename}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cross-origin-resource-policy"), "cross-origin");
    assert.match(res.headers.get("content-type") || "", contentType);
  }
});

test("uploaded media HEAD and missing-file responses keep the media CORP override", async () => {
  const uploadDir = path.join(tempDir, "uploads", "providers", "4");
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, "head-test.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const head = await fetch(`${baseUrl}/api/uploads/providers/4/head-test.jpg`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.match(head.headers.get("content-type") || "", /image\/jpeg/);

  const missing = await fetch(`${baseUrl}/api/uploads/providers/4/missing.jpg`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cross-origin-resource-policy"), "cross-origin");
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
