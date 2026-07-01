import { all, get, transaction } from "../db/query.js";
import { publicBusinessParams, publicBusinessWhere } from "../services/businessVisibility.js";
import { supportsProducts } from "../services/marketplaceCapabilities.js";
import { normalizeUgandaStandPhone } from "../services/standDraftMerge.js";
import { AUDIT_EVENTS, recordAuditEvent } from "../services/auditLogService.js";

const ORDER_STATUSES = new Set([
  "new",
  "confirmed",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
]);
const INQUIRY_STATUSES = new Set(["new", "responded", "closed"]);
const SELLER_TRANSITIONS = {
  new: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["ready_for_pickup", "out_for_delivery", "cancelled"]),
  ready_for_pickup: new Set(["completed", "cancelled"]),
  out_for_delivery: new Set(["completed", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
};

function cleanText(value, maxLength = 1000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function truthy(value) {
  return [true, 1, "1", "true", "yes"].includes(value);
}

function httpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizeSelectedOptions(product, value) {
  const selected = parseJson(value, {});
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) {
    throw httpError(400, `Choose valid options for ${product.name}.`);
  }
  const groups = parseJson(product.options_json, []);
  const normalized = {};
  for (const group of Array.isArray(groups) ? groups : []) {
    const name = cleanText(group?.name || group?.label, 80);
    const allowed = (Array.isArray(group?.values) ? group.values : []).map((item) => cleanText(item, 80));
    const choice = cleanText(selected[name] ?? selected[name.toLowerCase()], 80);
    if (!name || !choice || !allowed.includes(choice)) {
      throw httpError(400, `Choose a valid ${name || "option"} for ${product.name}.`);
    }
    normalized[name] = choice;
  }
  return normalized;
}

async function getOrderItems(orderIds = []) {
  if (!orderIds.length) return new Map();
  const rows = await all(
    `SELECT *
     FROM product_order_items
     WHERE order_id IN (${orderIds.map(() => "?").join(", ")})
     ORDER BY id ASC`,
    orderIds
  );
  return rows.reduce((grouped, item) => {
    const orderId = Number(item.order_id);
    if (!grouped.has(orderId)) grouped.set(orderId, []);
    grouped.get(orderId).push({
      id: item.id,
      order_id: item.order_id,
      orderId: item.order_id,
      product_id: item.product_id,
      productId: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      productName: item.product_name_snapshot,
      product_price_snapshot: Number(item.product_price_snapshot || 0),
      productPrice: Number(item.product_price_snapshot || 0),
      product_image_snapshot: item.product_image_snapshot || "",
      productImage: item.product_image_snapshot || "",
      selected_options: parseJson(item.selected_options_json, {}),
      selectedOptions: parseJson(item.selected_options_json, {}),
      quantity: Number(item.quantity || 1),
      line_total: Number(item.line_total || 0),
      lineTotal: Number(item.line_total || 0),
    });
    return grouped;
  }, new Map());
}

async function hydrateOrders(rows = [], { includeEvents = false } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((row) => Number(row.id));
  const itemsByOrder = await getOrderItems(ids);
  let eventsByOrder = new Map();
  if (includeEvents) {
    const events = await all(
      `SELECT * FROM product_order_events
       WHERE order_id IN (${ids.map(() => "?").join(", ")})
       ORDER BY created_at ASC, id ASC`,
      ids
    );
    eventsByOrder = events.reduce((grouped, event) => {
      const orderId = Number(event.order_id);
      if (!grouped.has(orderId)) grouped.set(orderId, []);
      grouped.get(orderId).push({
        id: event.id,
        old_status: event.old_status || "",
        oldStatus: event.old_status || "",
        new_status: event.new_status,
        newStatus: event.new_status,
        note: event.note || "",
        actor_id: event.actor_id,
        actorId: event.actor_id,
        created_at: event.created_at,
      });
      return grouped;
    }, new Map());
  }
  return rows.map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    customerId: row.customer_id,
    stand_id: row.stand_id,
    standId: row.stand_id,
    seller_user_id: row.seller_user_id,
    sellerUserId: row.seller_user_id,
    status: row.status,
    fulfilment_method: row.fulfilment_method,
    fulfilmentMethod: row.fulfilment_method,
    fulfillmentMethod: row.fulfilment_method,
    customer_name: row.customer_name || "",
    customerName: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    customerPhone: row.customer_phone || "",
    delivery_area: row.delivery_area || "",
    deliveryArea: row.delivery_area || "",
    delivery_address: row.delivery_address || "",
    deliveryAddress: row.delivery_address || "",
    customer_note: row.customer_note || "",
    customerNote: row.customer_note || "",
    seller_note: row.seller_note || "",
    sellerNote: row.seller_note || "",
    subtotal: Number(row.subtotal || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    currency: row.currency || "UGX",
    idempotency_key: row.idempotency_key || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    business_name: row.business_name || "",
    businessName: row.business_name || "",
    location: row.location || "",
    customer_username: row.customer_username || "",
    customerUsername: row.customer_username || "",
    items: itemsByOrder.get(Number(row.id)) || [],
    events: eventsByOrder.get(Number(row.id)) || [],
  }));
}

