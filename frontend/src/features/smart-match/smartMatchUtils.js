import { SERVICE_CATEGORIES, WHEN_OPTIONS } from "./smartMatchConstants.js";
import { getCategoryByName, inferCategoryNameFromText, normalizeCategoryKey } from "../../utils/serviceCatalog.js";
export {
  buildSmartMatchBookingContext,
  buildSmartMatchProvider,
  getSmartMatchCriteriaKey as getCriteriaKey,
} from "./smartMatchContext.js";

export const initialSmartMatchState = {
  step: "need",
  selectedService: null,
  selectedWhen: null,
  preferredDate: "",
  preferredTime: "",
  budgetMax: "",
  minimumRating: "",
  notes: "",
  selectedLocationType: null,
  selectedAddress: "",
  userCoordinates: null,
  matchResults: [],
  aiReasons: [],
  reasonCode: "",
  nearestProvider: null,
  nearestLocation: "",
  nearestDistanceKm: null,
  suggestions: [],
  loading: false,
  error: "",
};

export function getServiceByKey(key) {
  const category = getCategoryByName(key) || getCategoryByName(inferCategoryNameFromText(key, key));
  const normalizedKey = normalizeCategoryKey(category?.id || category?.name || key);
  return SERVICE_CATEGORIES.find((item) => item.key === normalizedKey || normalizeCategoryKey(item.label) === normalizedKey) || null;
}

export function getWhenByKey(key) {
  return WHEN_OPTIONS.find((item) => item.key === key) || null;
}

export function normalizeInitialSmartMatch(initial = {}, fallbackLocation = "") {
  const categoryText = String(initial.category || initial.service || "").trim();
  const inferredCategory = categoryText ? inferCategoryNameFromText(categoryText, categoryText) : "";
  const selectedService = getServiceByKey(inferredCategory || categoryText);
  const rawLocation = initial.location;
  const address =
    typeof rawLocation === "string"
      ? rawLocation
      : rawLocation?.label || rawLocation?.address || fallbackLocation || "";
  const coords =
    rawLocation && typeof rawLocation === "object" && (rawLocation.lat || rawLocation.latitude)
      ? {
          lat: Number(rawLocation.lat ?? rawLocation.latitude),
          lng: Number(rawLocation.lng ?? rawLocation.longitude),
        }
      : null;
  return {
    ...initialSmartMatchState,
    selectedService,
    preferredDate: String(initial.date || initial.preferredDate || "").trim(),
    preferredTime: String(initial.time || initial.preferredTime || "").trim().slice(0, 5),
    budgetMax: initial.budgetMax != null ? String(initial.budgetMax) : "",
    minimumRating: initial.minimumRating != null ? String(initial.minimumRating) : "",
    notes: String(initial.notes || initial.specialRequest || "").trim(),
    selectedAddress: address,
    userCoordinates: coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? coords : null,
  };
}

export function smartMatchSummary(state = {}) {
  const service = state.selectedService?.label || "Service";
  const when = state.preferredDate || state.preferredTime
    ? [state.preferredDate, state.preferredTime].filter(Boolean).join(" at ")
    : getWhenByKey(state.selectedWhen)?.label || "When";
  const where = state.selectedLocationType === "use_current_location" ? "Current location" : state.selectedAddress || "Address";
  return `${service} \u00B7 ${when} \u00B7 ${where}`;
}
