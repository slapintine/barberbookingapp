import { publicBusinessParams, publicBusinessWhere } from "./businessVisibility.js";
import { SERVICE_DISCOVERY_CATEGORIES } from "../data/serviceCategories.js";

export const SMART_MATCH_WEIGHTS = {
  serviceMatch: 35,
  distance: 25,
  timingFit: 15,
  rating: 10,
  reviewsConfidence: 5,
  availability: 10,
  favourite: 3,
  previousBooking: 4,
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
  "website-app-development": ["website", "web development", "app development", "mobile app", "ecommerce", "automation", "technical build"],
  "digital-marketing": ["digital marketing", "social media", "ads", "seo", "content strategy", "campaign"],
  "consulting-services": ["consulting", "consultant", "business strategy", "operations", "career advisory", "specialist advisory"],
  "accounting-tax": ["accounting", "tax", "bookkeeping", "payroll", "audit", "financial records"],
  "legal-services": ["legal", "lawyer", "contract", "company registration", "compliance", "legal consultation"],
  "design-branding": ["design", "branding", "logo", "brand identity", "graphics", "visual design"],
  "writing-translation": ["writing", "translation", "copywriting", "editing", "transcription", "documents"],
  "printing-stationery": ["printing", "stationery", "photocopying", "business documents"],
  "it-support": ["it support", "computer setup", "troubleshooting", "networking", "cybersecurity", "computer repair"],
  "security-services": ["security", "guard", "cctv", "access control", "alarm", "property security"],
  "business-services": ["business", "professional service", "office service"],
  "laundry-services": ["laundry", "dry cleaning", "ironing", "wash and fold", "fabric care"],
  "cleaning-services": ["cleaning", "cleaner", "deep clean", "fumigation", "sanitation"],
  "catering-food-services": ["catering", "food", "meal prep", "cake", "private chef", "food vendor"],
  "errands-local-help": ["errand", "courier", "pickup help", "personal assistant", "runner"],
};

const CATEGORY_BY_ID = new Map(SERVICE_DISCOVERY_CATEGORIES.map((category) => [category.id, category]));

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
  return SERVICE_DISCOVERY_CATEGORIES.find((category) =>
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
  const fixed = Number(row.price_extra || 0);
  const min = Number(row.min_price || 0);
  const max = Number(row.max_price || 0);
  const starting = Number(row.starting_price || 0);
  if (pricingType === "range" && min > 0 && max >= min) return { min, max };
  if (pricingType === "starting_from" && starting > 0) return { min: starting, max: starting };
  if (fixed > 0) return { min: fixed, max: fixed };
  return { min: 0, max: 0 };
}