async function orderRow(orderId) {
  return get(
    `SELECT o.*, b.business_name, b.location, u.username AS customer_username
     FROM product_orders o
     JOIN barbers b ON b.id = o.stand_id
     JOIN users u ON u.id = o.customer_id
     WHERE o.id = ?`,
    [orderId]
  );
}

export async function createProductOrder(req, res, next) {
  try {
    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!requestedItems.length || requestedItems.length > 50) {
      throw httpError(400, "Add at least one product to the order request.");
    }
    if (requestedItems.some((item) => !Number.isInteger(Number(item.product_id || item.productId)) || Number(item.product_id || item.productId) <= 0)) {
      throw httpError(400, "Every order item must reference a valid product.");
    }
    const productIds = [...new Set(requestedItems.map((item) => Number(item.product_id || item.productId)).filter(Boolean))];
    const products = await all(
      `SELECT p.*, b.owner_user_id AS seller_user_id, b.business_name, b.location,
              b.marketplace_mode, b.delivery_available, b.pickup_available,
              b.delivery_areas_json, b.delivery_fee
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE p.id IN (${productIds.map(() => "?").join(", ")})
         AND p.is_deleted = 0
         AND p.is_active = 1
         AND p.stock_status NOT IN ('hidden', 'out_of_stock')
         AND b.marketplace_mode IN ('product', 'hybrid')
         AND ${publicBusinessWhere("b")}`,
      [...productIds, ...publicBusinessParams(new Date())]
    );
    if (products.length !== productIds.length) {
      throw httpError(400, "One or more products are no longer available.");
    }
    const productsById = new Map(products.map((product) => [Number(product.id), product]));
    const standIds = new Set(products.map((product) => Number(product.stand_id)));
    if (standIds.size !== 1) throw httpError(400, "Submit separate order requests for different stands.");
    const stand = products[0];
    if (!supportsProducts(stand)) throw httpError(400, "This stand does not accept product orders.");
    if (Number(stand.seller_user_id) === Number(req.user.id)) {
      throw httpError(400, "You cannot submit an order request to your own stand.");
    }

    const fulfilmentMethod = cleanText(
      req.body.fulfilment_method || req.body.fulfillment_method || req.body.fulfilmentMethod || req.body.fulfillmentMethod,
      20
    ).toLowerCase();
    if (!["pickup", "delivery"].includes(fulfilmentMethod)) {
      throw httpError(400, "Choose pickup or delivery.");
    }
    if (fulfilmentMethod === "pickup" && !truthy(stand.pickup_available)) {
      throw httpError(400, "Pickup is not available for this stand.");
    }
    if (fulfilmentMethod === "delivery" && !truthy(stand.delivery_available)) {
      throw httpError(400, "Delivery is not available for this stand.");
    }

    const deliveryArea = cleanText(req.body.delivery_area || req.body.deliveryArea, 200);
    const deliveryAddress = cleanText(req.body.delivery_address || req.body.deliveryAddress, 300);
    if (fulfilmentMethod === "delivery" && (!deliveryArea || !deliveryAddress)) {
      throw httpError(400, "Delivery area and address are required for delivery requests.");
    }
    const customerPhone = normalizeUgandaStandPhone(req.body.customer_phone || req.body.customerPhone);
    if (!customerPhone) throw httpError(400, "Enter a valid Uganda phone number.");
    const profile = await get(`SELECT full_name FROM profiles WHERE user_id = ?`, [req.user.id]);
    const customerName = cleanText(
      req.body.customer_name || req.body.customerName || profile?.full_name || req.user.username,
      120
    );
    const customerNote = cleanText(req.body.customer_note || req.body.customerNote, 2000);
    const idempotencyKey = cleanText(
      req.body.idempotency_key || req.body.idempotencyKey || req.get("Idempotency-Key"),
      120
    );

    let subtotal = 0;
    const orderItems = requestedItems.map((item) => {
      const product = productsById.get(Number(item.product_id || item.productId));
      const quantity = Number(item.quantity || 1);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        throw httpError(400, `Choose a valid quantity for ${product.name}.`);
      }
      if (product.quantity_available !== null && product.quantity_available !== undefined &&
          quantity > Number(product.quantity_available)) {
        throw httpError(400, `Only ${product.quantity_available} of ${product.name} are currently available.`);
      }
      const salePrice = product.sale_price === null || product.sale_price === undefined
        ? null
        : Number(product.sale_price);
      const unitPrice = salePrice && salePrice > 0 && salePrice < Number(product.price)
        ? salePrice
        : Number(product.price);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      return {
        product,
        quantity,
        unitPrice,
        lineTotal,
        selectedOptions: normalizeSelectedOptions(
          product,
          item.selected_options || item.selectedOptions || {}
        ),
      };
    });
    const deliveryFee = fulfilmentMethod === "delivery" ? Math.max(0, Number(stand.delivery_fee || 0)) : 0;
    const total = subtotal + deliveryFee;

    let outcome;
    try {
      outcome = await transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.get(
            `SELECT id FROM product_orders WHERE customer_id = ? AND idempotency_key = ? LIMIT 1`,
            [req.user.id, idempotencyKey]
          );
          if (existing) return { orderId: existing.id, reused: true };
        }
        const inserted = await tx.run(
          `INSERT INTO product_orders
           (customer_id, stand_id, seller_user_id, status, fulfilment_method, customer_name,
            customer_phone, delivery_area, delivery_address, customer_note, seller_note,
            subtotal, delivery_fee, total, currency, idempotency_key, created_at, updated_at)
           VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 'UGX', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            req.user.id,
            stand.stand_id,
            stand.seller_user_id,
            fulfilmentMethod,
            customerName,
            customerPhone,
            deliveryArea,
            deliveryAddress,
            customerNote,
            subtotal,
            deliveryFee,
            total,
            idempotencyKey,
          ]
        );
        for (const item of orderItems) {
          const image = await tx.get(
            `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`,
            [item.product.id]
          );
          await tx.run(
            `INSERT INTO product_order_items
             (order_id, product_id, product_name_snapshot, product_price_snapshot,
              product_image_snapshot, selected_options_json, quantity, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              inserted.lastID,
              item.product.id,
              item.product.name,
              item.unitPrice,
              image?.image_url || "",
              JSON.stringify(item.selectedOptions),
              item.quantity,
              item.lineTotal,
            ]
          );
        }
        await tx.run(
          `INSERT INTO product_order_events (order_id, actor_id, old_status, new_status, note)
           VALUES (?, ?, '', 'new', ?)`,
          [inserted.lastID, req.user.id, "Order request submitted"]
        );
        await tx.run(
          `INSERT INTO notifications
           (user_id, title, type, message, barber_id, customer_user_id, customer_username, read)
           VALUES (?, 'New product order request', 'product_order', ?, ?, ?, ?, 0)`,
          [
            stand.seller_user_id,
            `${customerName} sent an order request to ${stand.business_name}.`,
            stand.stand_id,
            req.user.id,
            req.user.username,
          ]
        );
        return { orderId: inserted.lastID, reused: false };
      });
    } catch (error) {
      if (!idempotencyKey || !/unique|constraint/i.test(String(error?.message || ""))) throw error;
      const existing = await get(
        `SELECT id FROM product_orders WHERE customer_id = ? AND idempotency_key = ? LIMIT 1`,
        [req.user.id, idempotencyKey]
      );
      if (!existing) throw error;
      outcome = { orderId: existing.id, reused: true };
    }

    const hydrated = await hydrateOrders([await orderRow(outcome.orderId)], { includeEvents: true });
    await recordAuditEvent({
      eventType: AUDIT_EVENTS.PRODUCT_ORDER_CREATED || "product_order.created",
      actorUserId: req.user.id,
      actorRole: req.user.role,
      targetType: "product_order",
      targetId: outcome.orderId,
      metadata: { stand_id: stand.stand_id, reused: outcome.reused },
      req,
    });
    return res.status(outcome.reused ? 200 : 201).json({
      success: true,
      order: hydrated[0],
      reused: outcome.reused,
      payment_required: false,
      message: "Order request sent. The seller will confirm pickup or delivery details.",
    });
  } catch (error) {
    next(error);
  }
}

