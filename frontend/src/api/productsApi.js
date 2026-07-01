import { apiFetch } from "../config/api.js";

export function getMarketplaceFeatures() {
  return apiFetch("/api/marketplace/categories");
}

export function browseProducts(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") search.set(key, String(value));
  }
  return apiFetch(`/api/products${search.size ? `?${search.toString()}` : ""}`);
}

export function getProduct(productId) {
  return apiFetch(`/api/products/${encodeURIComponent(productId)}`);
}

export function getMyProducts(options = {}) {
  const query = options.includeDeleted ? "?include_deleted=true" : "";
  return apiFetch(`/api/products/mine${query}`);
}

export function createProduct(payload) {
  return apiFetch("/api/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProduct(productId, payload) {
  return apiFetch(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateProductStock(productId, payload) {
  return apiFetch(`/api/products/${encodeURIComponent(productId)}/stock`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function removeProduct(productId) {
  return apiFetch(`/api/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
}

export function createProductOrder(payload) {
  const idempotencyKey = String(payload.idempotency_key || payload.idempotencyKey || "").trim();
  return apiFetch("/api/product-orders", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
  });
}

export function getSellerProductOrders(params = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  return apiFetch(`/api/product-orders/seller${search.size ? `?${search.toString()}` : ""}`);
}

export function getMyProductOrders() {
  return apiFetch("/api/product-orders/customer");
}

export function updateProductOrderStatus(orderId, payload) {
  return apiFetch(`/api/product-orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createProductInquiry(payload) {
  const idempotencyKey = String(payload.idempotency_key || payload.idempotencyKey || "").trim();
  return apiFetch("/api/product-inquiries", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
  });
}

export function getMyProductInquiries(view = "") {
  return apiFetch(`/api/product-inquiries/mine${view ? `?view=${encodeURIComponent(view)}` : ""}`);
}
