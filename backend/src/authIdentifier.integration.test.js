import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-auth-identifier-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "auth-identifier-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "auth-identifier.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let server;
let baseUrl;
let run;

function post(pathname, body) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function login(body) {
  return post("/api/auth/login", body);
}

async function registerCustomer(username, email, password = "Passw0rd!") {
  const res = await post("/api/auth/register", { username, email, password });
  const body = await res.json();
  assert.equal(res.status, 201, body.message);
  return body.user;
}

async function createProviderUser({ username, email, password = "Provider99" }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, ?, ?, ?)`,
    [username, passwordHash, "provider", "active"]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, 'Provider User', '', ?, '', '')`,
    [result.lastID, email.toLowerCase()]
  );
  return { id: result.lastID, username, email, password };
}

async function createCustomerUser({ username, email, password = "Passw0rd!", status = "active" }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, ?, ?, ?)`,
    [username, passwordHash, "customer", status]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, 'Customer User', '', ?, '', '')`,
    [result.lastID, email.toLowerCase()]
  );
  return { id: result.lastID, username, email, password };
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  await initDb();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await registerCustomer("CustomerAlias", "customer.alias@example.test");
  await createProviderUser({ username: "ProviderAlias", email: "provider.alias@example.test" });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows temp lock */ }
});

test("customer can log in with email or username identifier", async () => {
  assert.equal((await login({ identifier: "customer.alias@example.test", password: "Passw0rd!" })).status, 200);
  assert.equal((await login({ identifier: "CustomerAlias", password: "Passw0rd!" })).status, 200);
});

test("provider can log in with email or username identifier", async () => {
  assert.equal((await login({ identifier: "provider.alias@example.test", password: "Provider99" })).status, 200);
  assert.equal((await login({ identifier: "ProviderAlias", password: "Provider99" })).status, 200);
});

test("username login is case-insensitive and trims spaces", async () => {
  const res = await login({ identifier: "  provideralias  ", password: "Provider99" });
  assert.equal(res.status, 200);
});

test("legacy clients sending email or username still authenticate", async () => {
  assert.equal((await login({ email: "customer.alias@example.test", password: "Passw0rd!" })).status, 200);
  assert.equal((await login({ username: "ProviderAlias", password: "Provider99" })).status, 200);
});

test("case-only duplicate usernames are prevented at registration", async () => {
  await registerCustomer("UniqueCaseName", "unique.case@example.test");

  const res = await post("/api/auth/register", {
    username: "uniquecasename",
    email: "unique.case.2@example.test",
    password: "Passw0rd!",
  });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.match(body.message, /username already exists/i);
});

test("incorrect password, unknown email, and unknown username share the safe response", async () => {
  const responses = [];
  for (const body of [
    { identifier: "customer.alias@example.test", password: "WrongPass99" },
    { identifier: "missing@example.test", password: "WrongPass99" },
    { identifier: "missingUser", password: "WrongPass99" },
  ]) {
    const res = await login(body);
    const payload = await res.json();
    responses.push({ status: res.status, code: payload.code, message: payload.message });
  }

  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(responses[1], responses[2]);
  assert.equal(responses[0].status, 401);
  assert.equal(responses[0].code, "INVALID_CREDENTIALS");
});

test("malformed identifiers are rejected before account lookup", async () => {
  const res = await login({ identifier: "bad username", password: "Passw0rd!" });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("disabled accounts are blocked after successful password verification", async () => {
  await createCustomerUser({
    username: "DisabledLogin",
    email: "disabled.login@example.test",
    status: "disabled",
  });

  const res = await login({ identifier: "disabledlogin", password: "Passw0rd!" });
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.code, "ACCOUNT_INACTIVE");
});
