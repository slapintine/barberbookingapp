import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-stand-draft-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "stand-draft-test-secret-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "stand-draft.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DEV_CLIENT_URL = "http://127.0.0.1:5173";

let app;
let db;
let initDb;
let run;
let createAuthSession;
let server;
let baseUrl;
let token;

async function request(pathname, options = {}) {
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
  const userResult = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, 'not-used', 'customer', 'active')`,
    ["draft_provider"]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, '', '', 'draft@example.test', '', '')`,
    [userResult.lastID]
  );
  const session = await createAuthSession(
    { id: userResult.lastID, username: "draft_provider", role: "customer" },
    { userAgent: "stand draft integration test", ipAddress: "127.0.0.1" }
  );
  token = session.token;
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("stand draft create, reopen, partial edit, explicit removal, and publish flow preserves data", async () => {
  const createResponse = await request("/api/barbers/register", {
    method: "POST",
    body: JSON.stringify({
      business_name: "Kampala Draft Cuts",
      phone: "+256700123456",
      submit_intent: "draft",
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.success, true);
  assert.equal(created.next_step, "draft");
  assert.equal(created.barber.business_name, "Kampala Draft Cuts");
  assert.equal(created.barber.location, "");
  assert.equal(created.barber.phone, "+256700123456");
  assert.equal(Number(created.barber.is_published), 0);

  const firstReload = await request("/api/barbers/me");
  assert.equal(firstReload.status, 200);
  const firstDraft = (await firstReload.json()).barber;
  assert.equal(firstDraft.business_name, "Kampala Draft Cuts");
  assert.equal(firstDraft.phone, "+256700123456");
  assert.equal(firstDraft.location, "");

  const earlyPublish = await request("/api/barbers/me/publish", { method: "POST" });
  assert.equal(earlyPublish.status, 400);
  const earlyPublishBody = await earlyPublish.json();
  assert.equal(earlyPublishBody.code, "STAND_NOT_READY");
  assert.match(earlyPublishBody.message, /draft is saved/i);

  const completeDraftResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({
      business_type: "Barber",
      map_icon_type: "barber",
      location: "Nakasero, Kampala",
      latitude: 0.315,
      longitude: 32.581,
      image: "https://queless.org/uploads/logo.webp",
      portfolio: [
        { id: "one", afterImage: "https://queless.org/uploads/work-one.webp" },
        { id: "two", afterImage: "https://queless.org/uploads/work-two.webp" },
      ],
      services: [{
        service_name: "Classic haircut",
        category: "Barber",
        pricing_type: "fixed",
        price_extra: 20000,
        duration_minutes: 30,
        image: "https://queless.org/uploads/haircut.webp",
      }],
      schedule_start: "09:00",
      schedule_end: "18:00",
      submit_intent: "draft",
    }),
  });
  assert.equal(completeDraftResponse.status, 200);

  const descriptionResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({ intro_text: "Updated description only", submit_intent: "draft" }),
  });
  assert.equal(descriptionResponse.status, 200);
  const afterDescription = (await descriptionResponse.json()).barber;
  assert.equal(afterDescription.phone, "+256700123456");
  assert.equal(afterDescription.location, "Nakasero, Kampala");
  assert.equal(afterDescription.services.length, 1);
  assert.equal(afterDescription.portfolio.length, 2);
  assert.equal(afterDescription.schedule.find((day) => Number(day.is_open) === 1).start_time, "09:00");

  const noChangeResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({ submit_intent: "draft" }),
  });
  assert.equal(noChangeResponse.status, 200);
  const afterNoChange = (await noChangeResponse.json()).barber;
  assert.equal(afterNoChange.image, "https://queless.org/uploads/logo.webp");
  assert.equal(afterNoChange.services.length, 1);
  assert.equal(afterNoChange.portfolio.length, 2);

  const removeOnePhotoResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({
      portfolio: [{ id: "two", afterImage: "https://queless.org/uploads/work-two.webp" }],
      submit_intent: "draft",
    }),
  });
  assert.equal(removeOnePhotoResponse.status, 200);
  const afterRemoval = (await removeOnePhotoResponse.json()).barber;
  assert.equal(afterRemoval.portfolio.length, 1);
  assert.equal(afterRemoval.image, "https://queless.org/uploads/logo.webp");
  assert.equal(afterRemoval.services.length, 1);

  const publishResponse = await request("/api/barbers/me/publish", { method: "POST" });
  assert.equal(publishResponse.status, 200);
  const published = (await publishResponse.json()).barber;
  assert.equal(Number(published.is_published), 1);

  const countRow = await new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) AS count FROM barbers`, [], (error, row) => error ? reject(error) : resolve(row));
  });
  assert.equal(Number(countRow.count), 1);
});
