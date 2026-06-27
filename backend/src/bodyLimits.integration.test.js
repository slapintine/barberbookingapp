import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-body-limits-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "body-limits-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "body-limits.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let server;
let baseUrl;

// Body parsing runs before auth, so an oversized body is rejected with 413 at the
// parser, while an acceptable body falls through to auth (401 without a token).
// That lets us prove the limit boundary without creating a user/session.
async function post(pathname, bodyString) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyString,
  });
}

function jsonOfSize(bytes) {
  const filler = "x".repeat(Math.max(0, bytes - 20));
  return JSON.stringify({ data: filler });
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

test("normal-sized JSON to a standard endpoint is accepted by the parser (not 413)", async () => {
  const res = await post("/api/bookings", jsonOfSize(2 * 1024));
  assert.notEqual(res.status, 413);
  assert.equal(res.status, 401); // parsed fine, then blocked by auth
});

test("oversized JSON to a standard endpoint is rejected with 413", async () => {
  const res = await post("/api/bookings", jsonOfSize(5 * 1024 * 1024)); // ~5MB > 1MB limit
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.message, "expected a friendly message");
  // No stack trace leaked in the response.
  const serialized = JSON.stringify(body);
  assert.ok(!/\bat\s+.+:\d+:\d+/.test(serialized), "response must not contain a stack trace");
  assert.ok(!serialized.includes("node_modules"), "response must not leak internal paths");
});

test("image route accepts a larger payload that a standard endpoint would reject", async () => {
  const payload = jsonOfSize(5 * 1024 * 1024); // ~5MB: over the 1MB global, under the image limit
  const standard = await post("/api/bookings", payload);
  assert.equal(standard.status, 413, "standard endpoint rejects ~5MB");

  const imageRoute = await post("/api/barbers/register", payload); // POST image route
  assert.notEqual(imageRoute.status, 413, "image route must accept ~5MB");
  assert.equal(imageRoute.status, 401); // parsed fine, then blocked by auth
});
