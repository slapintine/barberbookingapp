export const MARKETPLACE_CATEGORIES = [
  {
    id: "beauty-grooming",
    icon: "sparkles",
    name: "Beauty & Grooming",
    description: "Hair, nails, makeup, wellness, barbering, and personal care services.",
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "home-services",
    icon: "home",
    name: "Home Services",
    description: "Plumbing, electrical, gardening, moving, installation, and home help.",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "auto-services",
    icon: "truck",
    name: "Auto Services",
    description: "Mechanics, car wash, detailing, diagnostics, towing, and mobile repairs.",
    image: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "events-photography",
    icon: "camera",
    name: "Events & Photography",
    description: "Photography, videography, decoration, catering, MCs, DJs, and event crews.",
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "education-tutoring",
    icon: "book",
    name: "Education & Tutoring",
    description: "Private tutors, coaching, language lessons, music lessons, and exam prep.",
    image: "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "health-fitness",
    icon: "activity",
    name: "Health & Fitness",
    description: "Trainers, gyms, wellness coaches, physiotherapy, massage, and nutrition.",
    image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "repairs-maintenance",
    icon: "tool",
    name: "Repairs & Maintenance",
    description: "Appliance repair, electronics, phones, computers, furniture, and upkeep.",
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "business-services",
    icon: "briefcase",
    name: "Business Services",
    description: "Accounting, design, legal support, marketing, IT, printing, and consulting.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "cleaning-services",
    icon: "droplet",
    name: "Cleaning Services",
    description: "Residential, office, deep cleaning, laundry, fumigation, and sanitation.",
    image: "https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
  {
    id: "delivery-errands",
    icon: "navigation",
    name: "Delivery & Errands",
    description: "Courier runs, shopping help, errands, pickup, delivery, and personal tasks.",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=900&q=80",
    active: true,
  },
];

export const SERVICE_CATEGORIES = MARKETPLACE_CATEGORIES.map((category) => category.name);

export const DEFAULT_SERVICE_TYPES = [
  {
    id: "general-service",
    name: "General service",
    service_name: "General service",
    category: "Home Services",
    price_extra: 0,
    extra: 0,
    pricing_type: "fixed",
    location_type: "customer_location",
    duration_minutes: 60,
    description: "A bookable service offered by this provider.",
    is_available: true,
  },
  {
    id: "consultation",
    name: "Consultation",
    service_name: "Consultation",
    category: "Business Services",
    price_extra: 0,
    extra: 0,
    pricing_type: "quote",
    location_type: "online",
    duration_minutes: 30,
    description: "Discuss the job, scope, budget, and ideal next steps.",
    is_available: true,
  },
  {
    id: "premium-service",
    name: "Premium service",
    service_name: "Premium service",
    category: "Beauty & Grooming",
    price_extra: 10000,
    extra: 10000,
    pricing_type: "fixed",
    location_type: "provider_location",
    duration_minutes: 45,
    description: "A higher-touch service with a confirmed booking slot.",
    is_available: true,
  },
];

export const CATEGORY_ALIASES = {
  "beauty-grooming": ["beauty", "grooming", "haircut", "hair", "barber", "salon", "spa", "makeup", "nails", "massage"],
  "home-services": ["home", "plumbing", "electrician", "gardening", "moving", "installation", "repair at home"],
  "auto-services": ["auto", "car", "mechanic", "garage", "car wash", "detailing", "towing", "vehicle"],
  "events-photography": ["events", "event", "photography", "photo", "video", "decor", "catering", "dj", "mc"],
  "education-tutoring": ["education", "tutor", "teacher", "lesson", "training", "coaching", "exam", "school"],
  "health-fitness": ["health", "fitness", "gym", "trainer", "physio", "wellness", "nutrition", "massage"],
  "repairs-maintenance": ["repair", "maintenance", "appliance", "electronics", "phone repair", "computer", "furniture"],
  "business-services": ["business", "accounting", "legal", "design", "marketing", "it", "printing", "consulting"],
  "cleaning-services": ["cleaning", "cleaner", "laundry", "fumigation", "sanitation", "deep clean"],
  "delivery-errands": ["delivery", "errand", "courier", "pickup", "shopping", "runner"],
};

export function normalizeCategoryKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getCategoryByName(value) {
  const key = normalizeCategoryKey(value);
  return MARKETPLACE_CATEGORIES.find((category) => category.id === key || normalizeCategoryKey(category.name) === key);
}

export function inferCategoryNameFromText(value, fallback = "Services") {
  const haystack = String(value || "").toLowerCase().replace(/&/g, "and");
  const directCategory = getCategoryByName(value);
  if (directCategory) return directCategory.name;

  const matchingAlias = Object.entries(CATEGORY_ALIASES).find(([, aliases]) =>
    aliases.some((term) => haystack.includes(String(term).toLowerCase()))
  );
  if (matchingAlias) {
    return MARKETPLACE_CATEGORIES.find((category) => category.id === matchingAlias[0])?.name || fallback;
  }

  return fallback;
}

export function serviceMatchesCategory(service, category) {
  if (!category || category === "All") return true;
  const key = normalizeCategoryKey(category);
  const categoryRow = getCategoryByName(category);
  const haystack = [
    service?.service_name,
    service?.name,
    service?.title,
    service?.category,
    service?.description,
    service,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/&/g, "and");
  const terms = [
    String(category).toLowerCase(),
    categoryRow?.name?.toLowerCase(),
    ...(CATEGORY_ALIASES[key] || []),
  ].filter(Boolean);
  return terms.some((term) => haystack.includes(String(term).toLowerCase()));
}

export function normalizeServiceForBooking(item, idx = 0) {
  const fallback = DEFAULT_SERVICE_TYPES[idx % DEFAULT_SERVICE_TYPES.length] || DEFAULT_SERVICE_TYPES[0];
  if (typeof item === "string") {
    const inferredCategory = inferCategoryNameFromText(item, fallback.category || "Services");
    return {
      id: `fallback-${idx}`,
      service_name: item,
      title: item,
      category: inferredCategory,
      price_extra: 0,
      pricing_type: "fixed",
      location_type: inferredCategory === "Home Services" || inferredCategory === "Cleaning Services"
        ? "customer_location"
        : "provider_location",
      duration_minutes: 30,
      description: "",
      is_available: true,
      image: "",
      images: [],
    };
  }

  const category = item?.category || item?.service_category || item?.category_name || fallback.category;
  const pricingType = String(item?.pricing_type || item?.pricingType || fallback.pricing_type || "fixed").toLowerCase();
  const locationType = String(item?.location_type || item?.locationType || fallback.location_type || "provider_location").toLowerCase();
  const normalizedPricingType = ["fixed", "range", "starting_from", "quote"].includes(pricingType) ? pricingType : "fixed";
  const legacyPrice = Number(item?.price_extra ?? item?.extra ?? item?.price ?? 0);

  return {
    id: item?.id ?? fallback.id ?? `fallback-${idx}`,
    service_name: item?.service_name || item?.name || item?.title || fallback.name || "Service",
    title: item?.title || item?.service_name || item?.name || fallback.name || "Service",
    category: getCategoryByName(category)?.name || category || "Beauty & Grooming",
    price_extra: normalizedPricingType === "fixed" ? legacyPrice : 0,
    price: normalizedPricingType === "fixed" ? Number(item?.price ?? item?.price_extra ?? item?.extra ?? 0) : 0,
    min_price: item?.min_price ?? item?.minPrice ?? "",
    max_price: item?.max_price ?? item?.maxPrice ?? "",
    starting_price: item?.starting_price ?? item?.startingPrice ?? "",
    pricing_type: normalizedPricingType,
    location_type: ["provider_location", "customer_location", "online"].includes(locationType)
      ? locationType
      : "provider_location",
    duration_minutes: Number(item?.duration_minutes ?? item?.durationMinutes ?? fallback.duration_minutes ?? 30),
    description: item?.description || "",
    is_available: item?.is_available ?? item?.isAvailable ?? item?.is_active ?? true,
    is_featured: Boolean(item?.is_featured || item?.isFeatured),
    image: item?.image || item?.service_image || "",
    images: Array.isArray(item?.images) ? item.images : [item?.image || item?.service_image].filter(Boolean),
  };
}

export function formatServicePrice(service = {}) {
  const pricingType = String(service.pricing_type || service.pricingType || "fixed").toLowerCase();
  const money = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? `UGX ${amount.toLocaleString("en-UG")}` : "";
  };
  if (pricingType === "quote") return "Price on consultation";
  if (pricingType === "range") {
    const min = money(service.min_price ?? service.minPrice);
    const max = money(service.max_price ?? service.maxPrice);
    return min && max ? `${min} - ${max}` : "Price unavailable";
  }
  if (pricingType === "starting_from") {
    const starting = money(service.starting_price ?? service.startingPrice);
    return starting ? `From ${starting}` : "Price unavailable";
  }
  return money(service.price_extra ?? service.price ?? service.extra) || "Price unavailable";
}

export function getServiceBookingAmount(service = {}) {
  const pricingType = String(service.pricing_type || "fixed").toLowerCase();
  if (pricingType === "range") return Number(service.min_price || service.price_extra || 0);
  if (pricingType === "starting_from") return Number(service.starting_price || service.price_extra || 0);
  if (pricingType === "quote") return 0;
  return Number(service.price_extra || service.price || 0);
}

export function getAvailableServices(services = []) {
  return (services || [])
    .map(normalizeServiceForBooking)
    .filter((service) => service.is_available !== false && Number(service.is_available) !== 0);
}
