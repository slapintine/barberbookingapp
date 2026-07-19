const PENDING_BOOKING_VERSION = 1;

function toPositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function cleanTime(value) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

export function isSafeInternalAppPath(value, appBase = "/app") {
  const target = String(value || "").trim();
  if (!target) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
  if (target.startsWith("//") || target.includes("\\")) return false;
  const normalizedBase = String(appBase || "").replace(/\/+$/, "");
  if (target.startsWith("/")) {
    return !normalizedBase || target === normalizedBase || target.startsWith(`${normalizedBase}/`);
  }
  return !target.startsWith(".") && !target.includes("//");
}

export function sanitizeBookingReturnPath(value, fallback = "/app/") {
  return isSafeInternalAppPath(value) ? String(value).trim() : fallback;
}

export function createPendingBookingIntent({
  providerId,
  serviceId,
  selectedDate = "",
  selectedTime = "",
  returnPath = "/app/",
} = {}) {
  const cleanProviderId = toPositiveId(providerId);
  const cleanServiceId = toPositiveId(serviceId);
  if (!cleanProviderId || !cleanServiceId) return null;
  return {
    version: PENDING_BOOKING_VERSION,
    type: "booking",
    providerId: cleanProviderId,
    serviceId: cleanServiceId,
    selectedDate: cleanDate(selectedDate),
    selectedTime: cleanTime(selectedTime),
    returnPath: sanitizeBookingReturnPath(returnPath),
    createdAt: Date.now(),
  };
}

export function resolvePendingBookingIntent(intent, providers = [], now = Date.now()) {
  if (!intent || intent.type !== "booking") {
    return { ok: false, reason: "missing" };
  }
  if (Number(intent.version || 0) !== PENDING_BOOKING_VERSION) {
    return { ok: false, reason: "unsupported" };
  }
  if (Number(intent.createdAt || 0) && now - Number(intent.createdAt) > 30 * 60 * 1000) {
    return { ok: false, reason: "expired" };
  }
  const providerId = toPositiveId(intent.providerId);
  const serviceId = toPositiveId(intent.serviceId);
  if (!providerId || !serviceId) return { ok: false, reason: "invalid" };

  const provider = (Array.isArray(providers) ? providers : []).find((item) => Number(item?.id) === providerId);
  if (!provider) return { ok: false, reason: "provider_missing" };
  const service = (Array.isArray(provider.services) ? provider.services : []).find((item) => Number(item?.id) === serviceId);
  if (!service) return { ok: false, reason: "service_missing", provider };
  return {
    ok: true,
    provider,
    service,
    selectedDate: cleanDate(intent.selectedDate),
    selectedTime: cleanTime(intent.selectedTime),
  };
}
