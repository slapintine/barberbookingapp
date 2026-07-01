import { getSubscriptionTierConfig, normalizeProviderPlan } from "./paymentService.js";

export const MARKETPLACE_MODES = Object.freeze(["service", "product", "hybrid"]);

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function truthy(value) {
  return [true, 1, "1", "true", "yes"].includes(value);
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

function activeProducts(products = []) {
  return (Array.isArray(products) ? products : []).filter((product) =>
    !truthy(product?.is_deleted ?? product?.isDeleted) &&
    Number(product?.is_active ?? product?.isActive ?? 1) === 1 &&
    String(product?.stock_status || product?.stockStatus || "in_stock").toLowerCase() !== "hidden"
  );
}

function productMissingDetails(stand = {}, products = []) {
  const missing = [];
  if (!activeProducts(products).length) missing.push("at least one active product");
  const deliveryAvailable = truthy(stand.delivery_available ?? stand.deliveryAvailable);
  const pickupAvailable = truthy(stand.pickup_available ?? stand.pickupAvailable);
  if (!deliveryAvailable && !pickupAvailable) missing.push("pickup or delivery preference");
  const deliveryAreas = parseJson(stand.delivery_areas_json ?? stand.delivery_areas ?? stand.deliveryAreas, []);
  const deliveryNotes = String(stand.delivery_notes ?? stand.deliveryNotes ?? "").trim();
  if (deliveryAvailable && !deliveryNotes && (!Array.isArray(deliveryAreas) || !deliveryAreas.length)) {
    missing.push("delivery area or delivery notes");
  }
  return missing;
}

export function getMarketplaceMode(stand = {}) {
  const requested = String(
    typeof stand === "string"
      ? stand
      : stand.marketplace_mode ?? stand.marketplaceMode ?? "service"
  ).trim().toLowerCase();
  return MARKETPLACE_MODES.includes(requested) ? requested : "service";
}

export function supportsServices(stand = {}) {
  return ["service", "hybrid"].includes(getMarketplaceMode(stand));
}

export function supportsProducts(stand = {}) {
  return ["product", "hybrid"].includes(getMarketplaceMode(stand));
}

export function getPlanProductLimits(stand = {}) {
  const requestedTier = normalizeProviderPlan(
    stand.subscription?.tier ||
    stand.subscription_tier ||
    stand.selected_plan ||
    stand.plan ||
    "FREE"
  ) || "FREE";
  const status = String(stand.subscription?.status || stand.subscription_status || "").trim().toLowerCase();
  const tier = requestedTier === "FREE" ||
    !status ||
    ["active", "trialing", "trial", "paid"].includes(status)
    ? requestedTier
    : "FREE";
  const plan = getSubscriptionTierConfig(tier);
  return {
    tier,
    productLimit: Number(plan.productLimit ?? 0),
    productImageLimit: Number(plan.productImageLimit ?? 0),
  };
}

export function getPublishRequirements({ stand = {}, services = [], products = [], schedule = [] } = {}) {
  const mode = getMarketplaceMode(stand);
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
  if (
    (supportsProducts(mode) || serviceNeedsFixedLocation) &&
    (!location || location === "Location not set")
  ) {
    missing.push(supportsProducts(mode) ? "business location" : "business or service-area location");
  }
  if (!mapIcon) missing.push("map icon");

  const serviceMissing = supportsServices(mode) ? serviceMissingDetails(services, schedule) : [];
  const productMissing = supportsProducts(mode) ? productMissingDetails(stand, products) : [];
  missing.push(...serviceMissing, ...productMissing);

  return {
    mode,
    ready: missing.length === 0,
    missing: [...new Set(missing)],
    serviceReady: !supportsServices(mode) || serviceMissing.length === 0,
    productReady: !supportsProducts(mode) || productMissing.length === 0,
  };
}

export function normalizeStandForClient(stand = {}) {
  const marketplaceMode = getMarketplaceMode(stand);
  const businessHours = parseJson(stand.business_hours_json ?? stand.business_hours ?? stand.businessHours, {});
  const deliveryAreas = parseJson(stand.delivery_areas_json ?? stand.delivery_areas ?? stand.deliveryAreas, []);
  const productLimits = getPlanProductLimits(stand);
  return {
    ...stand,
    marketplace_mode: marketplaceMode,
    marketplaceMode,
    supports_services: supportsServices(marketplaceMode),
    supportsServices: supportsServices(marketplaceMode),
    supports_products: supportsProducts(marketplaceMode),
    supportsProducts: supportsProducts(marketplaceMode),
    cover_image_url: String(stand.cover_image_url || stand.coverImageUrl || "").trim(),
    coverImageUrl: String(stand.cover_image_url || stand.coverImageUrl || "").trim(),
    business_hours: businessHours,
    businessHours,
    delivery_available: truthy(stand.delivery_available ?? stand.deliveryAvailable),
    deliveryAvailable: truthy(stand.delivery_available ?? stand.deliveryAvailable),
    pickup_available: truthy(stand.pickup_available ?? stand.pickupAvailable ?? true),
    pickupAvailable: truthy(stand.pickup_available ?? stand.pickupAvailable ?? true),
    delivery_areas: Array.isArray(deliveryAreas) ? deliveryAreas : [],
    deliveryAreas: Array.isArray(deliveryAreas) ? deliveryAreas : [],
    delivery_fee: stand.delivery_fee === null || stand.delivery_fee === undefined ? null : Number(stand.delivery_fee),
    deliveryFee: stand.delivery_fee === null || stand.delivery_fee === undefined ? null : Number(stand.delivery_fee),
    delivery_notes: String(stand.delivery_notes || stand.deliveryNotes || ""),
    deliveryNotes: String(stand.delivery_notes || stand.deliveryNotes || ""),
    product_limits: productLimits,
    productLimits,
  };
}
