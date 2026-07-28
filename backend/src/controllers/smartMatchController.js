import { compareSmartMatchProviders, findSmartMatches, normalizeCategoryKey } from "../services/smartMatchService.js";
import { parseSmartMatchPrompt } from "../services/assistantFoundationService.js";

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
  const date = String(body.date || body.preferredDate || body.preferred_date || "").trim();
  const time = String(body.time || body.preferredTime || body.preferred_time || "").trim().slice(0, 5);
  const budgetMax = body.budgetMax ?? body.budget_max ?? body.budget;
  const minimumRating = body.minimumRating ?? body.minimum_rating;
  const notes = String(body.notes || body.specialRequest || body.special_request || "").trim().slice(0, 500);

  if (!serviceKey || serviceKey === "other" && !String(body.serviceKey || body.category || body.service || "").trim()) {
    return { error: "Service category is required." };
  }
  if (!VALID_WHEN.has(when)) return { error: "Timing must be now, today, or this_week." };
  if (!VALID_LOCATION_TYPES.has(locationType)) return { error: "Location type must be use_current_location or enter_address." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Preferred date must use YYYY-MM-DD." };
  if (time && (!/^\d{2}:\d{2}$/.test(time) || Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59)) {
    return { error: "Preferred time must use HH:MM." };
  }
  const parsedBudgetMax = budgetMax === undefined || budgetMax === "" ? null : Number(budgetMax);
  if (parsedBudgetMax !== null && (!Number.isFinite(parsedBudgetMax) || parsedBudgetMax < 0)) {
    return { error: "Budget must be a positive amount." };
  }
  const parsedMinimumRating = minimumRating === undefined || minimumRating === "" ? null : Number(minimumRating);
  if (parsedMinimumRating !== null && (!Number.isFinite(parsedMinimumRating) || parsedMinimumRating < 0 || parsedMinimumRating > 5)) {
    return { error: "Minimum rating must be between 0 and 5." };
  }
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
      date,
      time,
      budgetMax: parsedBudgetMax,
      minimumRating: parsedMinimumRating,
      notes,
    },
  };
}

export async function smartMatch(req, res, next) {
  try {
    const validation = validateSmartMatchBody(req.body);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const result = await findSmartMatches({ ...validation.value, customerUserId: req.user?.id });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function compareSmartMatch(req, res, next) {
  try {
    const validation = validateSmartMatchBody(req.body?.criteria || req.body || {});
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }
    const providerIds = Array.isArray(req.body?.providerIds) ? req.body.providerIds : [];
    if (!providerIds.length || providerIds.length > 3) {
      return res.status(400).json({ success: false, message: "Choose one to three providers to compare." });
    }
    const result = await compareSmartMatchProviders(
      { ...validation.value, customerUserId: req.user?.id },
      providerIds
    );
    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function parseSmartMatch(req, res, next) {
  try {
    const message = String(req.body?.message || req.body?.text || "").trim();
    if (!message) {
      return res.status(400).json({ success: false, message: "Tell Smart Match what service you need." });
    }
    const parsed = parseSmartMatchPrompt(message, req.body?.context || {});
    return res.json({ success: true, ...parsed });
  } catch (error) {
    next(error);
  }
}
