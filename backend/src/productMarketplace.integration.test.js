import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-product-marketplace-"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "product-marketplace-test-secret-at-least-32-chars";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "product-marketplace.sqlite");
process.env.IMAGE_STORAGE_DIR = path.join(tempDir, "uploads");
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DEV_CLIENT_URL = "http://127.0.0.1:5173";
process.env.PRODUCT_MARKETPLACE_ENABLED = "true";

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nQAAAABJRU5ErkJggg==";

let app;
let db;
let initDb;
let run;
let createAuthSession;
let server;
let baseUrl;
let sellerToken;
let customerToken;
let standId;
let firstProduct;

async function request(pathname, token, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function createUser(username, role = "customer") {
  const inserted = await run(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, 'not-used', ?, 'active')`,
    [username, role]
  );
  await run(
    `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
     VALUES (?, ?, '', ?, '', '')`,
    [inserted.lastID, username, `${username}@example.test`]
  );
  const session = await createAuthSession(
    { id: inserted.lastID, username, role },
    { userAgent: "product marketplace integration test", ipAddress: "127.0.0.1" }
  );
  return { id: inserted.lastID, token: session.token };
}

test.before(async () => {
  ({ default: app } = await import("./app.js"));
  ({ default: db } = await import("./config/db.js"));
  ({ initDb } = await import("./db/initDb.js"));
  ({ run } = await import("./db/query.js"));
  ({ createAuthSession } = await import("./services/authSessionService.js"));
  await initDb();
  const seller = await createUser("shop_seller");
  const customer = await createUser("shop_customer");
  sellerToken = seller.token;
  customerToken = customer.token;
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db?.close) await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("product stand draft publishes without service schedule only after an active product exists", async () => {
  const register = await request("/api/barbers/register", sellerToken, {
    method: "POST",
    body: JSON.stringify({
      business_name: "Kampala Local Boutique",
      business_type: "Boutique & Fashion",
      marketplace_mode: "product",
      map_icon_type: "boutique-fashion",
      phone: "+256700123456",
      location: "Nakasero, Kampala",
      pickup_available: true,
      delivery_available: false,
      submit_intent: "draft",
    }),
  });
  assert.equal(register.status, 201);
  const registered = await register.json();
  standId = registered.barber.id;
  assert.equal(registered.barber.marketplace_mode, "product");
  assert.equal(registered.barber.stand_type, "individual");
  assert.equal(registered.barber.supportsServices, false);
  assert.equal(registered.barber.supportsProducts, true);
  assert.deepEqual(registered.barber.schedule, []);

  const earlyPublish = await request("/api/barbers/me/publish", sellerToken, { method: "POST" });
  assert.equal(earlyPublish.status, 400);
  const earlyBody = await earlyPublish.json();
  assert.equal(earlyBody.code, "STAND_NOT_READY");
  assert.deepEqual(earlyBody.missing_fields, ["at least one active product"]);

  const create = await request("/api/products", sellerToken, {
    method: "POST",
    body: JSON.stringify({
      name: "Kitenge Tote Bag",
      description: "Handmade local fabric tote bag.",
      category: "Boutique & Fashion",
      price: 45000,
      sale_price: 40000,
      stock_status: "limited",
      quantity_available: 10,
      options: [{ name: "Color", values: ["Maroon", "Purple"] }],
      images: [TINY_PNG],
    }),
  });
  assert.equal(create.status, 201);
  firstProduct = (await create.json()).product;
  assert.equal(firstProduct.images.length, 1);
  assert.match(firstProduct.images[0].image_url, /^\/api\/uploads\//);

  const publish = await request("/api/barbers/me/publish", sellerToken, { method: "POST" });
  assert.equal(publish.status, 200);
  assert.equal((await publish.json()).barber.marketplace_mode, "product");
});

test("partial product updates preserve images and explicit removal is required", async () => {
  const update = await request(`/api/products/${firstProduct.id}`, sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ description: "Updated description only." }),
  });
  assert.equal(update.status, 200);
  const updated = (await update.json()).product;
  assert.equal(updated.images.length, 1);
  assert.equal(updated.images[0].image_url, firstProduct.images[0].image_url);

  const remove = await request(`/api/products/${firstProduct.id}`, sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ remove_image_ids: [updated.images[0].id] }),
  });
  assert.equal(remove.status, 200);
  assert.equal((await remove.json()).product.images.length, 0);
});

test("switching marketplace modes preserves the existing product catalogue", async () => {
  const hybrid = await request("/api/barbers/me", sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ marketplace_mode: "hybrid", submit_intent: "draft" }),
  });
  assert.equal(hybrid.status, 200);
  assert.equal((await hybrid.json()).barber.marketplace_mode, "hybrid");

  const productsWhileHybrid = await request("/api/products/mine", sellerToken);
  assert.equal(productsWhileHybrid.status, 200);
  assert.equal((await productsWhileHybrid.json()).products.some((product) => product.id === firstProduct.id), true);

  const productOnly = await request("/api/barbers/me", sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ marketplace_mode: "product", submit_intent: "draft" }),
  });
  assert.equal(productOnly.status, 200);
  const productOnlyBody = await productOnly.json();
  assert.equal(productOnlyBody.barber.marketplace_mode, "product");
  assert.equal(Number(productOnlyBody.barber.is_published), 0);

  const republish = await request("/api/barbers/me/publish", sellerToken, { method: "POST" });
  assert.equal(republish.status, 200);
});

test("Free plan enforces five active products and soft-deleted products stop counting", async () => {
  const createdIds = [];
  for (let index = 2; index <= 5; index += 1) {
    const response = await request("/api/products", sellerToken, {
      method: "POST",
      body: JSON.stringify({
        name: `Boutique item ${index}`,
        category: "Boutique & Fashion",
        price: 10000 + index,
      }),
    });
    assert.equal(response.status, 201);
    createdIds.push((await response.json()).product.id);
  }
  const overLimit = await request("/api/products", sellerToken, {
    method: "POST",
    body: JSON.stringify({ name: "Sixth item", category: "Boutique & Fashion", price: 20000 }),
  });
  assert.equal(overLimit.status, 403);
  assert.equal((await overLimit.json()).code, "PRODUCT_LIMIT_REACHED");

  const remove = await request(`/api/products/${createdIds[0]}`, sellerToken, { method: "DELETE" });
  assert.equal(remove.status, 200);
  const replacement = await request("/api/products", sellerToken, {
    method: "POST",
    body: JSON.stringify({ name: "Replacement item", category: "Boutique & Fashion", price: 22000 }),
  });
  assert.equal(replacement.status, 201);
});

test("product-only stands reject service bookings with a clear message", async () => {
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await request("/api/bookings", customerToken, {
    method: "POST",
    body: JSON.stringify({
      barber_id: standId,
      service_id: 1,
      booking_date: future,
      booking_time: "12:00",
      payment_method: "cash",
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, "This stand sells products and does not accept service bookings.");
});

test("order requests are payment-free, idempotent, and use product-specific statuses", async () => {
  const payload = {
    items: [{
      product_id: firstProduct.id,
      quantity: 2,
      selected_options: { Color: "Maroon" },
    }],
    fulfilment_method: "pickup",
    customer_phone: "+256701234567",
    customer_note: "Please keep these aside.",
    idempotency_key: "product-order-test-1",
  };
  const create = await request("/api/product-orders", customerToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  assert.equal(create.status, 201);
  const body = await create.json();
  assert.equal(body.payment_required, false);
  assert.equal(body.order.status, "new");
  assert.equal(body.order.items[0].product_name_snapshot, "Kitenge Tote Bag");
  assert.equal(body.order.items[0].quantity, 2);

  const duplicate = await request("/api/product-orders", customerToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  assert.equal(duplicate.status, 200);
  const duplicateBody = await duplicate.json();
  assert.equal(duplicateBody.reused, true);
  assert.equal(duplicateBody.order.id, body.order.id);

  const confirm = await request(`/api/product-orders/${body.order.id}/status`, sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "confirmed", seller_note: "Pickup tomorrow." }),
  });
  assert.equal(confirm.status, 200);
  assert.equal((await confirm.json()).order.status, "confirmed");

  const invalidDeliveryStatus = await request(`/api/product-orders/${body.order.id}/status`, sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "out_for_delivery" }),
  });
  assert.equal(invalidDeliveryStatus.status, 400);
});

test("public product discovery and contextual seller inquiries use the shared stand data", async () => {
  const browse = await request(`/api/products?stand_id=${standId}`, "", {});
  assert.equal(browse.status, 200);
  const products = (await browse.json()).products;
  assert.equal(products.some((product) => product.id === firstProduct.id), true);
  assert.equal(products.find((product) => product.id === firstProduct.id).stand.marketplace_mode, "product");

  const create = await request("/api/product-inquiries", customerToken, {
    method: "POST",
    body: JSON.stringify({
      product_id: firstProduct.id,
      message: "Can I collect this item tomorrow?",
      idempotency_key: "product-inquiry-test-1",
    }),
  });
  assert.equal(create.status, 201);
  const inquiry = (await create.json()).inquiry;
  assert.equal(inquiry.status, "new");
  assert.ok(inquiry.conversation_message_id);

  const sellerList = await request("/api/product-inquiries/mine", sellerToken);
  assert.equal(sellerList.status, 200);
  assert.equal((await sellerList.json()).inquiries.some((item) => item.id === inquiry.id), true);

  const responded = await request(`/api/product-inquiries/${inquiry.id}/status`, sellerToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "responded" }),
  });
  assert.equal(responded.status, 200);
  assert.equal((await responded.json()).inquiry.status, "responded");
});
