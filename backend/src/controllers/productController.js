import { all, get, run, transaction } from "../db/query.js";
import { publicBusinessParams, publicBusinessWhere } from "../services/businessVisibility.js";
import {
  getPlanProductLimits,
  normalizeStandForClient,
  supportsProducts,
} from "../services/marketplaceCapabilities.js";
import { materializeImageReference } from "../services/providerImageStorage.js";
import { AUDIT_EVENTS, recordAuditEvent } from "../services/auditLogService.js";

const STOCK_STATUSES = new Set(["in_stock", "out_of_stock", "limited", "hidden"]);
const MAX_PRODUCT_OPTIONS = 20;
const MAX_OPTION_VALUES = 50;

function cleanText(value, maxLength = 1000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return [true, 1, "1", "true", "yes"].includes(value);
}

function nullableNumber(value, field, { integer = false, min = 0 } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || (integer && !Number.isInteger(number))) {
    const error = new Error(`${field} must be a valid ${integer ? "whole number" : "amount"}.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
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

function normalizeOptions(value) {
  const options = parseJson(value, []);
  if (!Array.isArray(options) || options.length > MAX_PRODUCT_OPTIONS) {
    const error = new Error(`Product options must contain at most ${MAX_PRODUCT_OPTIONS} groups.`);
    error.statusCode = 400;
    throw error;
  }
  return options.map((option) => {
    const name = cleanText(option?.name || option?.label, 80);
    const values = Array.isArray(option?.values)
      ? [...new Set(option.values.map((item) => cleanText(item, 80)).filter(Boolean))]
      : [];
    if (!name || !values.length || values.length > MAX_OPTION_VALUES) {
      const error = new Error("Each product option needs a name and at least one valid value.");
      error.statusCode = 400;
      throw error;
    }
    return { name, values };
  });
}

function normalizeStockStatus(value, fallback = "in_stock") {
  const status = cleanText(value || fallback, 30).toLowerCase();
  if (!STOCK_STATUSES.has(status)) {
    const error = new Error("Choose a valid product stock status.");
    error.statusCode = 400;
    throw error;
  }
  return status;
}

function productSlug(name, id) {
  const base = cleanText(name, 100)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
  return `${base}-${id}`;
}

function validateImageReference(value) {
  const image = String(value || "").trim();
  if (!image) return "";
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) return image;
  if ((/^https?:\/\//i.test(image) || image.startsWith("/")) && image.length <= 2048 && !/[<>]|javascript:/i.test(image)) {
    return image;
  }
  const error = new Error("Product images must be PNG, JPG, WebP, or a safe image URL.");
  error.statusCode = 400;
  throw error;
}

function imageReference(item) {
  if (typeof item === "string") return item;
  return item?.image_url || item?.imageUrl || item?.url || item?.image || "";
}

async function getOwnerStand(userId) {
  return get(
    `SELECT b.*
     FROM barbers b
     WHERE b.owner_user_id = ?
       AND LOWER(COALESCE(b.business_status, '')) <> 'deleted'
     LIMIT 1`,
    [userId]
  );
}

async function getProductImages(productId, executor = { all }) {
  return executor.all(
    `SELECT id, product_id, image_url, sort_order, created_at
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );
}