function hasKnownPrice(price) {
  return Number(price?.min || 0) > 0 || Number(price?.max || 0) > 0;
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

function priceFitsBudget(price, budgetMax) {
  const budget = Number(budgetMax);
  if (!Number.isFinite(budget) || budget <= 0) return true;
  const min = Number(price?.min || 0);
  if (min <= 0) return true;
  return min <= budget;
}

function calculateBudgetScore(price, budgetMax) {
  const budget = Number(budgetMax);
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  if (!hasKnownPrice(price)) return 0;
  if (!priceFitsBudget(price, budget)) return -12;
  const max = Number(price?.max || price?.min || 0);
  if (max > 0 && max <= budget) return 8;
  return 4;
}

function requestedTimeFits(row, requestedTime) {
  if (!requestedTime) return true;
  const isOpen = row.schedule_is_open === null || row.schedule_is_open === undefined ? 1 : Number(row.schedule_is_open);
  if (!isOpen) return false;
  const start = String(row.schedule_start || row.availability_start || "08:00").slice(0, 5);
  const end = String(row.schedule_end || row.availability_end || "20:00").slice(0, 5);
  return requestedTime >= start && requestedTime <= end;
}

function formatPriceRange(price) {
  const min = Number(price?.min || 0);
  const max = Number(price?.max || 0);
  if (min <= 0 && max <= 0) return "Quote required";
  const format = (value) => `UGX ${Number(value).toLocaleString("en-UG")}`;
  if (max > min) return `${format(min)}-${format(max)}`;
  return format(min || max);
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
  if (score >= 85) badges.push("Strong fit");
  if (Number.isFinite(Number(distanceKm)) && Number(distanceKm) <= 2) badges.push("Closest");
  if (when === "now" && calculateTimingScore(row, "now") >= SMART_MATCH_WEIGHTS.timingFit) badges.push("Available now");
  if (when === "today") badges.push("Available today");
  if (Number(row.rating || 0) >= 4.7) badges.push("Highly rated");
  if (Number(row.total_reviews || 0) >= 10) badges.push("Review support");
  return [...new Set(badges)].slice(0, 5);
}

function reason(code, text, evidence = {}) {
  return { code, text, evidence };
}

function buildExplanations({ row, serviceLabel, distanceKm, when, requestedTime, price, budgetMax, minimumRating }) {
  const explanations = [reason("service.offered", `Offers ${serviceLabel} services`, { serviceName: row.service_name || "" })];
  if (Number.isFinite(Number(distanceKm))) {
    explanations.push(reason("location.distance", `${Number(distanceKm).toFixed(1)} km away`, { distanceKm: Number(distanceKm) }));
  }
  if (requestedTime && requestedTimeFits(row, requestedTime)) {
    explanations.push(reason("availability.near_time", "Available near your preferred time", { requestedTime }));
  }
  if (hasKnownPrice(price) && priceFitsBudget(price, budgetMax) && Number(budgetMax) > 0) {
    explanations.push(reason("price.within_budget", "Within your selected price range", { budgetMax: Number(budgetMax), price }));
  }
  if (row.is_favourite) explanations.push(reason("customer.favourite", "Saved by you", { favourite: true }));
  if (row.previously_booked) explanations.push(reason("customer.previous_booking", "You've booked this provider before", { previousBooking: true }));
  if (Number(row.rating || 0) >= 4.7) {
    explanations.push(reason("rating.high", "Highly rated by customers", { rating: Number(row.rating || 0) }));
  }
  if (Number(minimumRating) > 0 && Number(row.rating || 0) >= Number(minimumRating)) {
    explanations.push(reason("rating.preference_met", "Meets your rating preference", { minimumRating: Number(minimumRating), rating: Number(row.rating || 0) }));
  }
  if (Number(row.total_reviews || 0) >= 50) explanations.push(reason("reviews.strong", "Strong review support", { reviews: Number(row.total_reviews || 0) }));
  if (when === "now") explanations.push(reason("timing.urgent", "Likely to fit urgent timing", { when }));
  if (when === "today") explanations.push(reason("timing.same_day", "Likely to fit same-day timing", { when }));
  if (when === "this_week") explanations.push(reason("timing.week", "More availability this week", { when }));
  return explanations.slice(0, 6);
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
    legacyBudgetBoost +
    calculateBudgetScore(price, budgetMax)
  ));
}