export async function listSellerOrders(req, res, next) {
  try {
    const stand = await get(`SELECT id FROM barbers WHERE owner_user_id = ? LIMIT 1`, [req.user.id]);
    if (!stand) return res.status(404).json({ success: false, message: "Seller stand not found." });
    const status = cleanText(req.query.status, 30).toLowerCase();
    const params = [req.user.id];
    const statusSql = ORDER_STATUSES.has(status) ? " AND o.status = ?" : "";
    if (statusSql) params.push(status);
    const rows = await all(
      `SELECT o.*, b.business_name, b.location, u.username AS customer_username
       FROM product_orders o
       JOIN barbers b ON b.id = o.stand_id
       JOIN users u ON u.id = o.customer_id
       WHERE o.seller_user_id = ?${statusSql}
       ORDER BY o.created_at DESC, o.id DESC`,
      params
    );
    return res.json({ success: true, orders: await hydrateOrders(rows) });
  } catch (error) {
    next(error);
  }
}

export async function listCustomerOrders(req, res, next) {
  try {
    const rows = await all(
      `SELECT o.*, b.business_name, b.location, u.username AS customer_username
       FROM product_orders o
       JOIN barbers b ON b.id = o.stand_id
       JOIN users u ON u.id = o.customer_id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC, o.id DESC`,
      [req.user.id]
    );
    return res.json({ success: true, orders: await hydrateOrders(rows) });
  } catch (error) {
    next(error);
  }
}

