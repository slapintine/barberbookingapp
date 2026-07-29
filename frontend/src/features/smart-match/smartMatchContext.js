export function getSmartMatchCriteriaKey(state = {}) {
  return JSON.stringify({
    serviceKey: state.selectedService?.key || "",
    when: state.selectedWhen || "",
    date: state.preferredDate || "",
    time: state.preferredTime || "",
    budgetMax: String(state.budgetMax || ""),
    minimumRating: String(state.minimumRating || ""),
    locationType: state.selectedLocationType || "",
    address: String(state.selectedAddress || "").trim().toLowerCase(),
    lat: state.userCoordinates?.lat || "",
    lng: state.userCoordinates?.lng || "",
  });
}

export function buildSmartMatchBookingContext(match = {}, provider = {}, state = {}) {
  return {
    providerId: String(match.providerId || match.businessId || provider.id || ""),
    serviceId: match.serviceId ?? "",
    serviceName: match.serviceName || match.serviceLabel || state.selectedService?.label || "",
    priceMin: match.priceMin ?? null,
    priceMax: match.priceMax ?? null,
    priceLabel: match.priceLabel || "",
    pricingType: match.pricingType || "",
    durationMinutes: match.durationMinutes ?? null,
    requestedDate: match.requestedDate || state.preferredDate || "",
    requestedTime: match.requestedTime || state.preferredTime || "",
    bookingLocationType: state.selectedLocationType === "enter_address" ? "customer_location" : "",
    bookingAddress: state.selectedLocationType === "enter_address" ? String(state.selectedAddress || "").trim() : "",
    notes: String(state.notes || "").trim(),
    preferences: {
      serviceKey: state.selectedService?.key || match.serviceKey || "",
      when: state.selectedWhen || "",
      budgetMax: state.budgetMax || "",
      minimumRating: state.minimumRating || "",
      locationType: state.selectedLocationType || "",
    },
  };
}

export function buildSmartMatchProvider(match = {}, provider = {}) {
  const providerId = String(match.providerId || match.businessId || provider.id || "");
  const matchedService = {
    id: match.serviceId ?? "",
    service_name: match.serviceName || match.serviceLabel || "",
    name: match.serviceName || match.serviceLabel || "",
    category: match.serviceKey || match.category || provider.business_type || "",
    price_extra: Number(match.priceMin || match.priceMax || 0),
    pricing_type: match.pricingType || (Number(match.priceMin || 0) > 0 ? "fixed" : "quote"),
    min_price: match.priceMin ?? null,
    max_price: match.priceMax ?? null,
    starting_price: match.pricingType === "starting_from" ? match.priceMin ?? null : null,
    duration_minutes: match.durationMinutes ?? null,
    location_type: match.locationType || "",
    is_available: 1,
  };
  const existingServices = Array.isArray(provider.services) ? provider.services : [];
  const hasMatchedService = existingServices.some((service) =>
    String(service.id || "") === String(matchedService.id || "") ||
    String(service.service_name || service.name || "").toLowerCase() === String(matchedService.service_name || "").toLowerCase()
  );

  return {
    ...provider,
    id: providerId,
    business_name: provider.business_name || match.businessName || "Queless provider",
    business_type: provider.business_type || match.category || match.serviceLabel || "Services",
    category_name: provider.category_name || match.category || match.serviceLabel || "Services",
    map_icon_type: provider.map_icon_type || match.provider?.map_icon_type || "",
    location: provider.location || match.provider?.location || "",
    latitude: provider.latitude ?? match.provider?.latitude ?? null,
    longitude: provider.longitude ?? match.provider?.longitude ?? null,
    image: provider.image || match.imageUrl || match.provider?.image || "",
    rating: provider.rating ?? match.rating ?? 0,
    total_reviews: provider.total_reviews ?? match.reviewsCount ?? match.reviews ?? 0,
    price_from: provider.price_from ?? match.priceMin ?? match.priceMax ?? 0,
    business_status: provider.business_status || provider.status || "active",
    status: provider.status || provider.business_status || "active",
    is_published: provider.is_published ?? 1,
    is_demo: provider.is_demo ?? 0,
    is_banned: provider.is_banned ?? 0,
    is_suspended: provider.is_suspended ?? 0,
    subscription_tier: provider.subscription_tier || "FREE",
    subscription_status: provider.subscription_status || "active",
    services: hasMatchedService ? existingServices : [matchedService, ...existingServices],
  };
}
