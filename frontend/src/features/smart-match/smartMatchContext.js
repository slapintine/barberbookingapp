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
