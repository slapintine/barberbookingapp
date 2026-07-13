import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-provider-coach-chat-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "provider-coach-chat-test-secret-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "provider-coach-chat.sqlite");
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DEV_CLIENT_URL = "http://127.0.0.1:5173";
process.env.AI_PROVIDER = "gemini";
process.env.PROVIDER_COACH_DAILY_LIMIT = "20";

let app;
let db;
let initDb;
let run;
let createAuthSession;
let setChatGenerator;
let server;
let baseUrl;
let successToken;
let noStandToken;
let rateLimitToken;
let dailyLimitToken;
let capturedContext;

async function insertUser(username) {
  const result = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, 'not-used', 'provider', 'active')`,
    [username]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, ?, '+256700123456', ?, '', '')`,
    [result.lastID, username, `${username}@example.test`]
  );
  return { id: result.lastID, username, role: "provider" };
}

async function createToken(user) {
  const session = await createAuthSession(user, {
    userAgent: "Provider Coach integration test",
    ipAddress: "127.0.0.1",
  });
  return session.token;
}

async function activatePlatinumSubscription(barberId) {
  await run(
    `INSERT INTO barber_subscriptions
     (barber_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, is_active, provider, started_at, expires_at, activated_at)
     VALUES (?, 'PLATINUM', 30000, 'active', 'monthly', 30000, 'UGX', 'paid', 1, 'test', CURRENT_TIMESTAMP, datetime('now', '+30 days'), CURRENT_TIMESTAMP)`,
    [barberId]
  );
}

async function request(token, body = {}, headers = {}) {
  return fetch(`${baseUrl}/api/provider-coach/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ initDb } = await import("./db/initDb.js"));
  ({ run } = await import("./db/query.js"));
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  ({ setProviderCoachChatGeneratorForTests: setChatGenerator } = await import("./services/providerCoachChatService.js"));

  await initDb();
  const successUser = await insertUser("coach_success_provider");
  const noStandUser = await insertUser("coach_no_stand_provider");
  const limiterUser = await insertUser("coach_rate_limit_provider");
  const dailyLimitUser = await insertUser("coach_daily_limit_provider");
  let dailyLimitBusinessId = null;

  for (const user of [successUser, limiterUser, dailyLimitUser]) {
    const businessResult = await run(
      `INSERT INTO barbers
       (owner_user_id, business_name, normalized_business_name, location, latitude, longitude,
        business_type, map_icon_type, intro_text, business_status, is_published,
        subscription_tier, selected_plan, subscription_status, image)
       VALUES (?, ?, ?, 'Kampala, Uganda', 0.3136, 32.5811,
        'Beauty', 'beauty', 'Friendly beauty services for appointments and events.',
        'draft', 0, 'PLATINUM', 'PLATINUM', 'active', '/api/uploads/stand.webp')`,
      [user.id, `${user.username} Studio`, `${user.username} studio`]
    );
    if (user.id === dailyLimitUser.id) dailyLimitBusinessId = businessResult.lastID;
    await activatePlatinumSubscription(businessResult.lastID);
    await run(
      `INSERT INTO barber_services
       (barber_id, service_name, category, price_extra, pricing_type, duration_minutes, description, image)
       VALUES (?, 'Event makeup', 'Beauty', 85000, 'fixed', 90, 'Professional event makeup tailored to the customer.', '/api/uploads/service.webp')`,
      [businessResult.lastID]
    );
    await run(
      `INSERT INTO barber_schedule (barber_id, day_of_week, is_open, start_time, end_time)
       VALUES (?, 1, 1, '09:00', '18:00')`,
      [businessResult.lastID]
    );
  }

  successToken = await createToken(successUser);
  noStandToken = await createToken(noStandUser);
  rateLimitToken = await createToken(limiterUser);
  dailyLimitToken = await createToken(dailyLimitUser);

  for (let index = 0; index < 20; index += 1) {
    await run(
      `INSERT INTO provider_coach_usage (barber_id, user_id, question_id, usage_date, created_at)
       VALUES (?, ?, 'chat', ?, CURRENT_TIMESTAMP)`,
      [dailyLimitBusinessId, dailyLimitUser.id, new Date().toISOString().slice(0, 10)]
    );
  }

  setChatGenerator(async ({ message, context }) => {
    capturedContext = context;
    return `Coach answer for: ${message}`;
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  setChatGenerator?.(null);
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("provider coach chat blocks unauthenticated requests", async () => {
  const response = await request("", { message: "How can I improve?" });
  assert.equal(response.status, 401);
});

test("provider coach chat rejects an empty message", async () => {
  const response = await request(successToken, { message: "   " });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_MESSAGE");
});

test("provider coach chat gives providers without a stand a friendly response", async () => {
  const response = await request(noStandToken, { message: "Help me get bookings" });
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.code, "NO_STAND");
  assert.match(body.message, /create or save your stand first/i);
});

test("provider coach chat uses server-fetched stand data and returns a coach response", async () => {
  const response = await request(successToken, {
    message: "Is my pricing okay?",
    stand: { businessName: "Fake frontend stand", services: [] },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.answer, /Is my pricing okay/);
  assert.equal(body.intent, "pricing_help");
  assert.equal(body.topic, "pricing_help");
  assert.ok(body.nextBestAction);
  assert.ok(Array.isArray(body.suggestedChips));
  assert.ok(body.standHealth.overallStandHealthScore > 0);
  assert.equal(body.contextSummary.plan, "platinum");
  assert.equal(capturedContext.stand.name, "coach_success_provider Studio");
  assert.equal(capturedContext.services[0].price, "UGX 85,000");
  assert.notEqual(capturedContext.stand.name, "Fake frontend stand");
});

test("provider coach chat enforces the per-user daily limit", async () => {
  const response = await request(dailyLimitToken, { message: "One more question" });
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.code, "DAILY_LIMIT_REACHED");
  assert.match(body.message, /today's Provider Coach limit/i);
});

test("provider coach chat rate limiter blocks abuse", async () => {
  let lastResponse;
  for (let index = 0; index < 9; index += 1) {
    lastResponse = await request(rateLimitToken, { message: `Question ${index + 1}` });
  }
  assert.equal(lastResponse.status, 429);
  assert.ok(Number(lastResponse.headers.get("retry-after")) >= 1);
});
