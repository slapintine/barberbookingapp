export const MARKETPLACE_MODES = Object.freeze({
  SERVICE: "service",
  PRODUCT: "product",
  HYBRID: "hybrid",
});

export function getMarketplaceMode(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const requested = String(
    typeof value === "string"
      ? value
      : source.marketplace_mode ?? source.marketplaceMode ?? MARKETPLACE_MODES.SERVICE
  ).trim().toLowerCase();
  return Object.values(MARKETPLACE_MODES).includes(requested)
    ? requested
    : MARKETPLACE_MODES.SERVICE;
}

export function supportsServices(value = {}) {
  return [MARKETPLACE_MODES.SERVICE, MARKETPLACE_MODES.HYBRID].includes(getMarketplaceMode(value));
}

export function supportsProducts(value = {}) {
  return [MARKETPLACE_MODES.PRODUCT, MARKETPLACE_MODES.HYBRID].includes(getMarketplaceMode(value));
}

export function getMarketplaceModeLabel(value = {}) {
  const mode = getMarketplaceMode(value);
  if (mode === MARKETPLACE_MODES.PRODUCT) return "Shop Stand";
  if (mode === MARKETPLACE_MODES.HYBRID) return "Services & Shop";
  return "Service Stand";
}

export function getMarketplacePlanContent(plan, value = {}) {
  if (!plan || typeof plan !== "object") return plan;

  const mode = getMarketplaceMode(value);
  if (mode === MARKETPLACE_MODES.SERVICE) return plan;

  if (mode === MARKETPLACE_MODES.PRODUCT) {
    const productFeatures = {
      FREE: [
        "Business profile & shop",
        "Up to 5 active products",
        "Customer order requests",
        "Customer messaging",
        "Map & location listing",
        "Pickup & delivery preferences",
      ],
      PREMIUM: [
        "Everything in Free",
        "No ads",
        "Premium badge",
        "Higher search & category ranking",
        "Up to 50 active products",
        "More product photos",
        "Custom logo & business hours",
        "Product order management",
        "Basic analytics (views, orders, profile clicks)",
        "Limited offers",
        "Can request verification",
      ],
      PLATINUM: [
        "Everything in Premium",
        "Open Coach (unlimited)",
        "Top priority ranking & placement",
        "Platinum badge",
        "Advanced analytics & conversion insights",
        "AI offer, reply & product description tools",
        "Weekly business report & health score",
        "Advanced delivery & pickup tools",
        "Largest photo allowance",
        "'Recommended by Queless' eligibility (after verification)",
        "VIP support",
      ],
    };
    const summary = plan.tier === "FREE"
      ? "Create your shop, list products, and receive order requests for free."
      : plan.summary;
    return {
      ...plan,
      summary,
      bestFor: plan.tier === "FREE" ? summary : plan.bestFor,
      features: productFeatures[plan.tier] || plan.features,
    };
  }

  const hybridFeatures = plan.tier === "FREE"
    ? [
        "Business profile & stand",
        "Service listings",
        "Product catalogue",
        "Bookings & order requests",
        "Customer messaging",
        "Map & location listing",
      ]
    : (plan.features || []).map((feature) => String(feature)
      .replace("More services & portfolio photos", "More services, products & photos")
      .replace("Booking management", "Booking & product order management")
      .replace("views, bookings, profile clicks", "views, bookings, orders & clicks")
      .replace("AI service description helper", "AI service & product description helper"));
  const summary = plan.tier === "FREE"
    ? "Offer services, list products, and manage bookings and order requests for free."
    : plan.summary;
  return {
    ...plan,
    summary,
    bestFor: plan.tier === "FREE" ? summary : plan.bestFor,
    features: hybridFeatures,
  };
}

export function isProductMarketplaceDisabledError(error) {
  return String(error?.code || error?.payload?.code || "").toUpperCase() === "PRODUCT_MARKETPLACE_DISABLED" ||
    (Number(error?.status || 0) === 404 && /product marketplace|shop stands/i.test(String(error?.message || "")));
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  return value === true || value === 1;
}

export function normalizeMarketplaceFields(value = {}) {
  const marketplaceMode = getMarketplaceMode(value);
  const arrayValue = (input) => {
    if (Array.isArray(input)) return input;
    if (typeof input !== "string") return [];
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const objectValue = (input) => {
    if (input && typeof input === "object" && !Array.isArray(input)) return input;
    if (typeof input !== "string") return {};
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const deliveryAreas = arrayValue(value.delivery_areas ?? value.deliveryAreas ?? value.delivery_areas_json);
  const businessHours = objectValue(value.business_hours ?? value.businessHours ?? value.business_hours_json);
  const productLimits = value.product_limits || value.productLimits || {};
  const deliveryAvailable = booleanValue(value.delivery_available ?? value.deliveryAvailable, false);
  const pickupAvailable = booleanValue(value.pickup_available ?? value.pickupAvailable, true);
  const deliveryFeeValue = value.delivery_fee ?? value.deliveryFee;
  return {
    marketplace_mode: marketplaceMode,
    marketplaceMode,
    supports_services: supportsServices(marketplaceMode),
    supportsServices: supportsServices(marketplaceMode),
    supports_products: supportsProducts(marketplaceMode),
    supportsProducts: supportsProducts(marketplaceMode),
    delivery_available: deliveryAvailable,
    deliveryAvailable,
    pickup_available: pickupAvailable,
    pickupAvailable,
    delivery_areas: deliveryAreas,
    deliveryAreas,
    delivery_fee: deliveryFeeValue === null || deliveryFeeValue === undefined
      ? null
      : Number(deliveryFeeValue),
    deliveryFee: deliveryFeeValue === null || deliveryFeeValue === undefined
      ? null
      : Number(deliveryFeeValue),
    delivery_notes: String(value.delivery_notes || value.deliveryNotes || ""),
    deliveryNotes: String(value.delivery_notes || value.deliveryNotes || ""),
    business_hours: businessHours,
    businessHours,
    product_limits: productLimits,
    productLimits,
  };
}
