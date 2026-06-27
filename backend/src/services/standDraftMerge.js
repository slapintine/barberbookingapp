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

export function getStandPublishMissingDetails({ stand = {}, services = [], schedule = [] } = {}) {
  const missing = [];
  const businessName = String(stand.business_name || "").trim();
  const location = String(stand.location || "").trim();
  const category = String(stand.business_type || "").trim();
  const phone = String(stand.phone || "").trim();
  const mapIcon = String(stand.map_icon_type || "").trim();

  if (!businessName || /^Business stand draft \d+$/i.test(businessName)) missing.push("business name");
  if (!category || category.toLowerCase() === "services") missing.push("business category");
  if (!phone) missing.push("business phone");
  if (!location || location === "Location not set") missing.push("business location");
  if (!mapIcon) missing.push("map icon");
  if (!Array.isArray(services) || !services.length) {
    missing.push("at least one service");
  } else if (services.some((service) => {
    if (!String(service?.service_name || service?.serviceName || "").trim()) return true;
    const pricingType = String(service?.pricing_type || service?.pricingType || "fixed").toLowerCase();
    if (pricingType === "fixed" && Number(service?.price_extra ?? service?.price ?? 0) <= 0) return true;
    if (pricingType === "range" && (
      Number(service?.min_price ?? service?.minPrice ?? 0) <= 0 ||
      Number(service?.max_price ?? service?.maxPrice ?? 0) <= Number(service?.min_price ?? service?.minPrice ?? 0)
    )) return true;
    if (pricingType === "starting_from" && Number(service?.starting_price ?? service?.startingPrice ?? 0) <= 0) return true;
    const duration = Number(service?.duration_minutes ?? service?.durationMinutes ?? 0);
    return duration < 5 || duration > 1440;
  })) {
    missing.push("complete service details");
  }
  const hasOpeningHours = Array.isArray(schedule) && schedule.some((day) => {
    const isOpen = day?.is_open === true || day?.isOpen === true || Number(day?.is_open ?? day?.isOpen) === 1;
    const start = String(day?.start_time || day?.startTime || "");
    const end = String(day?.end_time || day?.endTime || "");
    return isOpen && /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end;
  });
  if (!hasOpeningHours) missing.push("opening hours");
  return missing;
}
