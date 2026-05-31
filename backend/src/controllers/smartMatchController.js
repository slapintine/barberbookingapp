import { findSmartMatches } from "../services/smartMatchService.js";

const VALID_PREFERENCES = new Set(["best_match", "affordable", "best_rated"]);

function isValidDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value) {
  return !value || /^\d{2}:\d{2}$/.test(value);
}

function validateSmartMatchBody(body = {}) {
  const category = String(body.category || body.service || "").trim();
  const location = body.location && typeof body.location === "object" ? body.location : {};
  const locationLabel = String(location.label || "").trim();
  const budgetMin = body.budgetMin === "" || body.budget_min === "" ? 0 : Number(body.budgetMin ?? body.budget_min ?? 0);
  const budgetMax = body.budgetMax === "" || body.budget_max === "" ? 0 : Number(body.budgetMax ?? body.budget_max ?? 0);
  const date = String(body.date || "").slice(0, 10);
  const time = String(body.time || "").slice(0, 5);
  const preference = String(body.preference || "best_match").toLowerCase();
  const lat = location.lat === "" || location.lat === undefined ? "" : Number(location.lat);
  const lng = location.lng === "" || location.lng === undefined ? "" : Number(location.lng);

  if (!category) return { error: "Service category is required." };
  if (!locationLabel) return { error: "Location is required." };
  if ((lat !== "" && !Number.isFinite(lat)) || (lng !== "" && !Number.isFinite(lng))) return { error: "Location coordinates are invalid." };
  if (![budgetMin, budgetMax].every((value) => Number.isFinite(value) && value >= 0)) return { error: "Budget values must be positive numbers." };
  if (budgetMax > 0 && budgetMin > budgetMax) return { error: "Budget maximum must be greater than minimum." };
  if (!isValidDate(date)) return { error: "Date must use YYYY-MM-DD format." };
  if (!isValidTime(time)) return { error: "Time must use HH:mm format." };
  if (!VALID_PREFERENCES.has(preference)) return { error: "Preference must be best_match, affordable, or best_rated." };

  return {
    value: {
      category,
      location: { label: locationLabel, lat, lng },
      budgetMin,
      budgetMax,
      date,
      time,
      preference,
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
