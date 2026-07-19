import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-services-only-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "services-only-test-secret-at-least-32-chars";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "services-only.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";

let app;
let db;
let run;
let get;
let createAuthSession;
let server;
let baseUrl;
let token;
let userId;

async function req(pathname, { method = "GET", body, auth = true, authToken = null } = {}) {
  const bearerToken = authToken || token;
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
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
  const user = await run(
    `INSERT INTO users (username, password_hash, role, account_status) VALUES ('services_only', 'x', 'customer', 'active')`
  );
  userId = user.lastID;
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo) VALUES (?, '', '+256700000000', 'services-only@example.test', 'Kampala', '')`,
    [userId]
  );
  const session = await createAuthSession(
    { id: userId, username: "services_only", role: "customer" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
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

test("product service-commerce endpoints are not mounted", async () => {
  for (const pathname of ["/api/products", "/api/product-orders", "/api/product-inquiries"]) {
    const response = await req(pathname, { auth: false });
    assert.equal(response.status, 404, `${pathname} should return 404`);
  }
});

test("provider registration rejects current product or hybrid submissions", async () => {
  const response = await req("/api/barbers/register", {
    method: "POST",
    body: {
      business_name: "Services Only Stand",
      business_type: "Home Services",
      location: "Kampala",
      phone: "+256700000000",
      stand_type: "shop",
      marketplace_mode: "hybrid",
      services: [{ service_name: "Consultation", price_extra: 15000, duration_minutes: 30 }],
      submit_intent: "draft",
    },
  });
  assert.equal(response.status, 400);
});

test("provider registration creates service-only providers without product requirements", async () => {
  const response = await req("/api/barbers/register", {
    method: "POST",
    body: {
      business_name: "Services Only Stand",
      business_type: "Home Services",
      location: "Kampala",
      phone: "+256700000000",
      services: [{ service_name: "Consultation", price_extra: 15000, duration_minutes: 30 }],
      submit_intent: "draft",
    },
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(Object.hasOwn(body.barber, "marketplace_mode"), false);
  assert.equal(Object.hasOwn(body.barber, "marketplaceMode"), false);
  assert.equal(body.barber.stand_type, "individual");

  const saved = await get(`SELECT marketplace_mode, stand_type FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.equal(saved.marketplace_mode, "service");
  assert.equal(saved.stand_type, "individual");
});

