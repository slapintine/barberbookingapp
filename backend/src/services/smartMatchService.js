import { publicBusinessParams, publicBusinessWhere } from "./businessVisibility.js";
import { SERVICE_CATEGORIES } from "../data/serviceCategories.js";

export const SMART_MATCH_WEIGHTS = {
  serviceMatch: 35,
  distance: 25,
  timingFit: 15,
  rating: 10,
  reviewsConfidence: 5,
  availability: 10,
};

export const SMART_MATCH_REASON_CODES = {
  SYSTEM_ERROR: "SYSTEM_ERROR",
  NO_SERVICE_PROVIDERS: "NO_SERVICE_PROVIDERS",
  NO_NEARBY_PROVIDERS: "NO_NEARBY_PROVIDERS",
  NO_TIME_MATCH: "NO_TIME_MATCH",
  FILTERS_TOO_NARROW: "FILTERS_TOO_NARROW",
  NO_EXACT_MATCH: "NO_EXACT_MATCH",
};

const MAX_NEARBY_DISTANCE_KM = 15;

const LEGACY_CATEGORY_KEYS = {
  barber: "barber",
  beauty: "beauty",
  salon: "salon",
  spa: "spa",
  plumbing: "plumbing-services",
  carpentry: "construction-renovation",
  cleaning: "cleaning-services",
  repairs: "repairs-maintenance",
  tutor: "education-tutoring",
  other: "other",
};

const SERVICE_ALIASES = {
  barber: ["barber", "haircut", "hair cut", "grooming", "shave"],
  beauty: ["beauty", "makeup", "nails", "lashes", "skin care"],
  salon: ["salon", "hair", "braids", "styling", "hair treatment"],
  spa: ["spa", "massage", "facial", "wellness"],
  "plumbing-services": ["plumbing", "plumber", "pipe", "leak", "drainage", "water tank", "bathroom repair"],
  "electrical-services": ["electrical", "electrician", "wiring", "lighting", "solar", "power repair"],
  "construction-renovation": ["construction", "renovation", "builder", "painting", "roofing", "masonry", "carpentry", "carpenter", "woodwork"],
  "moving-transport": ["moving", "transport", "truck hire", "house move", "logistics", "boda"],
  "real-estate-services": ["real estate", "property", "rental", "agent", "valuation", "property management"],
  "childcare-services": ["childcare", "babysitting", "babysitter", "nanny", "school pickup"],
  "pet-services": ["pet", "pet grooming", "pet sitting", "dog walking", "animal care"],
  "agriculture-services": ["agriculture", "farm", "gardening", "livestock", "agribusiness"],
  "home-services": ["home service", "home help", "installation", "household help", "at home"],
  "auto-services": ["auto", "car", "mechanic", "garage", "car wash", "detailing", "towing", "vehicle"],
  "events-photography": ["events", "event", "photography", "photo", "video", "decor", "dj", "mc"],
  "education-tutoring": ["education", "tutoring", "tutor", "private tutor", "teacher", "lesson", "lessons", "academic support", "math", "mathematics", "english", "science", "french", "homework", "exam", "school", "music lessons", "art lessons"],
  "health-fitness": ["health", "fitness", "gym", "trainer", "physio", "wellness", "nutrition", "massage"],
  "repairs-maintenance": ["repair", "repairs", "maintenance", "fix", "technician", "appliance", "electronics", "phone repair", "computer", "furniture"],
  "website-app-development": ["website", "web development", "app development", "mobile app", "booking tool", "automation", "technical build"],
  "digital-marketing": ["digital marketing", "social media", "ads", "seo", "content strategy", "campaign"],
  "consulting-services": ["consulting", "consultant", "business strategy", "operations", "career advisory", "specialist advisory"],
  "accounting-tax": ["accounting", "tax", "bookkeeping", "payroll", "audit", "financial records"],
  "legal-services": ["legal", "lawyer", "contract", "company registration", "compliance", "legal consultation"],
  "design-branding": ["design", "branding", "logo", "brand identity", "graphics", "packaging design"],
  "writing-translation": ["writing", "translation", "copywriting", "editing", "transcription", "documents"],
  "printing-stationery": ["printing", "stationery", "photocopying", "business documents"],
  "it-support": ["it support", "computer setup", "troubleshooting", "networking", "cybersecurity", "computer repair"],
  "security-services": ["security", "guard", "cctv", "access control", "alarm", "property security"],
  "business-services": ["business", "professional service", "office service"],
  "laundry-services": ["laundry", "dry cleaning", "ironing", "wash and fold", "fabric care"],
  "cleaning-services": ["cleaning", "cleaner", "deep clean", "fumigation", "sanitation"],
  "catering-food-services": ["catering", "food", "meal prep", "cake", "private chef", "food vendor"],
  "delivery-errands": ["delivery", "errand", "courier", "pickup", "document drop", "runner"],
};

