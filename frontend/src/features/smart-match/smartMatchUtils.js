import { SERVICE_CATEGORIES, WHEN_OPTIONS } from "./smartMatchConstants.js";
import { getCategoryByName, inferCategoryNameFromText, normalizeCategoryKey } from "../../utils/serviceCatalog.js";

export const initialSmartMatchState = {
  step: "need",
  selectedService: null,
  selectedWhen: null,
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
    selectedAddress: address,
    userCoordinates: coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? coords : null,
  };
}

export function smartMatchSummary(state = {}) {
  const service = state.selectedService?.label || "Service";
  const when = getWhenByKey(state.selectedWhen)?.label || "When";
  const where = state.selectedLocationType === "use_current_location" ? "Current location" : state.selectedAddress || "Address";
  return `${service} \u00B7 ${when} \u00B7 ${where}`;
}

export function getCriteriaKey(state = {}) {
  return JSON.stringify({
    serviceKey: state.selectedService?.key || "",
    when: state.selectedWhen || "",
    locationType: state.selectedLocationType || "",
    address: String(state.selectedAddress || "").trim().toLowerCase(),
    lat: state.userCoordinates?.lat || "",
    lng: state.userCoordinates?.lng || "",
  });
}