test("providers cannot book their own stand", async () => {
  const stand = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.ok(stand?.id, "expected services-only stand fixture");

  await run(
    `UPDATE barbers
     SET business_status = 'active',
         is_published = 1,
         subscription_tier = 'FREE',
         subscription_status = 'active',
         is_banned = 0,
         is_suspended = 0,
         is_demo = 0,
         image = ''
     WHERE id = ?`,
    [stand.id]
  );

  const service = await get(`SELECT id FROM barber_services WHERE barber_id = ? LIMIT 1`, [stand.id]);
  assert.ok(service?.id, "expected services-only service fixture");

  const bookingDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await req("/api/bookings", {
    method: "POST",
    body: {
      barber_id: stand.id,
      service_id: service.id,
      booking_date: bookingDate,
      booking_time: "10:00",
      payment_method: "cash",
      booking_location_type: "provider_location",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /This is your stand/);

  const saved = await get(
    `SELECT COUNT(*) AS count FROM bookings WHERE barber_id = ? AND customer_user_id = ?`,
    [stand.id, userId]
  );
  assert.equal(Number(saved.count), 0);
});

test("booking total uses the selected service price instead of adding the stand base price", async () => {
  const customer = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('service_price_customer', 'x', 'customer', 'active')`
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, 'Service Price Customer', '+256700000001', 'service-price-customer@example.test', 'Kampala', '')`,
    [customer.lastID]
  );
  const customerSession = await createAuthSession(
    { id: customer.lastID, username: "service_price_customer", role: "customer" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  const owner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('service_price_owner', 'x', 'barber', 'active')`
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, price_from, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, 'Service Price Stand', 'service price stand', 'Kampala', 20000, 'active', 1, 'FREE', 'active')`,
    [owner.lastID]
  );
  const service = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Selected Service', 'Cleaning Services', 'fixed', 1000, 30)`,
    [stand.lastID]
  );

  const bookingDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await req("/api/bookings", {
    method: "POST",
    body: {
      barber_id: stand.lastID,
      service_id: service.lastID,
      booking_date: bookingDate,
      booking_time: "09:30",
      payment_method: "cash",
      booking_location_type: "provider_location",
    },
    authToken: customerSession.token,
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(Number(body.booking.price), 1000);

  const saved = await get(`SELECT price FROM bookings WHERE id = ?`, [body.booking.id]);
  assert.equal(Number(saved.price), 1000);

  const payment = await get(`SELECT id FROM payments WHERE booking_id = ?`, [body.booking.id]);
  assert.equal(payment, null, "cash/pay-later bookings must not create a payment row");

  const ledger = await get(`SELECT id FROM wallet_ledger WHERE booking_id = ?`, [body.booking.id]);
  assert.equal(ledger, null, "cash/pay-later bookings must not create wallet ledger rows");
});

test("booking creation accepts public app camelCase field aliases", async () => {
  const customer = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('service_alias_customer', 'x', 'customer', 'active')`
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, 'Service Alias Customer', '+256700000003', 'service-alias-customer@example.test', 'Kampala', '')`,
    [customer.lastID]
  );
  const customerSession = await createAuthSession(
    { id: customer.lastID, username: "service_alias_customer", role: "customer" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  const owner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('service_alias_owner', 'x', 'barber', 'active')`
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, price_from, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, 'Service Alias Stand', 'service alias stand', 'Kampala', 20000, 'active', 1, 'FREE', 'active')`,
    [owner.lastID]
  );
  const service = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Alias Service', 'Cleaning Services', 'fixed', 1500, 30)`,
    [stand.lastID]
  );

  const bookingDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await req("/api/bookings", {
    method: "POST",
    body: {
      barberId: stand.lastID,
      serviceId: service.lastID,
      date: bookingDate,
      time: "10:30",
      payment_method: "cash",
      booking_location_type: "provider_location",
    },
    authToken: customerSession.token,
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.booking.payment_method, "cash");
  assert.equal(body.booking.payment_status, "unpaid");
  assert.equal(Number(body.booking.price), 1500);

  const payment = await get(`SELECT id FROM payments WHERE booking_id = ?`, [body.booking.id]);
  assert.equal(payment, null, "cash/pay-later bookings must not create a payment row");

  const ledger = await get(`SELECT id FROM wallet_ledger WHERE booking_id = ?`, [body.booking.id]);
  assert.equal(ledger, null, "cash/pay-later bookings must not create wallet ledger rows");
});

test("wallet booking uses payments.id for wallet_ledger payment_id and does not double charge duplicates", async () => {
  const { env } = await import("./config/env.js");
  const previousWalletFlag = env.bookingWalletPaymentsEnabled;
  env.bookingWalletPaymentsEnabled = true;
  try {
  const customer = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('wallet_booking_customer', 'x', 'customer', 'active')`
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, 'Wallet Booking Customer', '+256700000002', 'wallet-booking-customer@example.test', 'Kampala', '')`,
    [customer.lastID]
  );
  await run(`INSERT INTO wallets (user_id, balance) VALUES (?, 100000)`, [customer.lastID]);
  const customerSession = await createAuthSession(
    { id: customer.lastID, username: "wallet_booking_customer", role: "customer" },
    { userAgent: "services-only-wallet", ipAddress: "127.0.0.1" }
  );

  const owner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('wallet_booking_owner', 'x', 'barber', 'active')`
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, price_from, business_status, is_published, subscription_tier, subscription_status, accepts_wallet)
     VALUES (?, 'Wallet Booking Stand', 'wallet booking stand', 'Kampala', 0, 'active', 1, 'FREE', 'active', 1)`,
    [owner.lastID]
  );
  const service = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Wallet Service', 'Professional Services', 'fixed', 12000, 30)`,
    [stand.lastID]
  );

  const bookingDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const idempotencyKey = "wallet-booking-regression";
  const response = await req("/api/bookings", {
    method: "POST",
    body: {
      barber_id: stand.lastID,
      service_id: service.lastID,
      booking_date: bookingDate,
      booking_time: "14:00",
      payment_method: "wallet",
      booking_location_type: "provider_location",
      idempotencyKey,
    },
    authToken: customerSession.token,
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  const savedBooking = await get(`SELECT payment_method, payment_status FROM bookings WHERE id = ?`, [body.booking.id]);
  assert.equal(savedBooking.payment_method, "wallet");
  assert.equal(savedBooking.payment_status, "paid");

  const payment = await get(`SELECT id, provider, status, gross_amount FROM payments WHERE booking_id = ?`, [body.booking.id]);
  assert.ok(payment?.id, "wallet booking should create a canonical payment row");
  assert.equal(payment.provider, "wallet");
  assert.equal(payment.status, "successful");
  assert.equal(Number(payment.gross_amount), 12000);

  const ledger = await get(
    `SELECT payment_id, amount, direction, balance_bucket
     FROM wallet_ledger
     WHERE booking_id = ? AND owner_type = 'customer'`,
    [body.booking.id]
  );
  assert.equal(Number(ledger.payment_id), Number(payment.id));
  assert.equal(Number(ledger.amount), 12000);
  assert.equal(ledger.direction, "debit");

  const wallet = await get(`SELECT balance FROM wallets WHERE user_id = ?`, [customer.lastID]);
  assert.equal(Number(wallet.balance), 88000);

  const duplicate = await req("/api/bookings", {
    method: "POST",
    body: {
      barber_id: stand.lastID,
      service_id: service.lastID,
      booking_date: bookingDate,
      booking_time: "14:30",
      payment_method: "wallet",
      booking_location_type: "provider_location",
      idempotencyKey,
    },
    authToken: customerSession.token,
  });
  assert.notEqual(duplicate.status, 201);

  const walletAfterDuplicate = await get(`SELECT balance FROM wallets WHERE user_id = ?`, [customer.lastID]);
  assert.equal(Number(walletAfterDuplicate.balance), 88000);
  } finally {
    env.bookingWalletPaymentsEnabled = previousWalletFlag;
  }
});

test("providers cannot save their own stand as a favorite", async () => {
  const stand = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.ok(stand?.id, "expected services-only stand fixture");

  const response = await req("/api/favorites", {
    method: "POST",
    body: { barber_id: stand.id },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /This is your stand/);

  const saved = await get(
    `SELECT COUNT(*) AS count FROM favorites WHERE barber_id = ? AND user_id = ?`,
    [stand.id, userId]
  );
  assert.equal(Number(saved.count), 0);
});

test("public provider lists include backend-computed ownership only for the signed-in owner", async () => {
  const stand = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.ok(stand?.id, "expected services-only stand fixture");

  await run(
    `UPDATE barbers
     SET business_status = 'active',
         is_published = 1,
         subscription_tier = 'FREE',
         subscription_status = 'active',
         is_banned = 0,
         is_suspended = 0,
         is_demo = 0
     WHERE id = ?`,
    [stand.id]
  );

  const anonymousResponse = await req("/api/discovery/providers", { auth: false });
  assert.equal(anonymousResponse.status, 200);
  const anonymousBody = await anonymousResponse.json();
  const anonymousStand = anonymousBody.providers.find((provider) => Number(provider.id) === Number(stand.id));
  assert.equal(anonymousStand?.isOwnedByCurrentUser, false);

  const ownerDiscoveryResponse = await req("/api/discovery/providers");
  assert.equal(ownerDiscoveryResponse.status, 200);
  const ownerDiscoveryBody = await ownerDiscoveryResponse.json();
  const ownedDiscoveryStand = ownerDiscoveryBody.providers.find((provider) => Number(provider.id) === Number(stand.id));
  assert.equal(ownedDiscoveryStand?.isOwnedByCurrentUser, true);

  const ownerBarbersResponse = await req("/api/barbers");
  assert.equal(ownerBarbersResponse.status, 200);
  const ownerBarbersBody = await ownerBarbersResponse.json();
  const ownedBarberStand = ownerBarbersBody.barbers.find((provider) => Number(provider.id) === Number(stand.id));
  assert.equal(ownedBarberStand?.isOwnedByCurrentUser, true);
});

test("discovery listing pagination normalizes invalid pages and caps page size", async () => {
  const providersResponse = await req("/api/discovery/providers?page=-2&limit=1000", { auth: false });
  assert.equal(providersResponse.status, 200);
  const providersBody = await providersResponse.json();
  assert.equal(providersBody.pagination.page, 1);
  assert.equal(providersBody.pagination.limit, 100);
  assert.ok(providersBody.providers.length <= 100);

  const servicesResponse = await req("/api/discovery/service-listings?page=0&pageSize=999", { auth: false });
  assert.equal(servicesResponse.status, 200);
  const servicesBody = await servicesResponse.json();
  assert.equal(servicesBody.pagination.page, 1);
  assert.equal(servicesBody.pagination.limit, 100);
  assert.ok(servicesBody.service_listings.length <= 100);
});

test("legacy provider list is bounded for startup performance", async () => {
  const response = await req("/api/barbers?page=-1&limit=1000", { auth: false });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.success, true);
  assert.equal(body.pagination.page, 1);
  assert.equal(body.pagination.limit, 100);
  assert.ok(Array.isArray(body.barbers));
  assert.ok(body.barbers.length <= 100);
  assert.ok(
    body.barbers.every((provider) => Array.isArray(provider.services)),
    "provider cards keep service summaries without per-provider follow-up requests"
  );
});

test("provider API lists return full JSON instead of cache-only 304 responses", async () => {
  const response = await fetch(`${baseUrl}/api/barbers`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "If-None-Match": "*",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.barbers));
});

test("providers cannot start a customer-style conversation with their own stand", async () => {
  const stand = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [userId]);
  assert.ok(stand?.id, "expected services-only stand fixture");

  const response = await req("/api/messages/start", {
    method: "POST",
    body: { barber_id: stand.id, customer_username: "services_only" },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /This is your stand/);
});

test("quote requests require quote-enabled services and are idempotent", async () => {
  const customer = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('quote_customer', 'x', 'customer', 'active')`
  );
  const customerSession = await createAuthSession(
    { id: customer.lastID, username: "quote_customer", role: "customer" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  const owner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('quote_owner', 'x', 'barber', 'active')`
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, 'Quote Provider', 'quote provider', 'Kampala', 'active', 1, 'FREE', 'active')`,
    [owner.lastID]
  );
  const quoteService = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Custom repair quote', 'Repairs', 'quote', 0, 60)`,
    [stand.lastID]
  );
  const fixedService = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Fixed repair', 'Repairs', 'fixed', 25000, 60)`,
    [stand.lastID]
  );

  const fixedResponse = await req("/api/discovery/quote-requests", {
    method: "POST",
    authToken: customerSession.token,
    body: {
      provider_id: stand.lastID,
      service_id: fixedService.lastID,
      description: "Please quote this fixed service anyway.",
      location: "Kampala",
    },
  });
  const fixedBody = await fixedResponse.json();
  assert.equal(fixedResponse.status, 400);
  assert.match(fixedBody.message, /booked directly/i);

  const payload = {
    provider_id: stand.lastID,
    service_id: quoteService.lastID,
    description: "Please estimate this custom repair work.",
    location: "Kampala",
    preferred_date: "2026-08-01",
    idempotency_key: "quote-idempotency-one",
  };
  const first = await req("/api/discovery/quote-requests", { method: "POST", body: payload, authToken: customerSession.token });
  const firstBody = await first.json();
  assert.equal(first.status, 201);
  assert.equal(firstBody.reused, false);

  const second = await req("/api/discovery/quote-requests", { method: "POST", body: payload, authToken: customerSession.token });
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.reused, true);
  assert.equal(Number(secondBody.quote_request.id), Number(firstBody.quote_request.id));

  const saved = await get(
    `SELECT COUNT(*) AS count FROM quote_requests WHERE customer_id = ? AND idempotency_key = ?`,
    [customer.lastID, payload.idempotency_key]
  );
  assert.equal(Number(saved.count), 1);
});