function mapProduct(row = {}, images = []) {
  const options = parseJson(row.options_json, []);
  const stand = normalizeStandForClient(row);
  return {
    id: row.id,
    stand_id: row.stand_id,
    standId: row.stand_id,
    owner_user_id: row.owner_user_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    slug: row.slug || "",
    description: row.description || "",
    category: row.category || "",
    subcategory: row.subcategory || "",
    price: Number(row.price || 0),
    sale_price: row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price),
    salePrice: row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price),
    currency: row.currency || "UGX",
    stock_status: row.stock_status || "in_stock",
    stockStatus: row.stock_status || "in_stock",
    quantity_available: row.quantity_available === null || row.quantity_available === undefined
      ? null
      : Number(row.quantity_available),
    quantityAvailable: row.quantity_available === null || row.quantity_available === undefined
      ? null
      : Number(row.quantity_available),
    options,
    variants: options,
    is_active: Number(row.is_active ?? 1) === 1,
    isActive: Number(row.is_active ?? 1) === 1,
    is_deleted: Number(row.is_deleted ?? 0) === 1,
    isDeleted: Number(row.is_deleted ?? 0) === 1,
    images: images.map((image) => ({
      id: image.id,
      product_id: image.product_id,
      productId: image.product_id,
      image_url: image.image_url,
      imageUrl: image.image_url,
      sort_order: Number(image.sort_order || 0),
      sortOrder: Number(image.sort_order || 0),
    })),
    image: images[0]?.image_url || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    stand: row.business_name ? {
      id: row.stand_id,
      business_name: row.business_name,
      businessName: row.business_name,
      location: row.location || "",
      image: row.stand_image || "",
      cover_image_url: row.cover_image_url || "",
      marketplace_mode: stand.marketplace_mode,
      marketplaceMode: stand.marketplaceMode,
      delivery_available: stand.delivery_available,
      deliveryAvailable: stand.deliveryAvailable,
      pickup_available: stand.pickup_available,
      pickupAvailable: stand.pickupAvailable,
      delivery_areas: stand.delivery_areas,
      deliveryAreas: stand.deliveryAreas,
      delivery_fee: stand.delivery_fee,
      deliveryFee: stand.deliveryFee,
    } : undefined,
  };
}

async function hydrateProducts(rows = []) {
  if (!rows.length) return [];
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  const images = await all(
    `SELECT id, product_id, image_url, sort_order, created_at
     FROM product_images
     WHERE product_id IN (${ids.map(() => "?").join(", ")})
     ORDER BY product_id ASC, sort_order ASC, id ASC`,
    ids
  );
  const byProduct = images.reduce((grouped, image) => {
    const id = Number(image.product_id);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(image);
    return grouped;
  }, new Map());
  return rows.map((row) => mapProduct(row, byProduct.get(Number(row.id)) || []));
}

async function assertProductCapacity(stand, { excludingProductId = null } = {}) {
  const limits = getPlanProductLimits(stand);
  if (limits.productLimit < 0) return limits;
  const params = [stand.id];
  let excludeSql = "";
  if (excludingProductId) {
    excludeSql = " AND id <> ?";
    params.push(excludingProductId);
  }
  const row = await get(
    `SELECT COUNT(*) AS count
     FROM products
     WHERE stand_id = ?
       AND is_deleted = 0
       AND is_active = 1${excludeSql}`,
    params
  );
  if (Number(row?.count || 0) >= limits.productLimit) {
    const error = new Error(`${limits.tier} allows up to ${limits.productLimit} active products.`);
    error.statusCode = 403;
    error.code = "PRODUCT_LIMIT_REACHED";
    throw error;
  }
  return limits;
}