const CATEGORY_BY_ID = new Map(SERVICE_CATEGORIES.map((category) => [category.id, category]));

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyCategory(value = "") {
  return normalize(value).replace(/\s+/g, "-");
}

function getCategoryByInput(value = "") {
  const clean = normalize(value);
  const slug = slugifyCategory(value);
  return SERVICE_CATEGORIES.find((category) =>
    category.id === slug ||
    normalize(category.name) === clean ||
    slugifyCategory(category.name) === slug
  ) || null;
}

export function normalizeCategoryKey(value = "") {
  const clean = normalize(value);
  if (!clean || clean === "all") return "other";
  const slug = slugifyCategory(value);
  const directCategory = getCategoryByInput(value);
  if (directCategory) return directCategory.id;
  if (LEGACY_CATEGORY_KEYS[slug]) return LEGACY_CATEGORY_KEYS[slug];
  if (CATEGORY_BY_ID.has(slug)) return slug;

  const matchingAlias = Object.entries(SERVICE_ALIASES).find(([, aliases]) =>
    aliases.some((term) => clean.includes(normalize(term)))
  );
  return matchingAlias ? matchingAlias[0] : "other";
}

export function serviceLabelForKey(key = "") {
  return CATEGORY_BY_ID.get(normalizeCategoryKey(key))?.name || "Service";
}

export function categoryMatches(row, requestedCategory) {
  const serviceKey = normalizeCategoryKey(requestedCategory);
  if (serviceKey === "other") return true;
  const category = CATEGORY_BY_ID.get(serviceKey);
  const aliases = SERVICE_ALIASES[serviceKey] || [];
  const terms = [serviceKey, category?.name, ...aliases].map(normalize).filter(Boolean);
  const haystack = normalize([
    row.business_type,
    row.map_icon_type,
    row.service_name,
    row.category,
    row.description,
    row.intro_text,
  ].join(" "));
  return terms.some((term) => haystack.includes(term));
}

function toRad(value) {
  return (Number(value || 0) * Math.PI) / 180;
}

