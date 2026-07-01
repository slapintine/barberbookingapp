import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Regression coverage for the production crash:
//   null value in column "subscription_tier" of relation "barbers"
//   violates not-null constraint
// The draft create path must never insert a null subscription_tier. Postgres has
// the column as NOT NULL DEFAULT 'FREE'; passing explicit null overrode the
// default and crashed every stand draft. SQLite is nullable, so these tests assert
// the stored value rather than relying on a DB-level constraint.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-tier-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "subscription-tier-test-secret-at-least-32-chars";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "tier.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let initDb;
let run;
let createAuthSession;
let server;
let baseUrl;
let userSeq = 0;

function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row || null)));
  });
}

async function createProvider() {
  userSeq += 1;
  const username = `tier_user_${userSeq}`;
  const userResult = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, 'not-used', 'customer', 'active')`,
    [username]
  );
  const userId = userResult.lastID;
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, '', '', ?, '', '')`,
    [userId, `${username}@example.test`]
  );
  const session = await createAuthSession(
    { id: userId, username, role: "customer" },
    { userAgent: "tier test", ipAddress: "127.0.0.1" }
  );
  return { userId, token: session.token };
}

function request(token, pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ initDb } = await import("./db/initDb.js"));
  ({ run } = await import("./db/query.js"));
  ({ createAuthSession } = await import("./services/authSessionService.js"));
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

test("register/create draft without subscription_tier stores FREE, not null", async () => {
  const { userId, token } = await createProvider();
  const response = await request(token, "/api/barbers/register", {
    method: "POST",
    body: JSON.stringify({ business_name: "Tier Draft One", submit_intent: "draft" }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.barber.subscription_tier, "FREE");
  assert.equal(Number(body.barber.is_published), 0);

  const row = await getOne(`SELECT subscription_tier, business_status, is_published FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.equal(row.subscription_tier, "FREE");
  assert.equal(row.business_status, "draft");
  assert.equal(Number(row.is_published), 0);
});

test("register/create with a chosen plan tier preserves that tier", async () => {
  const { userId, token } = await createProvider();
  const response = await request(token, "/api/barbers/register", {
    method: "POST",
    body: JSON.stringify({
      business_name: "Tier Premium Stand",
      location: "Nakasero, Kampala",
      map_icon_type: "barber",
      selected_plan: "PREMIUM",
      submit_intent: "payment",
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.barber.subscription_tier, "PREMIUM");
  // Paid plan is not active until payment — must not be published.
  assert.equal(Number(body.barber.is_published), 0);

  const row = await getOne(`SELECT subscription_tier FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.equal(row.subscription_tier, "PREMIUM");
});

test("updating a draft without subscription_tier does not clear it", async () => {
  const { userId, token } = await createProvider();
  await request(token, "/api/barbers/register", {
    method: "POST",
    body: JSON.stringify({ business_name: "Tier Update Stand", submit_intent: "draft" }),
  });
  const update = await request(token, "/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({ intro_text: "Just a description edit", submit_intent: "draft" }),
  });
  assert.equal(update.status, 200);
  const row = await getOne(`SELECT subscription_tier FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.equal(row.subscription_tier, "FREE");
});

test("publish does not crash when an existing row has a null subscription_tier", async () => {
  const { userId, token } = await createProvider();
  await request(token, "/api/barbers/register", {
    method: "POST",
    body: JSON.stringify({ business_name: "Tier Publish Stand", phone: "+256700987654", submit_intent: "draft" }),
  });
  // Complete the publish requirements.
  const complete = await request(token, "/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({
      business_type: "Barber",
      map_icon_type: "barber",
      location: "Kololo, Kampala",
      latitude: 0.336,
      longitude: 32.59,
      services: [{ service_name: "Fade", category: "Barber", pricing_type: "fixed", price_extra: 15000, duration_minutes: 30 }],
      schedule_start: "09:00",
      schedule_end: "18:00",
      submit_intent: "draft",
    }),
  });
  assert.equal(complete.status, 200);
  // Simulate a legacy/bad row whose tier was never set.
  await run(`UPDATE barbers SET subscription_tier = NULL WHERE owner_user_id = ?`, [userId]);

  const publish = await request(token, "/api/barbers/me/publish", { method: "POST" });
  assert.equal(publish.status, 200);
  const body = await publish.json();
  assert.equal(Number(body.barber.is_published), 1);
  const row = await getOne(`SELECT subscription_tier FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.equal(row.subscription_tier, "FREE");
});
