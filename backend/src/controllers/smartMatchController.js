import { findSmartMatches, normalizeCategoryKey } from "../services/smartMatchService.js";

const VALID_WHEN = new Set(["now", "today", "this_week"]);
const VALID_LOCATION_TYPES = new Set(["use_current_location", "enter_address"]);

function normalizeCoordinates(value = {}) {
  if (!value || typeof value !== "object") return null;
  const lat = value.lat ?? value.latitude;
  const lng = value.lng ?? value.longitude;
  if (lat === undefined || lng === undefined || lat === "" || lng === "") return null;
  const parsed = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) ? parsed : null;
}

function validateSmartMatchBody(body = {}) {
  const legacyLocation = body.location && typeof body.location === "object" ? body.location : {};
  const serviceKey = normalizeCategoryKey(body.serviceKey || body.category || body.service || "");
  const serviceLabel = String(body.serviceLabel || body.service_label || "").trim();
  const when = String(body.when || body.dateMode || (body.date ? "today" : "") || "").trim().toLowerCase();
  const locationType = String(body.locationType || body.location_type || (legacyLocation.label ? "enter_address" : "") || "").trim().toLowerCase();
  const address = String(body.address || legacyLocation.label || "").trim();
  const coordinates = normalizeCoordinates(body.coordinates || legacyLocation);

  if (!serviceKey || serviceKey === "other" && !String(body.serviceKey || body.category || body.service || "").trim()) {
    return { error: "Service category is required." };
  }
  if (!VALID_WHEN.has(when)) return { error: "Timing must be now, today, or this_week." };
  if (!VALID_LOCATION_TYPES.has(locationType)) return { error: "Location type must be use_current_location or enter_address." };
  if (locationType === "use_current_location" && !coordinates && !address) {
    return { error: "Current location or address is required." };
  }
  if (locationType === "enter_address" && !address) {
    return { error: "Address is required." };
  }

  return {
    value: {
      serviceKey,
      serviceLabel,
      when,
      locationType,
      coordinates,
      address,
    },
  };
}

export async function smartMatch(req, res, next) {
  try {
    const validation = validateSmartMatchBody(req.body);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const result = await findSmartMatches(validation.value);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
