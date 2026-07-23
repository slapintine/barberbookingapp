import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Email-only account authentication: usernames remain internal display handles,
// but login and recovery use email only.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-auth-ci-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "auth-ci-test-secret-at-least-32-characters-long";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "auth-ci.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let server;
let baseUrl;
let token;

function post(pathname, body, tkn) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function login(email, password) {
  return post("/api/auth/login", { email, password });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  const { initDb } = await import("./db/initDb.js");
  await initDb();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const res = await post("/api/auth/register", { username: "Timothy", email: "Timothy@Example.com", password: "Passw0rd!" });
  const body = await res.json();
  assert.equal(res.status, 201, "registration should succeed");
  token = body.token;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows temp lock */ }
});

test("login by email is case/whitespace-insensitive", async () => {
  assert.equal((await login("  Timothy@Example.com ", "Passw0rd!")).status, 200);
  assert.equal((await login("timothy@example.com", "Passw0rd!")).status, 200);
});

test("username-only login is no longer accepted for account authentication", async () => {
  const res = await post("/api/auth/login", { email: "Timothy", password: "Passw0rd!" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("a genuinely wrong password is still rejected", async () => {
  const res = await login("timothy@example.com", "definitely-wrong");
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, "INVALID_CREDENTIALS");
});

test("password change persists: old rejected, new works by email", async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username: "Timothy", currentPassword: "Passw0rd!", newPassword: "NewPass99" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);

  assert.equal((await login("timothy@example.com", "Passw0rd!")).status, 401, "old password must be rejected");
  assert.equal((await login("timothy@example.com", "NewPass99")).status, 200, "new password by email");
});
