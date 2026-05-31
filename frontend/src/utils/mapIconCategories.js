export const MULTI_SERVICE_MAP_ICON_TYPE = "multi";

export const MAP_ICON_OPTIONS = [
  {
    id: "beauty-grooming",
    label: "Beauty & Grooming",
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
  if (!key) return "beauty-grooming";
  if (MAP_ICON_BY_ID.has(key)) return key;
  if (CATEGORY_TO_ICON.has(key)) return CATEGORY_TO_ICON.get(key);
  if (key.includes("multi")) return MULTI_SERVICE_MAP_ICON_TYPE;
  if (key.includes("clean")) return "cleaning-services";
  if (key.includes("auto") || key.includes("car") || key.includes("mechanic")) return "auto-services";
  if (key.includes("photo") || key.includes("event")) return "events-photography";
  if (key.includes("education") || key.includes("tutor") || key.includes("lesson") || key.includes("academic") || key.includes("book")) return "education-tutoring";
  if (key.includes("health") || key.includes("fitness") || key.includes("wellness")) return "health-fitness";
  if (key.includes("repair") || key.includes("maintenance") || key.includes("wrench")) return "repairs-maintenance";
  if (key.includes("business") || key.includes("briefcase")) return "business-services";
  if (key.includes("delivery") || key.includes("errand")) return "delivery-errands";
  if (key.includes("home")) return "home-services";
  return "beauty-grooming";
}

export function normalizeMapIconType(value = "") {
  const key = normalizeCategoryKey(value);
  if (!key) return "";
  if (MAP_ICON_BY_ID.has(key)) return key;
  return getMapIconTypeForCategory(value);
}

export function getMapIconOption(type = "") {
  const normalized = normalizeMapIconType(type) || "beauty-grooming";
  return MAP_ICON_BY_ID.get(normalized) || MAP_ICON_BY_ID.get("beauty-grooming");
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
      .map((service) => normalizeCategoryKey(service?.category || service?.category_name || service?.type || ""))
      .filter(Boolean)
  );
  if (categories.size > 1) return MULTI_SERVICE_MAP_ICON_TYPE;
  if (savedType) return savedType;

  const markerCategory = marker?.category || marker?.service?.category || marker?.service?.category_name || "";
  if (markerCategory) return getMapIconTypeForCategory(markerCategory);
  if (categories.size === 1) return getMapIconTypeForCategory([...categories][0]);
  return getMapIconTypeForCategory(provider?.category_name || provider?.business_type || provider?.category || "");
}
