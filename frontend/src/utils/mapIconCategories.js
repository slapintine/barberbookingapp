export const MULTI_SERVICE_MAP_ICON_TYPE = "multi";

export const MAP_ICON_OPTIONS = [
  {
    id: "default",
    label: "Services",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.15 6-10A6 6 0 0 0 6 11c0 4.85 6 10 6 10Z"/><circle cx="12" cy="11" r="2.4"/></svg>',
  },
  {
    id: "beauty",
    label: "Beauty",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l1.25 3.25L16.5 9l-3.25 1.25L12 13.5l-1.25-3.25L7.5 9l3.25-1.25L12 4.5Z"/><path d="M17.8 14.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/><path d="m6.2 14.9.55 1.35 1.35.55-1.35.55-.55 1.35-.55-1.35-1.35-.55 1.35-.55.55-1.35Z"/></svg>',
  },
  {
    id: "home-services",
    label: "Home Services",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11.2 12 5l7 6.2"/><path d="M7.2 10.6v8h9.6v-8"/><path d="M10.3 18.6v-4.1h3.4v4.1"/></svg>',
  },
  {
    id: "auto-services",
    label: "Auto Services",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 15.3h11.6"/><path d="m7.4 15.3 1.1-4a2 2 0 0 1 1.95-1.5h3.1a2 2 0 0 1 1.95 1.5l1.1 4"/><path d="M7.6 15.3v2.2"/><path d="M16.4 15.3v2.2"/><circle cx="9" cy="17.5" r=".45" fill="currentColor"/><circle cx="15" cy="17.5" r=".45" fill="currentColor"/></svg>',
  },
  {
    id: "events-photography",
    label: "Events & Photography",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8.5h3l1.25-1.8h4.5l1.25 1.8h3v9.2h-13V8.5Z"/><circle cx="12" cy="13.2" r="2.7"/><path d="M17 10.6h.01"/></svg>',
  },
  {
    id: "education-tutoring",
    label: "Tutor / Lessons",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 6.7c2.25-.85 4.2-.58 6.8.8 2.6-1.38 4.55-1.65 6.8-.8v10.6c-2.25-.85-4.2-.58-6.8.8-2.6-1.38-4.55-1.65-6.8-.8V6.7Z"/><path d="M12 7.5v10.6"/><path d="M8.2 4.9 12 3.4l3.8 1.5"/><path d="m15.8 4.9 1 .45v1.8"/></svg>',
  },
  {
    id: "health-fitness",
    label: "Health & Fitness",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 9.2c0 4.55-7.6 9-7.6 9s-7.6-4.45-7.6-9A3.8 3.8 0 0 1 11 6.8a3.8 3.8 0 0 1 8.6 2.4Z"/><path d="M7.2 12.2h2.25l.85-1.95 1.75 4.45 1.05-2.5h3.2"/></svg>',
  },
  {
    id: "repairs-maintenance",
    label: "Repairs & Maintenance",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.8 6.6 2.65-2.65a4.55 4.55 0 0 1 1.65 5.45l-8.65 8.65a2.65 2.65 0 0 1-3.75-3.75l8.65-8.65-.55.95Z"/><circle cx="8.5" cy="16.5" r=".45" fill="currentColor"/></svg>',
  },
  {
    id: "business-services",
    label: "Business Services",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 8V6.8c0-.9.7-1.6 1.6-1.6h4.4c.9 0 1.6.7 1.6 1.6V8"/><path d="M5.2 8.8h13.6v9.8H5.2V8.8Z"/><path d="M5.2 12.9h13.6"/><path d="M10.2 12.9v1h3.6v-1"/></svg>',
  },
  {
    id: "cleaning-services",
    label: "Cleaning Services",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.3 4.6s4.15 4.5 4.15 7.65a4.15 4.15 0 0 1-8.3 0c0-3.15 4.15-7.65 4.15-7.65Z"/><path d="m17.9 14.8.65 1.65 1.65.65-1.65.65-.65 1.65-.65-1.65-1.65-.65 1.65-.65.65-1.65Z"/></svg>',
  },
  {
    id: "delivery-errands",
    label: "Delivery & Errands",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.2 5.2 5 11.5l6 1.7 1.7 6 6.5-14Z"/><path d="m11.2 13 3.4-3.4"/></svg>',
  },
  { id: "barber", label: "Barber", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 5.4 18.5 16.7"/><path d="M18.5 5.4 7.2 16.7"/><circle cx="6" cy="4.6" r="1.7"/><circle cx="6" cy="17.4" r="1.7"/><path d="M12.6 11.2h4.7"/></svg>' },
  { id: "salon", label: "Salon", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18.5c4.4-1.1 7.2-4.6 7.2-9.3 0-2.5-1.45-4.2-3.45-4.2-2.7 0-4.35 2.3-3.35 5.1"/><path d="M14 7.7c2.8.4 4.2 2.3 4.2 5.2 0 2.5-1.2 4.5-3.4 5.8"/></svg>' },
  { id: "spa", label: "Spa", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.4c-4.2-1.7-6.7-4.55-6.7-8 3.05-.1 5.3 1.2 6.7 3.9 1.4-2.7 3.65-4 6.7-3.9 0 3.45-2.5 6.3-6.7 8Z"/><path d="M12 13.7V5.2"/></svg>' },
  { id: "plumbing", label: "Plumbing", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8.2h6.2a3.8 3.8 0 0 1 3.8 3.8v1.4"/><path d="M5.2 6.3h4v3.8h-4z"/><path d="M17.2 13.4s2 2.25 2 3.65a2 2 0 0 1-4 0c0-1.4 2-3.65 2-3.65Z"/></svg>' },
  { id: "electrical-services", label: "Electrical Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.2 3.8-6 8h4.4l-1.1 6.4 6.3-8h-4.5l.9-6.4Z"/></svg>' },
  { id: "carpentry", label: "Carpentry", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.6 18.4 8.2-8.2"/><path d="m12.4 6.3 1.8-1.8 5.3 5.3-1.8 1.8"/><path d="m13.1 5.6 6.3 6.3"/><path d="M5 15.8l2.2 2.2"/></svg>' },
  { id: "catering-food-services", label: "Catering & Food Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 4.7v7.2"/><path d="M9.2 4.7v7.2"/><path d="M7.9 11.9v7.4"/><path d="M15.7 4.7c1.9 1.8 2.1 5.3.2 7.5v7.1"/></svg>' },
  { id: "website-app-development", label: "Website & App Development", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 6.2h13.6v11.6H5.2z"/><path d="m9.8 10.1-2 2 2 2"/><path d="m14.2 10.1 2 2-2 2"/><path d="m12.8 9.4-1.6 5.2"/></svg>' },
  { id: "digital-marketing", label: "Digital Marketing", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 13.2h3.2l7.2 3.9V6.9l-7.2 3.9H5.4v2.4Z"/><path d="M8.6 13.2v4.3"/><path d="M18.2 10.1c.8.7.8 2.1 0 2.8"/></svg>' },
  { id: "consulting-services", label: "Consulting Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 17.4v-9h11.6v7.4H10l-3.8 2.6Z"/><path d="M9.2 11h7"/><path d="M9.2 13.5h4.6"/></svg>' },
  { id: "accounting-tax", label: "Accounting & Tax", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8h10v14.4H7z"/><path d="M9.2 8h5.6"/><path d="M9.2 11h.01M12 11h.01M14.8 11h.01M9.2 14h.01M12 14h.01M14.8 14h.01"/></svg>' },
  { id: "legal-services", label: "Legal Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.4v15.2"/><path d="M7 7h10"/><path d="m8 7-3 5h6l-3-5Z"/><path d="m16 7-3 5h6l-3-5Z"/><path d="M8 19.6h8"/></svg>' },
  { id: "design-branding", label: "Design & Branding", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 17.5 16.9 6.2l1.9 1.9L7.5 19.4H5.6v-1.9Z"/><path d="m14.8 8.3 1.9 1.9"/><path d="m6.6 5.4.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/></svg>' },
  { id: "writing-translation", label: "Writing & Translation", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 5.2h7.2l4.2 4.2v9.4H6.3z"/><path d="M13.5 5.2v4.2h4.2"/><path d="M8.8 13h6.4M8.8 15.8h4.5"/></svg>' },
  { id: "it-support", label: "IT Support", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 6.4h13v9h-13z"/><path d="M9 19h6"/><path d="M12 15.4V19"/><path d="M9 10.8h6"/></svg>' },
  { id: "printing-stationery", label: "Printing & Stationery", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.6 8V4.8h8.8V8"/><path d="M6.2 9h13v7.4h-3v2.8H7.8v-2.8h-3V9Z"/><path d="M8.8 15h6.4"/></svg>' },
  { id: "real-estate-services", label: "Real Estate Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 11.2 12 5l6.8 6.2"/><path d="M7.1 10.6v8.1h9.8v-8.1"/><path d="M10 18.7v-4h4v4"/><path d="M15.7 6.5V4.8h2.2v3.7"/></svg>' },
  { id: "construction-renovation", label: "Construction & Renovation", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18.8h12"/><path d="M7.8 18.8l1-7.2a4.2 4.2 0 0 1 8.4 0l1 7.2"/><path d="M9.5 9.2h7"/><path d="M12 5.2v4"/></svg>' },
  { id: "moving-transport", label: "Moving & Transport", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 8.2h9v8.2h-9z"/><path d="M13.8 11h3.8l1.6 2.3v3.1h-5.4"/><circle cx="8" cy="17.4" r="1.2"/><circle cx="16.8" cy="17.4" r="1.2"/></svg>' },
  { id: "laundry-services", label: "Laundry Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8h10v14.4H7z"/><path d="M9.2 7.2h.01M12 7.2h.01"/><circle cx="12" cy="13.3" r="3.2"/><path d="M9.8 13.2c1.1.9 2.8.9 4.4 0"/></svg>' },
  { id: "childcare-services", label: "Childcare Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6.8 19c.8-3.1 2.6-4.8 5.2-4.8s4.4 1.7 5.2 4.8"/><path d="M8.2 11.8 6 14M15.8 11.8 18 14"/></svg>' },
  { id: "pet-services", label: "Pet Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.2" cy="9" r="1.4"/><circle cx="10.2" cy="6.7" r="1.4"/><circle cx="13.8" cy="6.7" r="1.4"/><circle cx="16.8" cy="9" r="1.4"/><path d="M8.3 15.2c.5-2.2 2-3.4 3.7-3.4s3.2 1.2 3.7 3.4c.45 2-1.1 3.2-3.7 2.2-2.6 1-4.15-.2-3.7-2.2Z"/></svg>' },
  { id: "agriculture-services", label: "Agriculture Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V7"/><path d="M12 12.4c-3.5 0-5.6-1.8-6.4-5.3 3.5 0 5.6 1.8 6.4 5.3Z"/><path d="M12 14.2c3.5 0 5.6-1.8 6.4-5.3-3.5 0-5.6 1.8-6.4 5.3Z"/></svg>' },
  { id: "security-services", label: "Security Services", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.2 18 6.5v4.8c0 3.8-2.2 6.4-6 8.5-3.8-2.1-6-4.7-6-8.5V6.5l6-2.3Z"/><path d="m9.6 12.1 1.5 1.5 3.5-3.7"/></svg>' },
  {
    id: MULTI_SERVICE_MAP_ICON_TYPE,
    label: "Multi-service",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.4" y="5.4" width="5.1" height="5.1" rx="1.25" fill="currentColor"/><rect x="13.5" y="5.4" width="5.1" height="5.1" rx="1.25" fill="currentColor"/><rect x="5.4" y="13.5" width="5.1" height="5.1" rx="1.25" fill="currentColor"/><rect x="13.5" y="13.5" width="5.1" height="5.1" rx="1.25" fill="currentColor"/></svg>',
  },
];

const MAP_ICON_BY_ID = new Map(MAP_ICON_OPTIONS.map((option) => [option.id, option]));
const CATEGORY_TO_ICON = new Map(MAP_ICON_OPTIONS.map((option) => [normalizeCategoryKey(option.label), option.id]));

export function normalizeCategoryKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getMapIconTypeForCategory(category = "") {
  const key = normalizeCategoryKey(category);
  if (!key) return "default";
  if (MAP_ICON_BY_ID.has(key)) return key;
  if (CATEGORY_TO_ICON.has(key)) return CATEGORY_TO_ICON.get(key);
  if (key.includes("multi")) return MULTI_SERVICE_MAP_ICON_TYPE;
  if (key.includes("barber") || key.includes("haircut")) return "barber";
  if (key.includes("beauty") || key.includes("makeup") || key.includes("nail")) return "beauty";
  if (key.includes("salon")) return "salon";
  if (key.includes("spa")) return "spa";
  if (key.includes("plumb")) return "plumbing";
  if (key.includes("electric")) return "electrical-services";
  if (key.includes("carpentry") || key.includes("carpenter")) return "carpentry";
  if (key.includes("clean")) return "cleaning-services";
  if (key.includes("auto") || key.includes("car") || key.includes("mechanic")) return "auto-services";
  if (key.includes("cater") || key.includes("food")) return "catering-food-services";
  if (key.includes("photo") || key.includes("event")) return "events-photography";
  if (key.includes("education") || key.includes("tutor") || key.includes("lesson") || key.includes("academic") || key.includes("book")) return "education-tutoring";
  if (key.includes("health") || key.includes("fitness") || key.includes("wellness")) return "health-fitness";
  if (key.includes("construct") || key.includes("renovation")) return "construction-renovation";
  if (key.includes("repair") || key.includes("maintenance") || key.includes("wrench")) return "repairs-maintenance";
  if (key.includes("website") || key.includes("app-development")) return "website-app-development";
  if (key.includes("marketing")) return "digital-marketing";
  if (key.includes("consult")) return "consulting-services";
  if (key.includes("accounting") || key.includes("tax")) return "accounting-tax";
  if (key.includes("legal")) return "legal-services";
  if (key.includes("design") || key.includes("branding")) return "design-branding";
  if (key.includes("writing") || key.includes("translation")) return "writing-translation";
  if (key.includes("it-support")) return "it-support";
  if (key.includes("printing") || key.includes("stationery")) return "printing-stationery";
  if (key.includes("real-estate")) return "real-estate-services";
  if (key.includes("moving") || key.includes("transport")) return "moving-transport";
  if (key.includes("laundry")) return "laundry-services";
  if (key.includes("childcare")) return "childcare-services";
  if (key.includes("pet")) return "pet-services";
  if (key.includes("agriculture")) return "agriculture-services";
  if (key.includes("security")) return "security-services";
  if (key.includes("business") || key.includes("briefcase")) return "business-services";
  if (key.includes("delivery") || key.includes("errand")) return "delivery-errands";
  if (key.includes("home")) return "home-services";
  return "default";
}

export function normalizeMapIconType(value = "") {
  const key = normalizeCategoryKey(value);
  if (!key) return "";
  if (MAP_ICON_BY_ID.has(key)) return key;
  return getMapIconTypeForCategory(value);
}

export function getMapIconOption(type = "") {
  const normalized = normalizeMapIconType(type) || "default";
  return MAP_ICON_BY_ID.get(normalized) || MAP_ICON_BY_ID.get("default");
}

export function getMapIconSvg(type = "") {
  return getMapIconOption(type).svg;
}

export function getMapIconTypeForSelectedCategories(categories = []) {
  const selected = Array.isArray(categories) ? categories.filter(Boolean) : [];
  if (!selected.length) return "";
  if (selected.length > 1) return MULTI_SERVICE_MAP_ICON_TYPE;
  return getMapIconTypeForCategory(selected[0]);
}

export function resolveProviderMapIconType(provider = {}, marker = {}) {
  const savedType = normalizeMapIconType(
    provider?.map_icon_type ||
      provider?.mapIconType ||
      provider?.iconCategory ||
      provider?.icon_category ||
      provider?.business_icon_category ||
      ""
  );
  if (savedType === MULTI_SERVICE_MAP_ICON_TYPE) return savedType;

  const services = Array.isArray(provider?.services) ? provider.services : [];
  const categories = new Set(
    services
      .flatMap((service) => {
        const category = normalizeCategoryKey(service?.category || service?.category_name || service?.type || "");
        return category ? [category] : [];
      })
  );
  if (categories.size > 1) return MULTI_SERVICE_MAP_ICON_TYPE;
  if (savedType) return savedType;

  const markerCategory = marker?.category || marker?.service?.category || marker?.service?.category_name || "";
  if (markerCategory) return getMapIconTypeForCategory(markerCategory);
  if (categories.size === 1) return getMapIconTypeForCategory([...categories][0]);
  return getMapIconTypeForCategory(provider?.category_name || provider?.business_type || provider?.category || "");
}