test("quote request access is limited to the customer and the owning provider", async () => {
  const customer = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('quote_visibility_customer', 'x', 'customer', 'active')`
  );
  const customerSession = await createAuthSession(
    { id: customer.lastID, username: "quote_visibility_customer", role: "customer" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  const owner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('quote_visibility_owner', 'x', 'barber', 'active')`
  );
  const ownerSession = await createAuthSession(
    { id: owner.lastID, username: "quote_visibility_owner", role: "barber" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  const otherOwner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('quote_visibility_other', 'x', 'barber', 'active')`
  );
  const otherOwnerSession = await createAuthSession(
    { id: otherOwner.lastID, username: "quote_visibility_other", role: "barber" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, 'Other Quote Provider', 'other quote provider', 'Kampala', 'active', 1, 'FREE', 'active')`,
    [otherOwner.lastID]
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, 'Visible Quote Provider', 'visible quote provider', 'Kampala', 'active', 1, 'FREE', 'active')`,
    [owner.lastID]
  );
  const quoteService = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Visible quote service', 'Repairs', 'quote', 0, 60)`,
    [stand.lastID]
  );

  const quoteResponse = await req("/api/discovery/quote-requests", {
    method: "POST",
    authToken: customerSession.token,
    body: {
      provider_id: stand.lastID,
      service_id: quoteService.lastID,
      description: "Please estimate this visible quote request.",
      location: "Kampala",
      idempotency_key: "quote-visibility-one",
    },
  });
  const quoteBody = await quoteResponse.json();
  assert.equal(quoteResponse.status, 201);

  const customerList = await req("/api/discovery/quote-requests/me", { authToken: customerSession.token });
  const customerBody = await customerList.json();
  assert.equal(customerList.status, 200);
  assert.ok(customerBody.quote_requests.some((item) => Number(item.id) === Number(quoteBody.quote_request.id)));

  const ownerList = await req("/api/discovery/quote-requests/me", { authToken: ownerSession.token });
  const ownerBody = await ownerList.json();
  assert.equal(ownerList.status, 200);
  assert.ok(ownerBody.quote_requests.some((item) => Number(item.id) === Number(quoteBody.quote_request.id)));

  const otherOwnerList = await req("/api/discovery/quote-requests/me", { authToken: otherOwnerSession.token });
  const otherOwnerBody = await otherOwnerList.json();
  assert.equal(otherOwnerList.status, 200);
  assert.equal(otherOwnerBody.quote_requests.some((item) => Number(item.id) === Number(quoteBody.quote_request.id)), false);
});