export async function getProductOrder(req, res, next) {
  try {
    const row = await orderRow(req.params.id);
    if (!row || ![Number(row.customer_id), Number(row.seller_user_id)].includes(Number(req.user.id))) {
      return res.status(404).json({ success: false, message: "Product order not found." });
    }
    return res.json({ success: true, order: (await hydrateOrders([row], { includeEvents: true }))[0] });
  } catch (error) {
    next(error);
  }
}

export async function updateProductOrderStatus(req, res, next) {
  try {
    const row = await orderRow(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Product order not found." });
    const nextStatus = cleanText(req.body.status, 30).toLowerCase();
    if (!ORDER_STATUSES.has(nextStatus)) throw httpError(400, "Choose a valid product order status.");
    const isSeller = Number(row.seller_user_id) === Number(req.user.id);
    const isCustomer = Number(row.customer_id) === Number(req.user.id);
    if (!isSeller && !isCustomer) return res.status(404).json({ success: false, message: "Product order not found." });
    if (isCustomer && !(row.status === "new" && nextStatus === "cancelled")) {
      throw httpError(403, "Customers can only cancel a new order request.");
    }
    if (isSeller && !SELLER_TRANSITIONS[row.status]?.has(nextStatus)) {
      throw httpError(400, `A ${row.status} order cannot move to ${nextStatus}.`);
    }
    if (nextStatus === "ready_for_pickup" && row.fulfilment_method !== "pickup") {
      throw httpError(400, "Only pickup orders can be marked ready for pickup.");
    }
    if (nextStatus === "out_for_delivery" && row.fulfilment_method !== "delivery") {
      throw httpError(400, "Only delivery orders can be marked out for delivery.");
    }
    const note = cleanText(req.body.note, 1000);
    const sellerNote = isSeller
      ? cleanText(req.body.seller_note ?? req.body.sellerNote ?? row.seller_note, 2000)
      : row.seller_note;
    await transaction(async (tx) => {
      await tx.run(
        `UPDATE product_orders
         SET status = ?, seller_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, sellerNote, row.id]
      );
      await tx.run(
        `INSERT INTO product_order_events (order_id, actor_id, old_status, new_status, note)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, req.user.id, row.status, nextStatus, note]
      );
      const recipient = isSeller ? row.customer_id : row.seller_user_id;
      await tx.run(
        `INSERT INTO notifications
         (user_id, title, type, message, barber_id, customer_user_id, customer_username, read)
         VALUES (?, 'Product order updated', 'product_order', ?, ?, ?, ?, 0)`,
        [
          recipient,
          `Order request #${row.id} is now ${nextStatus.replace(/_/g, " ")}.`,
          row.stand_id,
          row.customer_id,
          row.customer_username,
        ]
      );
    });
    const updated = await orderRow(row.id);
    await recordAuditEvent({
      eventType: AUDIT_EVENTS.PRODUCT_ORDER_STATUS_CHANGED || "product_order.status_changed",
      actorUserId: req.user.id,
      actorRole: req.user.role,
      targetType: "product_order",
      targetId: row.id,
      metadata: { old_status: row.status, new_status: nextStatus },
      req,
    });
    return res.json({ success: true, order: (await hydrateOrders([updated], { includeEvents: true }))[0] });
  } catch (error) {
    next(error);
  }
}

