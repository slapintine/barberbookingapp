import { getPublishRequirements } from "./marketplaceCapabilities.js";

function owns(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function getClearFields(body = {}) {
  return new Set(
    (Array.isArray(body.clear_fields) ? body.clear_fields : [])
      .map((field) => String(field || "").trim())
      .filter(Boolean)
  );
}

export function hasAnyOwn(body = {}, keys = []) {
  return keys.some((key) => owns(body, key));
}

export function firstOwnValue(body = {}, keys = []) {
  const key = keys.find((candidate) => owns(body, candidate));
  return key ? body[key] : undefined;
}

export function mergeDraftText({
  body = {},
  keys = [],
  existing = "",
  clearFields = getClearFields(body),
  clearKey = keys[0],
  trim = true,
}) {
  if (!hasAnyOwn(body, keys)) return existing ?? "";
  const raw = firstOwnValue(body, keys);
  const value = trim ? String(raw ?? "").trim() : String(raw ?? "");
  if (value) return value;
  return clearFields.has(clearKey) ? "" : existing ?? "";
}

export function mergeDraftNumber({
  body = {},
  keys = [],
  existing = null,
  clearFields = getClearFields(body),
  clearKey = keys[0],
}) {
  if (!hasAnyOwn(body, keys)) return existing;
  const raw = firstOwnValue(body, keys);
  if (raw === "" || raw === null || raw === undefined) {
    return clearFields.has(clearKey) ? null : existing;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : existing;
}

export function mergeDraftBoolean({ body = {}, keys = [], existing = false }) {
  if (!hasAnyOwn(body, keys)) return Boolean(existing);
  const value = firstOwnValue(body, keys);
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

export function mergeDraftArray({
  body = {},
  keys = [],
  existing = [],
  clearFields = getClearFields(body),
  clearKey = keys[0],
}) {
  if (!hasAnyOwn(body, keys)) return Array.isArray(existing) ? existing : [];
  const value = firstOwnValue(body, keys);
  if (Array.isArray(value) && value.length) return value;
  if (clearFields.has(clearKey)) return [];
  return Array.isArray(existing) ? existing : [];
}

export function hasMeaningfulDraftChanges(body = {}) {
  return Object.keys(body || {}).some((key) => {
    if (["submit_intent", "clear_fields"].includes(key)) return false;
    const value = body[key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    if (typeof value === "boolean" || typeof value === "number") return true;
    return String(value ?? "").trim().length > 0;
  }) || getClearFields(body).size > 0;
}

export function normalizeUgandaStandPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("256")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^(?:7\d|20|31|39)\d{7}$/.test(digits)) return "";
  return `+256${digits}`;
}

export function getStandPublishMissingDetails({ stand = {}, services = [], products = [], schedule = [] } = {}) {
  return getPublishRequirements({ stand, services, products, schedule }).missing;
}