export function calculateDistanceKm(...args) {
  const [aLat, aLng, bLat, bLng] =
    args.length === 2 && typeof args[0] === "object" && typeof args[1] === "object"
      ? [args[0].lat, args[0].lng, args[1].lat, args[1].lng]
      : args;
  const lat1 = Number(aLat);
  const lng1 = Number(aLng);
  const lat2 = Number(bLat);
  const lng2 = Number(bLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Number((2 * earthKm * Math.asin(Math.sqrt(h))).toFixed(1));
}

export function resolveServicePrice(row) {
  const pricingType = String(row.pricing_type || "fixed").toLowerCase();
  const fixed = Number(row.price_extra || row.price_from || 0);
  const min = Number(row.min_price || 0);
  const max = Number(row.max_price || 0);
  const starting = Number(row.starting_price || 0);
  if (pricingType === "range" && min > 0 && max >= min) return { min, max };
  if (pricingType === "starting_from" && starting > 0) return { min: starting, max: starting };
  if (fixed > 0) return { min: fixed, max: fixed };
  return { min: 0, max: 0 };
}

export function calculateAvailabilityScore(row, requestedDate, requestedTime) {
  if (!requestedDate && !requestedTime) return SMART_MATCH_WEIGHTS.availability;
  const isOpen = row.schedule_is_open === null || row.schedule_is_open === undefined ? 1 : Number(row.schedule_is_open);
  if (!isOpen) return 0;
  if (!requestedTime) return SMART_MATCH_WEIGHTS.availability;
  const start = String(row.schedule_start || row.availability_start || "08:00");
  const end = String(row.schedule_end || row.availability_end || "20:00");
  return requestedTime >= start && requestedTime <= end ? SMART_MATCH_WEIGHTS.availability : 4;
}

export function calculateRatingScore(row) {
  const rating = Number(row.rating || 0);
  if (rating >= 4.7) return SMART_MATCH_WEIGHTS.rating;
  if (rating >= 4.3) return 7;
  if (rating > 0) return 4;
  return 2;
}

export function calculatePaymentScore(row, preference = "best_match") {
  const options = paymentOptions(row);
  if (preference === "affordable" && options.includes("Cash")) return 5;
  if (options.includes("MTN") || options.includes("Wallet")) return 5;
  return 3;
}

function calculateReviewsScore(row) {
  const reviewCount = Number(row.total_reviews || row.reviewsCount || 0);
  if (reviewCount >= 50) return SMART_MATCH_WEIGHTS.reviewsConfidence;
  if (reviewCount >= 10) return 3;
  if (reviewCount > 0) return 1;
  return 0;
}

function calculateDistanceScore(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) return 8;
  const distance = Number(distanceKm);
  if (distance <= 2) return SMART_MATCH_WEIGHTS.distance;
  if (distance <= 5) return 18;
  if (distance <= 10) return 10;
  return 3;
}

function calculateTimingScore(row, when = "today") {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const start = String(row.schedule_start || row.availability_start || "08:00");
  const end = String(row.schedule_end || row.availability_end || "20:00");
  const isOpen = row.schedule_is_open === null || row.schedule_is_open === undefined ? 1 : Number(row.schedule_is_open);
  if (!isOpen) return 0;
  if (when === "now") return currentTime >= start && currentTime <= end ? SMART_MATCH_WEIGHTS.timingFit : 5;
  if (when === "today") return SMART_MATCH_WEIGHTS.timingFit;
  return 10;
}

export function paymentOptions(row) {
  const options = ["Cash"];
  if (Number(row.accepts_wallet || 0) === 1) options.push("Wallet");
  if (String(row.payment_provider || "").toLowerCase().includes("mtn")) options.push("MTN");
  return options;
}

function labelAvailability(row, when = "today") {
  if (when === "now") return calculateTimingScore(row, "now") >= SMART_MATCH_WEIGHTS.timingFit ? "Available now" : "Check current availability";
  if (when === "today") return "Available today";
  return "Available this week";
}

function buildBadges({ score, distanceKm, row, when }) {
  const badges = [];
  if (score >= 85) badges.push("Top Match");
  if (Number.isFinite(Number(distanceKm)) && Number(distanceKm) <= 2) badges.push("Closest");
  if (when === "now" && calculateTimingScore(row, "now") >= SMART_MATCH_WEIGHTS.timingFit) badges.push("Available now");
  if (when === "today") badges.push("Available today");
  if (Number(row.rating || 0) >= 4.7) badges.push("Highly rated");
  if (Number(row.total_reviews || 0) >= 10) badges.push("Fast response");
  return [...new Set(badges)].slice(0, 5);
}

function buildReasons({ row, serviceLabel, distanceKm, when }) {
  const reasons = [`Offers ${serviceLabel} services`];
  if (Number.isFinite(Number(distanceKm))) reasons.push(`${Number(distanceKm).toFixed(1)} km away`);
  if (Number(row.rating || 0) >= 4.7) reasons.push("Highly rated by customers");
  if (Number(row.total_reviews || 0) >= 50) reasons.push("Strong review history");
  if (when === "now") reasons.push("Likely to fit urgent timing");
  if (when === "today") reasons.push("Likely to fit same-day timing");
  if (when === "this_week") reasons.push("More availability this week");
  return reasons.slice(0, 5);
}