export async function createProductInquiry(req, res, next) {
  try {
    const productId = Number(req.body.product_id || req.body.productId);
    const message = cleanText(req.body.message, 3000);
    if (!productId || message.length < 2) throw httpError(400, "Product and message are required.");
    const product = await get(
      `SELECT p.id, p.name, p.stand_id, b.owner_user_id AS seller_user_id,
              b.business_name, b.marketplace_mode
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE p.id = ?
         AND p.is_deleted = 0
         AND p.is_active = 1
         AND p.stock_status <> 'hidden'
         AND b.marketplace_mode IN ('product', 'hybrid')
         AND ${publicBusinessWhere("b")}
       LIMIT 1`,
      [productId, ...publicBusinessParams(new Date())]
    );
    if (!product) throw httpError(404, "Product not found.");
    if (Number(product.seller_user_id) === Number(req.user.id)) {
      throw httpError(400, "You cannot send an inquiry to your own stand.");
    }
    const idempotencyKey = cleanText(
      req.body.idempotency_key || req.body.idempotencyKey || req.get("Idempotency-Key"),
      120
    );
    let outcome;
    try {
      outcome = await transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.get(
            `SELECT id FROM product_inquiries WHERE customer_id = ? AND idempotency_key = ? LIMIT 1`,
            [req.user.id, idempotencyKey]
          );
          if (existing) return { inquiryId: existing.id, reused: true };
        }
        const inserted = await tx.run(
          `INSERT INTO product_inquiries
           (product_id, stand_id, customer_id, seller_user_id, message, status, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'new', ?)`,
          [product.id, product.stand_id, req.user.id, product.seller_user_id, message, idempotencyKey]
        );
        const messageText = `Product inquiry: ${product.name}\n${message}`;
        const messageInserted = await tx.run(
          `INSERT INTO messages
           (barber_id, customer_user_id, sender_user_id, text, seen, client_message_id, created_at)
           VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
          [
            product.stand_id,
            req.user.id,
            req.user.id,
            messageText,
            idempotencyKey ? `product-inquiry:${idempotencyKey}` : "",
          ]
        );
        await tx.run(
          `UPDATE product_inquiries SET conversation_message_id = ? WHERE id = ?`,
          [messageInserted.lastID, inserted.lastID]
        );
        await tx.run(
          `INSERT INTO notifications
           (user_id, title, type, message, barber_id, customer_user_id, customer_username, read)
           VALUES (?, 'New product inquiry', 'product_inquiry', ?, ?, ?, ?, 0)`,
          [
            product.seller_user_id,
            `A customer asked about ${product.name}.`,
            product.stand_id,
            req.user.id,
            req.user.username,
          ]
        );
        return { inquiryId: inserted.lastID, reused: false };
      });
    } catch (error) {
      if (!idempotencyKey || !/unique|constraint/i.test(String(error?.message || ""))) throw error;
      const existing = await get(
        `SELECT id FROM product_inquiries WHERE customer_id = ? AND idempotency_key = ? LIMIT 1`,
        [req.user.id, idempotencyKey]
      );
      if (!existing) throw error;
      outcome = { inquiryId: existing.id, reused: true };
    }
    const inquiry = await get(`SELECT * FROM product_inquiries WHERE id = ?`, [outcome.inquiryId]);
    return res.status(outcome.reused ? 200 : 201).json({
      success: true,
      inquiry,
      reused: outcome.reused,
      conversation_id: `${product.stand_id}:${req.user.username}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function listProductInquiries(req, res, next) {
  try {
    const sellerView = ["provider", "barber", "business"].includes(String(req.user.role || "").toLowerCase()) &&
      req.query.view !== "customer";
    const field = sellerView ? "i.seller_user_id" : "i.customer_id";
    const rows = await all(
      `SELECT i.*, p.name AS product_name, b.business_name, u.username AS customer_username
       FROM product_inquiries i
       LEFT JOIN products p ON p.id = i.product_id
       JOIN barbers b ON b.id = i.stand_id
       JOIN users u ON u.id = i.customer_id
       WHERE ${field} = ?
       ORDER BY i.created_at DESC, i.id DESC`,
      [req.user.id]
    );
    return res.json({ success: true, inquiries: rows });
  } catch (error) {
    next(error);
  }
}

export async function updateProductInquiryStatus(req, res, next) {
  try {
    const inquiry = await get(`SELECT * FROM product_inquiries WHERE id = ?`, [req.params.id]);
    if (!inquiry) return res.status(404).json({ success: false, message: "Product inquiry not found." });
    const isSeller = Number(inquiry.seller_user_id) === Number(req.user.id);
    const isCustomer = Number(inquiry.customer_id) === Number(req.user.id);
    if (!isSeller && !isCustomer) return res.status(404).json({ success: false, message: "Product inquiry not found." });
    const status = cleanText(req.body.status, 20).toLowerCase();
    if (!INQUIRY_STATUSES.has(status)) throw httpError(400, "Choose a valid inquiry status.");
    if (isCustomer && status !== "closed") throw httpError(403, "Customers can only close their inquiry.");
    await transaction(async (tx) => {
      await tx.run(
        `UPDATE product_inquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, inquiry.id]
      );
      if (status === "responded" && isSeller) {
        await tx.run(
          `INSERT INTO notifications
           (user_id, title, type, message, barber_id, customer_user_id, read)
           VALUES (?, 'Seller responded', 'product_inquiry', 'The seller responded to your product inquiry.', ?, ?, 0)`,
          [inquiry.customer_id, inquiry.stand_id, inquiry.customer_id]
        );
      }
    });
    return res.json({
      success: true,
      inquiry: await get(`SELECT * FROM product_inquiries WHERE id = ?`, [inquiry.id]),
    });
  } catch (error) {
    next(error);
  }
}