function normalizedProductFields(body = {}, existing = null) {
  const value = (keys, fallback) => {
    const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(body, candidate));
    return key ? body[key] : fallback;
  };
  const name = cleanText(value(["name", "product_name", "productName"], existing?.name || ""), 140);
  const category = cleanText(value(["category"], existing?.category || ""), 100);
  const description = cleanText(value(["description"], existing?.description || ""), 5000);
  const subcategory = cleanText(value(["subcategory", "sub_category"], existing?.subcategory || ""), 100);
  const price = nullableNumber(value(["price"], existing?.price ?? null), "Product price");
  const salePrice = nullableNumber(value(["sale_price", "salePrice"], existing?.sale_price ?? null), "Sale price");
  const quantity = nullableNumber(
    value(["quantity_available", "quantityAvailable"], existing?.quantity_available ?? null),
    "Quantity available",
    { integer: true }
  );
  const optionsValue = value(["options", "variants", "options_json"], existing?.options_json || []);
  const currency = cleanText(value(["currency"], existing?.currency || "UGX"), 3).toUpperCase() || "UGX";
  const stockStatus = normalizeStockStatus(
    value(["stock_status", "stockStatus"], existing?.stock_status || "in_stock")
  );
  const isActive = boolValue(value(["is_active", "isActive"], existing ? Number(existing.is_active) === 1 : true), true);

  if (!name) {
    const error = new Error("Product name is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!category) {
    const error = new Error("Product category is required.");
    error.statusCode = 400;
    throw error;
  }
  if (price === null || price <= 0) {
    const error = new Error("Product price must be greater than zero.");
    error.statusCode = 400;
    throw error;
  }
  if (salePrice !== null && (salePrice <= 0 || salePrice >= price)) {
    const error = new Error("Sale price must be greater than zero and lower than the regular price.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    const error = new Error("Currency must use a three-letter code such as UGX.");
    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    description,
    category,
    subcategory,
    price,
    salePrice,
    currency,
    stockStatus,
    quantity,
    options: normalizeOptions(optionsValue),
    isActive,
  };
}

async function prepareImageChanges({ productId, ownerId, body, limits, existingImages }) {
  const clearImages = body.clear_images === true || body.clearImages === true;
  const removeInput = body.remove_image_ids || body.removeImageIds || [];
  const removeIds = new Set(
    (Array.isArray(removeInput) ? removeInput : [])
      .map(Number)
      .filter(Number.isInteger)
  );
  const retained = clearImages
    ? []
    : existingImages.filter((image) => !removeIds.has(Number(image.id)));
  const requested = Array.isArray(body.images) ? body.images : [];
  const retainedIds = new Set(retained.map((image) => Number(image.id)));
  const retainedUrls = new Set(retained.map((image) => String(image.image_url)));
  const newReferences = [];

  for (const item of requested) {
    const itemId = Number(item?.id || 0);
    if (itemId && retainedIds.has(itemId)) continue;
    const reference = validateImageReference(imageReference(item));
    if (!reference || retainedUrls.has(reference) || newReferences.includes(reference)) continue;
    newReferences.push(reference);
  }

  const hasImageMutation = clearImages ||
    removeIds.size > 0 ||
    Object.prototype.hasOwnProperty.call(body, "images") ||
    Object.prototype.hasOwnProperty.call(body, "image_order") ||
    Object.prototype.hasOwnProperty.call(body, "imageOrder");
  if (hasImageMutation && retained.length + newReferences.length > limits.productImageLimit) {
    const error = new Error(`${limits.tier} allows up to ${limits.productImageLimit} images per product.`);
    error.statusCode = 403;
    error.code = "PRODUCT_IMAGE_LIMIT_REACHED";
    throw error;
  }

  const materialized = [];
  for (let index = 0; index < newReferences.length; index += 1) {
    materialized.push(await materializeImageReference(newReferences[index], {
      ownerId,
      kind: `product-${productId || "new"}-${Date.now()}-${index + 1}`,
    }));
  }
  return { clearImages, removeIds, retained, materialized };
}

export async function browseProducts(req, res, next) {
  try {
    const conditions = [
      publicBusinessWhere("b"),
      "b.marketplace_mode IN ('product', 'hybrid')",
      "p.is_deleted = 0",
      "p.is_active = 1",
      "p.stock_status <> 'hidden'",
    ];
    const params = [...publicBusinessParams(new Date())];
    const query = cleanText(req.query.q || req.query.search, 120).toLowerCase();
    const category = cleanText(req.query.category, 100).toLowerCase();
    const subcategory = cleanText(req.query.subcategory, 100).toLowerCase();
    const stockStatus = cleanText(req.query.stock_status || req.query.stockStatus, 30).toLowerCase();
    const standId = Number(req.query.stand_id || req.query.standId || 0);
    if (query) {
      conditions.push("(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(b.business_name) LIKE ?)");
      const term = `%${query}%`;
      params.push(term, term, term, term);
    }
    if (category) {
      conditions.push("LOWER(p.category) = ?");
      params.push(category);
    }
    if (subcategory) {
      conditions.push("LOWER(p.subcategory) = ?");
      params.push(subcategory);
    }
    if (stockStatus && STOCK_STATUSES.has(stockStatus) && stockStatus !== "hidden") {
      conditions.push("p.stock_status = ?");
      params.push(stockStatus);
    }
    if (standId > 0) {
      conditions.push("p.stand_id = ?");
      params.push(standId);
    }
    const requestedLimit = Number(req.query.limit || 24);
    const requestedPage = Number(req.query.page || 1);
    const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 24;
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    params.push(limit, (page - 1) * limit);
    const rows = await all(
      `SELECT p.*, b.business_name, b.location, b.image AS stand_image,
              b.cover_image_url, b.marketplace_mode, b.delivery_available,
              b.pickup_available, b.delivery_areas_json, b.delivery_fee
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      params
    );
    res.json({ success: true, products: await hydrateProducts(rows), page, limit });
  } catch (error) {
    next(error);
  }
}

export async function getPublicProduct(req, res, next) {
  try {
    const product = await get(
      `SELECT p.*, b.business_name, b.location, b.image AS stand_image,
              b.cover_image_url, b.marketplace_mode, b.delivery_available,
              b.pickup_available, b.delivery_areas_json, b.delivery_fee
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE (p.id = ? OR p.slug = ?)
         AND p.is_deleted = 0
         AND p.is_active = 1
         AND p.stock_status <> 'hidden'
         AND b.marketplace_mode IN ('product', 'hybrid')
         AND ${publicBusinessWhere("b")}
       LIMIT 1`,
      [Number(req.params.id) || -1, String(req.params.id || ""), ...publicBusinessParams(new Date())]
    );
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    const images = await getProductImages(product.id);
    return res.json({ success: true, product: mapProduct(product, images) });
  } catch (error) {
    next(error);
  }
}

export function listStandProducts(req, res, next) {
  req.query = { ...req.query, stand_id: req.params.standId };
  return browseProducts(req, res, next);
}

export async function listMyProducts(req, res, next) {
  try {
    const stand = await getOwnerStand(req.user.id);
    if (!stand) return res.status(404).json({ success: false, message: "Create a stand before adding products." });
    const includeDeleted = req.query.include_deleted === "true";
    const rows = await all(
      `SELECT p.*, b.business_name, b.location, b.image AS stand_image,
              b.cover_image_url, b.marketplace_mode, b.delivery_available,
              b.pickup_available, b.delivery_areas_json, b.delivery_fee
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE p.stand_id = ?${includeDeleted ? "" : " AND p.is_deleted = 0"}
       ORDER BY p.updated_at DESC, p.id DESC`,
      [stand.id]
    );
    return res.json({
      success: true,
      stand: normalizeStandForClient(stand),
      limits: getPlanProductLimits(stand),
      products: await hydrateProducts(rows),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyProduct(req, res, next) {
  try {
    const product = await get(
      `SELECT p.*, b.business_name, b.location, b.image AS stand_image,
              b.cover_image_url, b.marketplace_mode, b.delivery_available,
              b.pickup_available, b.delivery_areas_json, b.delivery_fee
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE p.id = ? AND p.owner_user_id = ?
       LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    return res.json({ success: true, product: mapProduct(product, await getProductImages(product.id)) });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req, res, next) {
  try {
    const stand = await getOwnerStand(req.user.id);
    if (!stand) return res.status(404).json({ success: false, message: "Create a stand before adding products." });
    if (!supportsProducts(stand)) {
      return res.status(400).json({
        success: false,
        code: "STAND_DOES_NOT_SUPPORT_PRODUCTS",
        message: "Choose Products / Shop or Both in stand setup before adding products.",
      });
    }
    const fields = normalizedProductFields(req.body);
    const limits = fields.isActive
      ? await assertProductCapacity(stand)
      : getPlanProductLimits(stand);
    const images = await prepareImageChanges({
      productId: null,
      ownerId: req.user.id,
      body: req.body,
      limits,
      existingImages: [],
    });
    const product = await transaction(async (tx) => {
      const inserted = await tx.run(
        `INSERT INTO products
         (stand_id, owner_user_id, name, slug, description, category, subcategory, price, sale_price,
          currency, stock_status, quantity_available, options_json, is_active, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          stand.id,
          req.user.id,
          fields.name,
          fields.description,
          fields.category,
          fields.subcategory,
          fields.price,
          fields.salePrice,
          fields.currency,
          fields.stockStatus,
          fields.quantity,
          JSON.stringify(fields.options),
          fields.isActive ? 1 : 0,
        ]
      );
      const slug = productSlug(fields.name, inserted.lastID);
      await tx.run(`UPDATE products SET slug = ? WHERE id = ?`, [slug, inserted.lastID]);
      for (let index = 0; index < images.materialized.length; index += 1) {
        await tx.run(
          `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
          [inserted.lastID, images.materialized[index], index]
        );
      }
      return tx.get(`SELECT * FROM products WHERE id = ?`, [inserted.lastID]);
    });
    await recordAuditEvent({
      eventType: AUDIT_EVENTS.PRODUCT_CREATED || "product.created",
      actorUserId: req.user.id,
      actorRole: req.user.role,
      targetType: "product",
      targetId: product.id,
      metadata: { stand_id: stand.id },
      req,
    });
    return res.status(201).json({
      success: true,
      product: mapProduct(product, await getProductImages(product.id)),
      limits,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const existing = await get(
      `SELECT p.*, b.subscription_tier, b.selected_plan, b.subscription_status, b.marketplace_mode
       FROM products p
       JOIN barbers b ON b.id = p.stand_id
       WHERE p.id = ? AND p.owner_user_id = ? AND p.is_deleted = 0
       LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ success: false, message: "Product not found." });
    const fields = normalizedProductFields(req.body, existing);
    const activating = fields.isActive && Number(existing.is_active) !== 1;
    const limits = activating
      ? await assertProductCapacity({ ...existing, id: existing.stand_id }, { excludingProductId: existing.id })
      : getPlanProductLimits(existing);
    const existingImages = await getProductImages(existing.id);
    const imageChanges = await prepareImageChanges({
      productId: existing.id,
      ownerId: req.user.id,
      body: req.body,
      limits,
      existingImages,
    });
    await transaction(async (tx) => {
      await tx.run(
        `UPDATE products
         SET name = ?, slug = ?, description = ?, category = ?, subcategory = ?, price = ?, sale_price = ?,
             currency = ?, stock_status = ?, quantity_available = ?, options_json = ?, is_active = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
        [
          fields.name,
          productSlug(fields.name, existing.id),
          fields.description,
          fields.category,
          fields.subcategory,
          fields.price,
          fields.salePrice,
          fields.currency,
          fields.stockStatus,
          fields.quantity,
          JSON.stringify(fields.options),
          fields.isActive ? 1 : 0,
          existing.id,
          req.user.id,
        ]
      );
      if (imageChanges.clearImages) {
        await tx.run(`DELETE FROM product_images WHERE product_id = ?`, [existing.id]);
      } else if (imageChanges.removeIds.size) {
        for (const imageId of imageChanges.removeIds) {
          await tx.run(`DELETE FROM product_images WHERE id = ? AND product_id = ?`, [imageId, existing.id]);
        }
      }
      const nextSort = imageChanges.retained.reduce(
        (max, image) => Math.max(max, Number(image.sort_order || 0)),
        -1
      ) + 1;
      for (let index = 0; index < imageChanges.materialized.length; index += 1) {
        await tx.run(
          `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
          [existing.id, imageChanges.materialized[index], nextSort + index]
        );
      }
      const imageOrder = Array.isArray(req.body.image_order || req.body.imageOrder)
        ? req.body.image_order || req.body.imageOrder
        : [];
      for (let index = 0; index < imageOrder.length; index += 1) {
        await tx.run(
          `UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?`,
          [index, Number(imageOrder[index]), existing.id]
        );
      }
    });
    const updated = await get(`SELECT * FROM products WHERE id = ?`, [existing.id]);
    await recordAuditEvent({
      eventType: AUDIT_EVENTS.PRODUCT_UPDATED || "product.updated",
      actorUserId: req.user.id,
      actorRole: req.user.role,
      targetType: "product",
      targetId: existing.id,
      req,
    });
    return res.json({
      success: true,
      product: mapProduct(updated, await getProductImages(existing.id)),
      limits,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProductStock(req, res, next) {
  req.body = {
    ...(await get(`SELECT * FROM products WHERE id = ? AND owner_user_id = ?`, [req.params.id, req.user.id]) || {}),
    ...req.body,
  };
  return updateProduct(req, res, next);
}

export async function deleteProduct(req, res, next) {
  try {
    const product = await get(
      `SELECT id, stand_id FROM products WHERE id = ? AND owner_user_id = ? AND is_deleted = 0`,
      [req.params.id, req.user.id]
    );
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    await run(
      `UPDATE products
       SET is_deleted = 1, is_active = 0, stock_status = 'hidden', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND owner_user_id = ?`,
      [product.id, req.user.id]
    );
    await recordAuditEvent({
      eventType: AUDIT_EVENTS.PRODUCT_DELETED || "product.deleted",
      actorUserId: req.user.id,
      actorRole: req.user.role,
      targetType: "product",
      targetId: product.id,
      metadata: { stand_id: product.stand_id },
      req,
    });
    return res.json({ success: true, message: "Product removed.", product_id: product.id });
  } catch (error) {
    next(error);
  }
}