test("providers cannot request quotes from their own stand", async () => {
  const owner = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES ('self_quote_owner', 'x', 'barber', 'active')`
  );
  const ownerSession = await createAuthSession(
    { id: owner.lastID, username: "self_quote_owner", role: "barber" },
    { userAgent: "services-only", ipAddress: "127.0.0.1" }
  );
  const stand = await run(
    `INSERT INTO barbers
     (owner_user_id, business_name, normalized_business_name, location, business_status, is_published, subscription_tier, subscription_status)
     VALUES (?, 'Self Quote Provider', 'self quote provider', 'Kampala', 'active', 1, 'FREE', 'active')`,
    [owner.lastID]
  );
  const service = await run(
    `INSERT INTO barber_services
     (barber_id, service_name, category, pricing_type, price_extra, duration_minutes)
     VALUES (?, 'Self quote service', 'Repairs', 'quote', 0, 60)`,
    [stand.lastID]
  );

  const response = await req("/api/discovery/quote-requests", {
    method: "POST",
    authToken: ownerSession.token,
    body: {
      provider_id: stand.lastID,
      service_id: service.lastID,
      description: "Please quote my own service.",
      location: "Kampala",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /This is your stand/);
});

test("invalid conversation provider ids return friendly copy", async () => {
  const response = await req("/api/messages/start", {
    method: "POST",
    body: { barber_id: "not-a-provider", customer_username: "services_only" },
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.message, /could not open this conversation/i);
  assert.doesNotMatch(body.message, /barberId|integer|uuid|SQL|database/i);
});

test("subscription tier definitions contain no product limits", async () => {
  const { SUBSCRIPTION_TIERS } = await import("./services/paymentService.js");
  const blob = JSON.stringify(SUBSCRIPTION_TIERS);
  assert.equal(/productLimit|productImageLimit|product listing|product publishing/i.test(blob), false);
});
