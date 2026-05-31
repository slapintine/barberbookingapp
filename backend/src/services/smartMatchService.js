import { publicBusinessParams, publicBusinessWhere } from "./businessVisibility.js";

const CATEGORY_ALIASES = {
  "beauty-grooming": ["beauty", "grooming", "barber", "salon", "spa", "hair", "makeup", "nails"],
  "home-services": ["home", "plumbing", "plumber", "electrical", "electrician", "gardening", "moving"],
  "cleaning-services": ["cleaning", "cleaner", "laundry", "deep clean", "fumigation"],
  "repairs-maintenance": ["repair", "repairs", "maintenance", "carpentry", "carpenter", "appliance", "phone repair"],
  "education-tutoring": ["education", "tutor", "tutoring", "private tutor", "lesson", "lessons", "academic", "math", "mathematics", "english", "science", "homework", "exam", "music", "art"],
  "auto-services": ["auto", "car", "mechanic", "car wash", "vehicle"],
  "business-services": ["business", "accounting", "legal", "design", "marketing", "it"],
};

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCategoryKey(value = "") {
  const clean = normalize(value).replace(/\s+/g, "-");
  if (clean.includes("tutor") || clean.includes("lesson") || clean.includes("academic") || clean.includes("education")) return "education-tutoring";
  if (clean.includes("clean")) return "cleaning-services";
  if (clean.includes("repair") || clean.includes("maintenance") || clean.includes("carpentry")) return "repairs-maintenance";
  if (clean.includes("plumb") || clean.includes("home") || clean.includes("electric")) return "home-services";
  if (clean.includes("barber") || clean.includes("salon") || clean.includes("spa") || clean.includes("beauty")) return "beauty-grooming";
  return clean;
}

export function categoryMatches(row, requestedCategory) {
  if (!requestedCategory || normalize(requestedCategory) === "all" || normalize(requestedCategory).includes("other")) return true;
  const key = normalizeCategoryKey(requestedCategory);
  const aliases = CATEGORY_ALIASES[key] || [];
  const terms = [normalize(requestedCategory), key.replace(/-/g, " "), ...aliases].filter(Boolean);
  const haystack = normalize([
    row.business_type,
    row.map_icon_type,
    row.service_name,
    row.category,
    row.description,
    row.intro_text,
  ].join(" "));
  return terms.some((term) => haystack.includes(normalize(term)));
}

function toRad(value) {
  return (Number(value || 0) * Math.PI) / 180;
}

export function calculateDistanceKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat);
  const lng1 = Number(aLng);
  const lat2 = Number(bLat);
  const lng2 = Number(bLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Number((earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))).toFixed(1));
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
  if (!requestedDate && !requestedTime) return 18;
  const isOpen = row.schedule_is_open === null || row.schedule_is_open === undefined ? 1 : Number(row.schedule_is_open);
  if (!isOpen) return 0;
  if (!requestedTime) return 22;
  const start = String(row.schedule_start || row.availability_start || "08:00");
  const end = String(row.schedule_end || row.availability_end || "20:00");
  return requestedTime >= start && requestedTime <= end ? 30 : 10;
}

export function calculateRatingScore(row) {
  const rating = Number(row.rating || 0);
  const reviewCount = Number(row.total_reviews || 0);
  return rating ? Math.min(20, (rating / 5) * 16 + Math.min(reviewCount, 20) * 0.2) : 8;
}

export function calculatePriceScore(price, budgetMin, budgetMax, preference) {
  if (!price.min && !price.max) return preference === "best_rated" ? 8 : 5;
  if (!budgetMin && !budgetMax) return preference === "affordable" ? Math.max(6, 15 - price.min / 10000) : 12;
  const min = Number(budgetMin || 0);
  const max = Number(budgetMax || budgetMin || 0);
  if (max && price.min <= max && (!min || price.max >= min)) return 15;
  if (max && price.min <= max * 1.25) return 8;
  return 2;
}

export function calculateProfileCompletenessScore(row) {
  const checks = [
    row.image,
    row.intro_text && String(row.intro_text).length > 30,
    row.location,
    row.latitude && row.longitude,
    row.service_name,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 5);
}

export function paymentOptions(row) {
  const options = ["Cash"];
  if (Number(row.accepts_wallet || 0) === 1) options.push("Wallet");
  if (String(row.payment_provider || "").toLowerCase().includes("mtn")) options.push("MTN");
  return options;
}

export function calculatePaymentScore(row, preference = "best_match") {
  const options = paymentOptions(row);
  if (preference === "affordable" && options.includes("Cash")) return 5;
  if (options.includes("MTN") || options.includes("Wallet")) return 5;
  return 3;
}

export function calculateSmartMatchScore({ row, price, distanceKm, budgetMin, budgetMax, date, time, preference }) {
  const distanceScore = distanceKm === null ? 12 : Math.max(0, 25 - Math.min(distanceKm, 25));
  return Math.round(Math.min(100,
    calculateAvailabilityScore(row, date, time) +
    distanceScore +
    calculateRatingScore(row) +
    calculatePriceScore(price, budgetMin, budgetMax, preference) +
    calculateProfileCompletenessScore(row) +
    calculatePaymentScore(row, preference)
  ));
}

function labelNextAvailable(date, time) {
  if (time) return date ? `${date} ${time}` : time;
  if (date) return `${date} during business hours`;
  return "Check availability";
}

export async function findSmartMatches({ category, location = {}, budgetMin = 0, budgetMax = 0, date = "", time = "", preference = "best_match" }) {
  const { all } = await import("../db/query.js");
  const dayOfWeek = date ? new Date(`${date}T00:00:00`).getDay() : null;
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

  const scored = rows.map((row) => {
    const exactCategoryMatch = categoryMatches(row, category);
    const distance = calculateDistanceKm(location.lat, location.lng, row.latitude, row.longitude);
    const price = resolveServicePrice(row);
    const score = calculateSmartMatchScore({ row, price, distanceKm: distance, budgetMin, budgetMax, date, time, preference });
    const rating = Number(row.rating || 0);
    const reviewCount = Number(row.total_reviews || 0);
    return {
      businessId: row.id,
      businessName: row.business_name,
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
        rating,
        total_reviews: reviewCount,
      },
      serviceId: row.service_id,
      serviceName: row.service_name,
      category: row.category || row.business_type || "Services",
      rating,
      reviews: reviewCount,
      distanceKm: distance,
      priceMin: price.min,
      priceMax: price.max,
      nextAvailableTime: labelNextAvailable(date, time),
      paymentOptions: paymentOptions(row),
      score,
      exactCategoryMatch,
    };
  });

  const bestByProvider = new Map();
  scored.forEach((item) => {
    const existing = bestByProvider.get(String(item.businessId));
    if (!existing || item.score > existing.score) bestByProvider.set(String(item.businessId), item);
  });

  const values = [...bestByProvider.values()];
  const exactMatches = values.filter((item) => item.exactCategoryMatch);
  const matches = (exactMatches.length ? exactMatches : values)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return {
    exactMatch: exactMatches.length > 0,
    message: exactMatches.length
      ? "Best matches based on your preferences."
      : "We could not find an exact match, but here are the closest available options.",
    matches,
  };
}
