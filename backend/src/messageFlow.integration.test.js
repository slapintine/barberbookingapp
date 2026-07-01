import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Regression coverage for the live website messaging failure: a malformed/legacy
// conversation id ("barberId-userId" dash form) must not 500, and the normal
// "barberId:customerUsername" colon flow must send + load. Mirrors what the
// website now does after the fix.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-msg-flow-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "message-flow-test-secret-at-least-32-characters";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "msg.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let run;
let get;
let createAuthSession;
let server;
let baseUrl;
let providerToken;
let customerToken;
let outsiderToken;
let customerUsername;
let barberId;

async function makeUser(username, role) {
  const u = await run(`INSERT INTO users (username, password_hash, role, account_status) VALUES (?, 'x', ?, 'active')`, [username, role]);
  await run(`INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '', ?, '', '')`, [u.lastID, `${username}@example.test`]);
  const session = await createAuthSession({ id: u.lastID, username, role }, { userAgent: "t", ipAddress: "127.0.0.1" });
  return { id: u.lastID, token: session.token };
}

function req(pathname, { method = "GET", body, token } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ run, get } = await import("./db/query.js"));
  const { initDb } = await import("./db/initDb.js");
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  await initDb();

  const provider = await makeUser("msg_provider", "customer");
  providerToken = provider.token;
  const customer = await makeUser("msg_customer", "customer");
  customerToken = customer.token;
  customerUsername = "msg_customer";
  outsiderToken = (await makeUser("msg_outsider", "customer")).token;

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Provider registers a stand → gives us a real barbers row (barber_id FK).
  await req("/api/barbers/register", { method: "POST", token: providerToken, body: { business_name: "Msg Test Stand", submit_intent: "draft" } });
  const row = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [provider.id]);
  barberId = row.id;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("customer can send a message to a provider", async () => {
  const res = await req("/api/messages", { method: "POST", token: customerToken, body: { barberId, customerUsername, text: "Hey man what's up" } });
  assert.ok(res.status === 200 || res.status === 201, `expected created/ok, got ${res.status}`);
});

test("conversation loads + provider can reply via the colon conversation id", async () => {
  const cid = `${barberId}:${customerUsername}`;
  const load = await req(`/api/messages/conversations/${encodeURIComponent(cid)}`, { token: customerToken });
  assert.equal(load.status, 200);
  const body = await load.json();
  assert.ok(Array.isArray(body.messages) && body.messages.length >= 1, "the sent message should appear");

  const reply = await req(`/api/messages/conversations/${encodeURIComponent(cid)}`, { method: "POST", token: providerToken, body: { text: "nm brother wbu?" } });
  assert.ok(reply.status === 200 || reply.status === 201, `expected created/ok, got ${reply.status}`);
});

test("REGRESSION: a legacy dash-format conversation id is handled cleanly, never a 500", async () => {
  // This is the exact live bug: on Postgres the old "barberId-userId" form made
  // barber_id a non-integer and crashed the query with a 500. It must now be a
  // clean response instead.
  const dashGet = await req(`/api/messages/conversations/${encodeURIComponent(`${barberId}-7`)}`, { token: customerToken });
  assert.notEqual(dashGet.status, 500, "dash-format GET must not 500");
  assert.ok(dashGet.status < 500, `expected a clean status, got ${dashGet.status}`);

  const dashPost = await req(`/api/messages/conversations/${encodeURIComponent("not-a-number")}`, { method: "POST", token: customerToken, body: { text: "hi" } });
  assert.notEqual(dashPost.status, 500, "malformed POST must not 500");
  assert.ok(dashPost.status >= 400 && dashPost.status < 500, `expected a clean 4xx, got ${dashPost.status}`);
});

test("a non-participant cannot send into someone else's conversation", async () => {
  const res = await req("/api/messages", { method: "POST", token: outsiderToken, body: { barberId, customerUsername, text: "let me in" } });
  assert.equal(res.status, 403);
});
