export const PROVIDER_CAPABILITIES = Object.freeze({
  canCreateServices: true,
  canPublishProfile: true,
  canAcceptBookings: true,
  canManageSchedules: true,
  canManageTeamMembers: true,
  canUploadImages: true,
  canReceiveReviews: true,
});

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hasValidUgandaPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("256")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^(?:7\d|20|31|39)\d{7}$/.test(digits);
}

function serviceMissingDetails(services = [], schedule = []) {
  const missing = [];
  if (!Array.isArray(services) || !services.length) {
    missing.push("at least one service");
  } else if (services.some((service) => {
    if (!String(service?.service_name || service?.serviceName || service?.name || "").trim()) return true;
    const pricingType = String(service?.pricing_type || service?.pricingType || "fixed").toLowerCase();
    if (pricingType === "fixed" && Number(service?.price_extra ?? service?.price ?? 0) <= 0) return true;
    if (pricingType === "range" && (
      Number(service?.min_price ?? service?.minPrice ?? 0) <= 0 ||
      Number(service?.max_price ?? service?.maxPrice ?? 0) <= Number(service?.min_price ?? service?.minPrice ?? 0)
    )) return true;
    if (pricingType === "starting_from" && Number(service?.starting_price ?? service?.startingPrice ?? 0) <= 0) return true;
    const duration = Number(service?.duration_minutes ?? service?.durationMinutes ?? 0);
    return duration < 5 || duration > 43200;
  })) {
    missing.push("complete service details");
  }

  const openDays = Array.isArray(schedule)
    ? schedule.filter((day) => Number(day?.is_open ?? day?.isOpen ?? 0) === 1)
    : [];
  const invalidSchedule = !openDays.length || openDays.some((day) => {
    const start = String(day?.start_time || day?.startTime || "");
    const end = String(day?.end_time || day?.endTime || "");
    return !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
      start >= end;
  });
  if (invalidSchedule) missing.push("opening hours");
  return missing;
}

export function supportsServiceBookings() {
  return true;
}

export function getPublishRequirements({ stand = {}, services = [], schedule = [] } = {}) {
  const missing = [];
  const businessName = String(stand.business_name || stand.businessName || "").trim();
  const category = String(stand.business_type || stand.businessType || stand.category || "").trim();
  const phone = String(stand.phone || stand.business_phone || "").trim();
  const location = String(stand.location || "").trim();
  const mapIcon = String(stand.map_icon_type || stand.mapIconType || "").trim();

  if (!businessName || /^Business stand draft \d+$/i.test(businessName)) missing.push("business name");
  if (!category || category.toLowerCase() === "services") missing.push("business category");
  if (!hasValidUgandaPhone(phone)) missing.push("valid Uganda business phone");
  const serviceNeedsFixedLocation = !Array.isArray(services) || !services.length || services.some((service) =>
    ["provider_location", "pickup_delivery"].includes(
      String(service?.location_type || service?.locationType || "provider_location").toLowerCase()
    )
  );
  if (serviceNeedsFixedLocation && (!location || location === "Location not set")) {
    missing.push("business or service-area location");
  }
  if (!mapIcon) missing.push("map icon");
  missing.push(...serviceMissingDetails(services, schedule));

  return {
    mode: "service",
    ready: missing.length === 0,
    missing: [...new Set(missing)],
    serviceReady: missing.length === 0,
  };
}

export function normalizeProviderForClient(stand = {}) {
  const {
    marketplace_mode: _legacyMarketplaceMode,
    marketplaceMode: _legacyMarketplaceModeCamel,
    ...publicStand
  } = stand;
  const businessHours = parseJson(stand.business_hours_json ?? stand.business_hours ?? stand.businessHours, {});
  return {
    ...publicStand,
    supports_services: true,
    supportsServices: true,
    stand_type: "individual",
    standType: "individual",
    cover_image_url: String(stand.cover_image_url || stand.coverImageUrl || "").trim(),
    coverImageUrl: String(stand.cover_image_url || stand.coverImageUrl || "").trim(),
    business_hours: businessHours,
    businessHours,
  };
}