function hasRequestedCoordinates(criteria = {}) {
  const lat = Number(criteria.coordinates?.lat);
  const lng = Number(criteria.coordinates?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function isNearbyMatch(match) {
  if (!Number.isFinite(Number(match?.distanceKm))) return true;
  return Number(match.distanceKm) <= MAX_NEARBY_DISTANCE_KM;
}

function toNearestProvider(match) {
  if (!match) return null;
  return {
    providerId: match.providerId,
    businessId: match.businessId,
    businessName: match.businessName,
    location: match.provider?.location || "",
    distanceKm: match.distanceKm,
    serviceLabel: match.serviceLabel,
    provider: match.provider || null,
  };
}

function nearestByDistance(matches = []) {
  return [...matches].sort((a, b) => {
    const aDistance = Number.isFinite(Number(a.distanceKm)) ? Number(a.distanceKm) : Number.POSITIVE_INFINITY;
    const bDistance = Number.isFinite(Number(b.distanceKm)) ? Number(b.distanceKm) : Number.POSITIVE_INFINITY;
    return aDistance - bDistance || Number(b.score || 0) - Number(a.score || 0);
  })[0] || null;
}

function buildNoMatchDiagnostics({ criteria, serviceLabel, serviceRows, scored, nearbyMatches, timingMatches }) {
  const nearest = nearestByDistance(scored);
  const nearestProvider = toNearestProvider(nearest);
  if (!serviceRows.length) {
    return {
      reasonCode: SMART_MATCH_REASON_CODES.NO_SERVICE_PROVIDERS,
      nearestProvider: null,
      nearestLocation: "",
      nearestDistanceKm: null,
      suggestions: ["Try another service category", "Check again soon"],
      message: `No ${serviceLabel} providers are available yet.`,
    };
  }

  if (hasRequestedCoordinates(criteria) && !nearbyMatches.length) {
    return {
      reasonCode: SMART_MATCH_REASON_CODES.NO_NEARBY_PROVIDERS,
      nearestProvider,
      nearestLocation: nearestProvider?.location || "",
      nearestDistanceKm: nearestProvider?.distanceKm ?? null,
      suggestions: ["Change location", "View the nearest provider", "Continue with manual search"],
      message: `No ${serviceLabel} providers are near your selected location yet.`,
    };
  }

  if (nearbyMatches.length && !timingMatches.length) {
    return {
      reasonCode: SMART_MATCH_REASON_CODES.NO_TIME_MATCH,
      nearestProvider,
      nearestLocation: nearestProvider?.location || "",
      nearestDistanceKm: nearestProvider?.distanceKm ?? null,
      suggestions: ["Try another time", "Continue with manual search"],
      message: `${serviceLabel} providers are available, but none match your selected time.`,
    };
  }

  return {
    reasonCode: SMART_MATCH_REASON_CODES.NO_EXACT_MATCH,
    nearestProvider,
    nearestLocation: nearestProvider?.location || "",
    nearestDistanceKm: nearestProvider?.distanceKm ?? null,
    suggestions: ["Adjust timing", "Change location", "Try another service"],
    message: `No exact ${serviceLabel} match found for your filters.`,
  };
}

export function calculateSmartMatchScore({ row, price, distanceKm, budgetMin, budgetMax, date, time, preference, when = "" }) {
  const legacyBudgetBoost = price && (budgetMin || budgetMax) ? 4 : 0;
  const legacyPreferenceBoost = preference === "best_rated" ? calculateRatingScore(row) : calculatePaymentScore(row, preference);
  const timing = when ? calculateTimingScore(row, when) : calculateAvailabilityScore(row, date, time);
  return Math.round(Math.min(100,
    SMART_MATCH_WEIGHTS.serviceMatch +
    calculateDistanceScore(distanceKm) +
    timing +
    calculateRatingScore(row) +
    calculateReviewsScore(row) +
    legacyPreferenceBoost +
    legacyBudgetBoost
  ));
}

export function scoreProvider(row, criteria = {}) {
  const serviceKey = normalizeCategoryKey(criteria.serviceKey || criteria.category || "other");
  const serviceLabel = criteria.serviceLabel || serviceLabelForKey(serviceKey);
  if (!categoryMatches(row, serviceKey)) return null;
  const coordinates = criteria.coordinates || {};
  const distanceKm = calculateDistanceKm(coordinates.lat, coordinates.lng, row.latitude, row.longitude);
  const price = resolveServicePrice(row);
  const score = calculateSmartMatchScore({
    row,
    price,
    distanceKm,
    when: criteria.when || "today",
  });
  const timingExact =
    String(criteria.when || "").toLowerCase() === "now"
      ? calculateTimingScore(row, "now") >= SMART_MATCH_WEIGHTS.timingFit
      : true;
  return {
    providerId: String(row.id),
    businessId: row.id,
    businessName: row.business_name,
    serviceKey,
    serviceLabel,
    serviceId: row.service_id,
    serviceName: row.service_name,
    category: row.category || row.business_type || "Services",
    rating: Number(row.rating || 0),
    reviewsCount: Number(row.total_reviews || 0),
    reviews: Number(row.total_reviews || 0),
    distanceKm,
    availabilityLabel: labelAvailability(row, criteria.when),
    score,
    timingExact,
    badges: buildBadges({ score, distanceKm, row, when: criteria.when }),
    reasons: buildReasons({ row, serviceLabel, distanceKm, when: criteria.when }),
    imageUrl: row.image || "",
    priceMin: price.min,
    priceMax: price.max,
    paymentOptions: paymentOptions(row),
    provider: {
      id: row.id,
      business_name: row.business_name,
      business_type: row.business_type,
      category_name: row.business_type,
      map_icon_type: row.map_icon_type,
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      image: row.image,
      is_verified: Number(row.is_verified || 0) === 1,
      verified_status: row.verified_status || row.review_status || "",
      rating: Number(row.rating || 0),
      total_reviews: Number(row.total_reviews || 0),
    },
  };
}

function dateForWhen(when = "") {
  const date = new Date();
  if (when === "this_week") date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

export async function findSmartMatches(criteria = {}) {
  const { all } = await import("../db/query.js");
  const serviceKey = normalizeCategoryKey(criteria.serviceKey || criteria.category || "other");
  const when = String(criteria.when || criteria.dateMode || "today").toLowerCase();
  const requestedDate = criteria.date || dateForWhen(when);
  const dayOfWeek = requestedDate ? new Date(`${requestedDate}T00:00:00`).getDay() : null;
  const now = new Date();
  const rows = await all(
    `SELECT
       b.id,
       b.business_name,
       b.business_type,
       b.map_icon_type,
       b.location,
       b.latitude,
       b.longitude,
       b.is_verified,
       b.verified_status,
       b.review_status,
       b.price_from,
       b.image,
       b.intro_text,
       b.availability_start,
       b.availability_end,
       b.accepts_cash,
       b.accepts_wallet,
       s.id AS service_id,
       s.service_name,
       s.category,
       s.description,
       s.price_extra,
       s.pricing_type,
       s.min_price,
       s.max_price,
       s.starting_price,
       s.duration_minutes,
       s.location_type,
       sch.is_open AS schedule_is_open,
       sch.start_time AS schedule_start,
       sch.end_time AS schedule_end,
       (SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0) AS rating,
       (SELECT COUNT(*) FROM reviews r WHERE r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0) AS total_reviews,
       (SELECT provider FROM payment_transactions pt WHERE pt.barber_id = b.id AND pt.provider = 'mtn_mobile_money' AND pt.status = 'successful' LIMIT 1) AS payment_provider
     FROM barbers b
     JOIN barber_services s ON s.barber_id = b.id AND COALESCE(s.is_available, 1) = 1
     LEFT JOIN barber_schedule sch ON sch.barber_id = b.id AND sch.day_of_week = ?
     WHERE ${publicBusinessWhere("b")}
     ORDER BY b.id DESC, s.id ASC`,
    [dayOfWeek ?? -1, ...publicBusinessParams(now)]
  );

  const serviceRows = rows.filter((row) => categoryMatches(row, serviceKey));
  const scored = serviceRows
    .map((row) => scoreProvider(row, { ...criteria, serviceKey, when }))
    .filter(Boolean);
  const nearbyMatches = scored.filter(isNearbyMatch);
  const timingMatches = nearbyMatches.filter((item) => item.timingExact !== false);
  const budgetMax = Number(criteria.budgetMax || 0);
  const budgetMatches = budgetMax > 0
    ? timingMatches.filter((item) => {
        const min = Number(item.priceMin || 0);
        const max = Number(item.priceMax || 0);
        const comparable = min > 0 ? min : max;
        return comparable > 0 && comparable <= budgetMax;
      })
    : timingMatches;
  const eligibleMatches = criteria.verifiedOnly
    ? budgetMatches.filter((item) => item.provider?.is_verified || String(item.provider?.verified_status || "").toLowerCase() === "verified")
    : budgetMatches;

  const bestByProvider = new Map();
  eligibleMatches.forEach((item) => {
    const existing = bestByProvider.get(String(item.providerId));
    if (!existing || item.score > existing.score) bestByProvider.set(String(item.providerId), item);
  });

  const matches = [...bestByProvider.values()]
    .sort((a, b) => b.score - a.score)
      .slice(0, 12);

  if (!matches.length) {
    return {
      matches,
      ...buildNoMatchDiagnostics({
        criteria,
        serviceLabel: serviceLabelForKey(serviceKey),
        serviceRows,
        scored,
        nearbyMatches,
        timingMatches,
      }),
    };
  }

  return {
    matches,
    reasonCode: null,
    nearestProvider: null,
    nearestLocation: "",
    nearestDistanceKm: null,
    suggestions: [],
    message: "Ranked using your service, timing, and location choices.",
  };
}

const SERVICE_INTENT_ALIASES = [
  ["barber", /\b(barber|haircut|hair cut|shave)\b/i],
  ["salon", /\b(braid|braids|knotless|salon|hair styling|hair treatment)\b/i],
  ["beauty", /\b(makeup|make up|nails?|lashes?|beauty)\b/i],
  ["printing-stationery", /\b(print|printing|banner|banners|poster|flyer|photocopy)\b/i],
  ["design-branding", /\b(logo|brand|branding|graphic design)\b/i],
  ["cleaning-services", /\b(clean|cleaning|cleaner|fumigation|deep clean)\b/i],
  ["catering-food-services", /\b(cater|catering|food|cake|meal|chef)\b/i],
  ["repairs-maintenance", /\b(repair|fix|maintenance|mechanic)\b/i],
  ["plumbing-services", /\b(plumber|plumbing|pipe|leak)\b/i],
  ["electrical-services", /\b(electrician|electrical|wiring|solar)\b/i],
  ["education-tutoring", /\b(tutor|teacher|lesson|training|class)\b/i],
];

function extractBudget(text) {
  const match = String(text || "").match(/(?:ugx|below|under|less than|budget)?\s*([0-9][0-9,\s]{2,})(?:\s*(?:ugx|shs|shillings))?/i);
  if (!match) return null;
  const amount = Number(String(match[1]).replace(/[^\d]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function extractWhen(text) {
  const value = String(text || "").toLowerCase();
  if (/\b(now|open now|right now|urgent)\b/.test(value)) return "now";
  if (/\b(today|this afternoon|this evening|tonight)\b/.test(value)) return "today";
  if (/\b(tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|weekend|this week)\b/.test(value)) return "this_week";
  return "";
}

function extractServiceKey(text) {
  const value = String(text || "");
  const match = SERVICE_INTENT_ALIASES.find(([, pattern]) => pattern.test(value));
  if (match) return match[0];
  return normalizeCategoryKey(value);
}

function extractAddress(text) {
  const value = String(text || "");
  const nearMatch = value.match(/\b(?:near|around|in|at)\s+([A-Za-z][A-Za-z\s'-]{2,40})(?:\s+(?:today|tomorrow|saturday|sunday|below|under|at|around|near)|[.,]|$)/i);
  if (nearMatch) return nearMatch[1].trim();

  const standalonePlace = value
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^[A-Za-z][A-Za-z\s'-]{2,40}$/.test(standalonePlace) &&
    !extractWhen(standalonePlace) &&
    !extractBudget(standalonePlace) &&
    !extractVerifiedOnly(standalonePlace) &&
    extractServiceKey(standalonePlace) === "other" &&
    !/\b(which|what|who|show|compare|closest|cheapest|book|change|only|more)\b/i.test(standalonePlace)
  ) {
    return standalonePlace;
  }

  return "";
}

function extractVerifiedOnly(text) {
  return /\b(verified|only verified|verified providers?)\b/i.test(String(text || ""));
}

function extractRemoveVerified(text) {
  return /\b(show all|remove verified|not only verified|include unverified|any provider|all providers)\b/i.test(String(text || ""));
}

function extractSortIntent(text) {
  const value = String(text || "").toLowerCase();
  if (/\b(closest|nearest|nearby)\b/.test(value)) return "closest";
  if (/\b(cheapest|affordable|lowest price|least expensive)\b/.test(value)) return "cheapest";
  if (/\b(best rated|top rated|highest rated|rating)\b/.test(value)) return "rated";
  if (/\b(more options|show more|more providers)\b/.test(value)) return "more";
  return "";
}

export function buildSmartMatchAssistantCriteria({ message, conversation = {} } = {}) {
  const text = String(message || "").trim();
  const conversationItems = Array.isArray(conversation) ? conversation : [conversation];
  const previousCriteria = [...conversationItems]
    .reverse()
    .find((item) => item?.criteria && typeof item.criteria === "object")
    ?.criteria || {};
  const serviceKey = extractServiceKey(text);
  const extractedAddress = extractAddress(text);
  const extractedBudget = extractBudget(text);
  const extractedWhen = extractWhen(text);
  const requestedSortIntent = extractSortIntent(text);
  const removeVerified = extractRemoveVerified(text);
  const requestedVerifiedOnly = extractVerifiedOnly(text);
  const serviceChanged = serviceKey !== "other" && serviceKey !== previousCriteria.serviceKey;
  const criteriaChanged = Boolean(
    serviceChanged ||
    extractedAddress ||
    extractedBudget ||
    extractedWhen ||
    requestedVerifiedOnly ||
    removeVerified
  );
  const address = extractedAddress || previousCriteria.address || "";
  const budgetMax = extractedBudget || previousCriteria.budgetMax || null;
  const when = extractedWhen || previousCriteria.when || "today";
  const sortIntent = requestedSortIntent || (criteriaChanged ? "" : previousCriteria.sortIntent || "");
  const criteria = {
    ...previousCriteria,
    serviceKey: serviceKey === "other" ? previousCriteria.serviceKey || "" : serviceKey,
    when,
    locationType: address ? "enter_address" : previousCriteria.locationType || "enter_address",
    address,
    budgetMax,
    verifiedOnly: removeVerified ? false : (requestedVerifiedOnly || Boolean(previousCriteria.verifiedOnly)),
    sortIntent,
  };
  const missing = [];
  if (!criteria.serviceKey) missing.push("service");
  if (!criteria.address && !criteria.coordinates) missing.push("location");
  return { criteria, missing };
}

function buildAssistantPrompt({ criteria, missing }) {
  if (missing.length) {
    const question = missing.includes("service")
      ? "What service do you need?"
      : missing.includes("location")
      ? "Which area should I search around?"
      : "What time works best for you?";
    return {
      role: "assistant",
      kind: "clarification",
      message: question,
      missing,
      criteria,
      results: [],
    };
  }
  return null;
}

function explainMatch(match, criteria) {
  const reasons = Array.isArray(match?.reasons) ? match.reasons : [];
  const budget = Number(criteria.budgetMax || 0);
  const price = Number(match?.priceMin || match?.priceMax || 0);
  const budgetReason = budget && price && price <= budget ? "within your budget" : "";
  return [
    match?.availabilityLabel,
    budgetReason,
    Number.isFinite(Number(match?.distanceKm)) ? "near your selected area" : "",
    ...reasons,
  ].filter(Boolean).slice(0, 4);
}

function sortAssistantMatches(matches, criteria = {}) {
  const intent = String(criteria.sortIntent || "").toLowerCase();
  const list = [...matches];
  if (intent === "closest") {
    const hasDistances = list.some((match) => Number.isFinite(Number(match.distanceKm)));
    if (!hasDistances) return list;
    return list.sort((a, b) => {
      const ad = Number.isFinite(Number(a.distanceKm)) ? Number(a.distanceKm) : Number.POSITIVE_INFINITY;
      const bd = Number.isFinite(Number(b.distanceKm)) ? Number(b.distanceKm) : Number.POSITIVE_INFINITY;
      return ad - bd || Number(b.score || 0) - Number(a.score || 0);
    });
  }
  if (intent === "cheapest") {
    return list.sort((a, b) => {
      const ap = Number(a.priceMin || a.priceMax || Number.POSITIVE_INFINITY);
      const bp = Number(b.priceMin || b.priceMax || Number.POSITIVE_INFINITY);
      return ap - bp || Number(b.score || 0) - Number(a.score || 0);
    });
  }
  if (intent === "rated") {
    return list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.score || 0) - Number(a.score || 0));
  }
  return list;
}

function assistantMatchMessage({ matches, criteria, fallbackMessage }) {
  if (!matches.length) return fallbackMessage || "I could not find an exact match. Try another area, time, or service.";
  const intent = String(criteria.sortIntent || "").toLowerCase();
  if (intent === "closest") {
    const first = matches[0];
    return Number.isFinite(Number(first.distanceKm))
      ? `I found ${matches.length} real Queless match${matches.length === 1 ? "" : "es"} and placed the closest available option first.`
      : "I found real matches, but distance comparison is unavailable because coordinates are missing.";
  }
  if (intent === "cheapest") return `I found ${matches.length} real Queless match${matches.length === 1 ? "" : "es"} and placed the lowest listed price first.`;
  if (intent === "rated") return `I found ${matches.length} real Queless match${matches.length === 1 ? "" : "es"} and placed stronger real ratings first where ratings exist.`;
  return `I found ${matches.length} real Queless match${matches.length === 1 ? "" : "es"} based on your request.`;
}

export async function runSmartMatchAssistant({ message, conversation = {}, userId = null } = {}) {
  const text = String(message || "").trim();
  if (!text) {
    const error = new Error("Tell Smart Match what service you need.");
    error.statusCode = 400;
    throw error;
  }

  const { criteria, missing } = buildSmartMatchAssistantCriteria({ message: text, conversation });
  const clarification = buildAssistantPrompt({ criteria, missing });
  if (clarification) return clarification;

  const result = await findSmartMatches(criteria);
  const sortedMatches = sortAssistantMatches(result.matches || [], criteria);
  const matches = sortedMatches.map((match, index) => ({
    ...match,
    rank: index + 1,
    explanation: explainMatch(match, criteria),
    actions: ["view_profile", "view_location", "book", "compare"],
  }));
  const messagePrefix = assistantMatchMessage({ matches, criteria, fallbackMessage: result.message });

  return {
    role: "assistant",
    kind: "matches",
    message: messagePrefix,
    criteria,
    results: matches,
    comparison: matches.slice(0, 3).map((match) => ({
      rank: match.rank,
      providerId: match.providerId,
      stand: match.businessName,
      service: match.serviceName,
      priceMin: match.priceMin,
      priceMax: match.priceMax,
      distanceKm: match.distanceKm,
      availability: match.availabilityLabel,
      verified: Boolean(match.provider?.is_verified || match.provider?.verified_status === "verified"),
    })),
    dataGrounding: {
      source: "queless_discovery",
      inventedProviders: false,
      userId: userId ? Number(userId) : null,
    },
  };
}
