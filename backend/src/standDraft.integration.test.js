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

const TINY_PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nQAAAABJRU5ErkJggg==";

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
  const unauthorizedSave = await request("/api/barbers/me", {
    method: "PATCH",
    headers: { Authorization: "" },
    body: JSON.stringify({ business_name: "Should not save" }),
  });
  assert.equal(unauthorizedSave.status, 401);

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

  const duplicateCreate = await request("/api/barbers/register", {
    method: "POST",
    body: JSON.stringify({ business_name: "Duplicate", submit_intent: "draft" }),
  });
  assert.equal(duplicateCreate.status, 409);
  assert.equal((await duplicateCreate.json()).code, "PROVIDER_PROFILE_EXISTS");

  const refreshedSession = await request("/api/auth/me");
  assert.equal(refreshedSession.status, 200);
  assert.equal((await refreshedSession.json()).user.role, "provider");

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
      image: TINY_PNG_DATA_URL,
      portfolio: [
        { id: "one", afterImage: TINY_PNG_DATA_URL },
        { id: "two", afterImage: "https://queless.org/uploads/work-two.webp" },
      ],
      services: [{
        service_name: "Classic haircut",
        category: "Barber",
        pricing_type: "fixed",
        price_extra: 20000,
        duration_minutes: 30,
        image: TINY_PNG_DATA_URL,
      }],
      schedule_start: "09:00",
      schedule_end: "18:00",
      submit_intent: "draft",
    }),
  });
  assert.equal(completeDraftResponse.status, 200);
  const completedDraft = await completeDraftResponse.json();
  const savedLogo = completedDraft.barber.image;
  const savedPortfolioImage = completedDraft.barber.portfolio[0].afterImage;
  const savedServiceImage = completedDraft.barber.services[0].image;
  assert.match(savedLogo, /^\/api\/uploads\//);
  assert.match(savedPortfolioImage, /^\/api\/uploads\//);
  assert.match(savedServiceImage, /^\/api\/uploads\//);

  const descriptionResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({ intro_text: "Updated description only", submit_intent: "draft" }),
  });
  assert.equal(descriptionResponse.status, 200);
  const afterDescription = (await descriptionResponse.json()).barber;
  assert.equal(afterDescription.phone, "+256700123456");
  assert.equal(afterDescription.location, "Nakasero, Kampala");
  assert.equal(Number(afterDescription.latitude), 0.315);
  assert.equal(Number(afterDescription.longitude), 32.581);
  assert.equal(afterDescription.services.length, 1);
  assert.equal(afterDescription.portfolio.length, 2);
  assert.equal(afterDescription.image, savedLogo);
  assert.equal(afterDescription.portfolio[0].afterImage, savedPortfolioImage);
  assert.equal(afterDescription.services[0].image, savedServiceImage);
  assert.equal(afterDescription.schedule.find((day) => Number(day.is_open) === 1).start_time, "09:00");

  const noChangeResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({ submit_intent: "draft" }),
  });
  assert.equal(noChangeResponse.status, 200);
  const afterNoChange = (await noChangeResponse.json()).barber;
  assert.equal(afterNoChange.image, savedLogo);
  assert.equal(afterNoChange.services.length, 1);
  assert.equal(afterNoChange.portfolio.length, 2);
  assert.equal(afterNoChange.portfolio[0].afterImage, savedPortfolioImage);
  assert.equal(afterNoChange.services[0].image, savedServiceImage);

  const accidentalEmptyDefaultsResponse = await request("/api/barbers/me", {
    method: "PATCH",
    body: JSON.stringify({
      image: "",
      services: [],
      portfolio: [],
      submit_intent: "draft",
    }),
  });
  assert.equal(accidentalEmptyDefaultsResponse.status, 200);
  const afterAccidentalEmptyDefaults = (await accidentalEmptyDefaultsResponse.json()).barber;
  assert.equal(afterAccidentalEmptyDefaults.image, savedLogo);
  assert.equal(afterAccidentalEmptyDefaults.services.length, 1);
  assert.equal(afterAccidentalEmptyDefaults.portfolio.length, 2);

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
  assert.equal(afterRemoval.image, savedLogo);
  assert.equal(afterRemoval.services.length, 1);

  const publishResponse = await request("/api/barbers/me/publish", { method: "POST" });
  assert.equal(publishResponse.status, 200);
  const published = (await publishResponse.json()).barber;
  assert.equal(Number(published.is_published), 1);
  assert.equal(published.image, savedLogo);
  assert.equal(published.portfolio[0].afterImage, "https://queless.org/uploads/work-two.webp");
  assert.equal(published.services[0].image, savedServiceImage);

  const publicProvidersResponse = await request("/api/barbers");
  assert.equal(publicProvidersResponse.status, 200);
  const publicProvidersBody = await publicProvidersResponse.json();
  const publicProvider = (publicProvidersBody.barbers || publicProvidersBody.providers || []).find(
    (item) => item.business_name === "Kampala Draft Cuts" || item.businessName === "Kampala Draft Cuts"
  );
  assert.ok(publicProvider, "published provider appears in the public provider list");
  assert.equal(publicProvider.image || publicProvider.image_url, savedLogo);
  assert.equal((publicProvider.portfolio || [])[0]?.afterImage || (publicProvider.portfolio || [])[0]?.after_image, "https://queless.org/uploads/work-two.webp");

  const discoveryProvidersResponse = await request("/api/discovery/providers");
  assert.equal(discoveryProvidersResponse.status, 200);
  const discoveryProvider = (await discoveryProvidersResponse.json()).providers.find(
    (item) => item.business_name === "Kampala Draft Cuts" || item.businessName === "Kampala Draft Cuts"
  );
  assert.ok(discoveryProvider, "published provider appears in discovery");
  assert.equal(discoveryProvider.image || discoveryProvider.image_url, savedLogo);
  assert.ok(
    [
      ...(discoveryProvider.galleryImages || discoveryProvider.gallery_images || []),
      ...(discoveryProvider.portfolioImages || discoveryProvider.portfolio_images || []),
    ].includes("https://queless.org/uploads/work-two.webp"),
    "published portfolio image appears in discovery gallery fields"
  );

  const listingsResponse = await request("/api/discovery/service-listings");
  assert.equal(listingsResponse.status, 200);
  const listing = (await listingsResponse.json()).service_listings.find(
    (item) => item.service_name === "Classic haircut" || item.name === "Classic haircut" || item.title === "Classic haircut"
  );
  assert.ok(listing, "published service appears in discovery listings");
  assert.ok((listing.images || []).includes(savedServiceImage), "published service image appears in discovery listings");

  const countRow = await new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) AS count FROM barbers`, [], (error, row) => error ? reject(error) : resolve(row));
  });
  assert.equal(Number(countRow.count), 1);
});