export function scoreProvider(row, criteria = {}) {
  const serviceKey = normalizeCategoryKey(criteria.serviceKey || criteria.category || "other");
  const serviceLabel = criteria.serviceLabel || serviceLabelForKey(serviceKey);
  if (!categoryMatches(row, serviceKey)) return null;
  const coordinates = criteria.coordinates || {};
  const distanceKm = calculateDistanceKm(coordinates.lat, coordinates.lng, row.latitude, row.longitude);
  const price = resolveServicePrice(row);
  const requestedTime = String(criteria.time || criteria.preferredTime || "").slice(0, 5);
  const requestedDate = criteria.date || criteria.preferredDate || "";
  const score = calculateSmartMatchScore({
    row,
    price,
    distanceKm,
    when: criteria.when || "today",
    time: requestedTime,
    date: requestedDate,
    budgetMax: criteria.budgetMax,
  }) + (row.is_favourite ? SMART_MATCH_WEIGHTS.favourite : 0) + (row.previously_booked ? SMART_MATCH_WEIGHTS.previousBooking : 0);
  const timingExact =
    requestedTime
      ? requestedTimeFits(row, requestedTime)
      : String(criteria.when || "").toLowerCase() === "now"
      ? calculateTimingScore(row, "now") >= SMART_MATCH_WEIGHTS.timingFit
      : true;
  const rating = Number(row.rating || 0);
  const meetsRatingPreference = !Number(criteria.minimumRating) || rating === 0 || rating >= Number(criteria.minimumRating);
  const explanations = buildExplanations({ row, serviceLabel, distanceKm, when: criteria.when, requestedTime, price, budgetMax: criteria.budgetMax, minimumRating: criteria.minimumRating });
  return {
    providerId: String(row.id),
    businessId: row.id,
    businessName: row.business_name,
    serviceKey,
    serviceLabel,
    serviceId: row.service_id,
    serviceName: row.service_name,
    category: row.category || row.business_type || "Services",
    rating,
    reviewsCount: Number(row.total_reviews || 0),
    reviews: Number(row.total_reviews || 0),
    distanceKm,
    availabilityLabel: labelAvailability(row, criteria.when),
    requestedDate,
    requestedTime,
    score: Math.min(100, score),
    timingExact,
    budgetCompatible: hasKnownPrice(price) ? priceFitsBudget(price, criteria.budgetMax) : true,
    meetsRatingPreference,
    badges: buildBadges({ score, distanceKm, row, when: criteria.when }),
    explanations,
    reasons: explanations.map((item) => item.text),
    isFavourite: Boolean(row.is_favourite),
    previouslyBooked: Boolean(row.previously_booked),
    imageUrl: row.image || "",
    priceMin: price.min,
    priceMax: price.max,
    priceLabel: formatPriceRange(price),
    pricingType: row.pricing_type || "fixed",
    durationMinutes: Number(row.duration_minutes || 0),
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

  const customerUserId = Number(criteria.customerUserId || 0);
  let favouriteProviderIds = new Set();
  let previousProviderIds = new Set();
  if (Number.isInteger(customerUserId) && customerUserId > 0) {
    const [favourites, previous] = await Promise.all([
      all(`SELECT barber_id FROM favorites WHERE user_id = ?`, [customerUserId]),
      all(`SELECT DISTINCT barber_id FROM bookings WHERE customer_user_id = ? AND LOWER(status) = 'completed'`, [customerUserId]),
    ]);
    favouriteProviderIds = new Set(favourites.map((item) => String(item.barber_id)));
    previousProviderIds = new Set(previous.map((item) => String(item.barber_id)));
  }
  const annotatedRows = rows.map((row) => ({
    ...row,
    is_favourite: favouriteProviderIds.has(String(row.id)),
    previously_booked: previousProviderIds.has(String(row.id)),
  }));

  const serviceRows = annotatedRows.filter((row) => categoryMatches(row, serviceKey));
  const scored = serviceRows
    .map((row) => scoreProvider(row, { ...criteria, serviceKey, when }))
    .filter(Boolean);
  const nearbyMatches = scored.filter(isNearbyMatch);
  const timingMatches = nearbyMatches.filter((item) => item.timingExact !== false);

  const bestByProvider = new Map();
  timingMatches.forEach((item) => {
    const existing = bestByProvider.get(String(item.providerId));
    if (!existing || item.score > existing.score) bestByProvider.set(String(item.providerId), item);
  });

  const matches = [...bestByProvider.values()]
    .sort((a, b) =>
      Number(b.budgetCompatible) - Number(a.budgetCompatible) ||
      Number(b.meetsRatingPreference) - Number(a.meetsRatingPreference) ||
      b.score - a.score
    )
    .slice(0, 3);

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

export async function compareSmartMatchProviders(criteria = {}, providerIds = []) {
  const allowedIds = [...new Set((providerIds || []).map((id) => String(id)).filter(Boolean))].slice(0, 3);
  if (!allowedIds.length) return { comparisons: [], message: "Choose providers to compare." };
  const result = await findSmartMatches(criteria);
  const byProvider = new Map((result.matches || []).map((match) => [String(match.providerId), match]));
  return {
    comparisons: allowedIds.map((id) => byProvider.get(id)).filter(Boolean),
    message: "Comparison uses the matched service, current price, duration, rating, location, and customer relationship signals.",
  };
}
