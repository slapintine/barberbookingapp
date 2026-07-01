function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value ?? null;
}

function equal(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  return value === true || value === 1;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function memberName(member) {
  return typeof member === "string" ? member.trim() : String(member?.name || "").trim();
}

function splitTeamMemberNames(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTeamMembersForPayload(value, existingValue) {
  if (Array.isArray(value)) return value;
  const existingMembers = arrayValue(existingValue);
  const existingByName = new Map(
    existingMembers
      .map((member) => [memberName(member).toLowerCase(), member])
      .filter(([name]) => Boolean(name))
  );

  if (typeof value !== "string") return [];
  return splitTeamMemberNames(value).map((name) => {
    const saved = existingByName.get(name.toLowerCase());
    if (saved && typeof saved === "object") return { ...saved, name };
    if (saved && typeof saved === "string") return name;
    return {
      name,
      title: "Barber",
      specialties: "",
      is_active: true,
    };
  });
}

function addChanged(payload, clearFields, {
  apiKey,
  value,
  existing,
  clearKey = apiKey,
  protectedEmpty = false,
}) {
  if (equal(value, existing)) return;
  payload[apiKey] = value;
  const isEmptyArray = Array.isArray(value) && value.length === 0;
  const isEmptyText = typeof value === "string" && value.trim() === "";
  if (protectedEmpty && (isEmptyArray || isEmptyText || value === null)) {
    clearFields.push(clearKey);
  }
}

export function buildStandDraftUpdatePayload(form = {}, existing = {}) {
  const payload = { submit_intent: "draft" };
  const clearFields = [];
  const dirtyFields = new Set(Array.isArray(form.dirtyFields) ? form.dirtyFields : []);
  const existingAvailability = existing.availability || {};
  const existingPortfolio = arrayValue(existing.portfolio ?? existing.portfolio_json ?? existing.gallery_images ?? existing.galleryImages);
  const existingTeamMembers = arrayValue(existing.team_members ?? existing.teamMembers);
  const nextTeamMembers = normalizeTeamMembersForPayload(form.teamMembers, existingTeamMembers);
  const hasFormField = (key) => Object.prototype.hasOwnProperty.call(form, key);

  addChanged(payload, clearFields, { apiKey: "business_name", value: form.businessName ?? "", existing: existing.business_name ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "phone", value: form.phone ?? "", existing: existing.phone ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "location", value: form.location ?? "", existing: existing.location ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "latitude", value: form.latitude === "" ? null : Number(form.latitude), existing: existing.latitude ?? null, protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "longitude", value: form.longitude === "" ? null : Number(form.longitude), existing: existing.longitude ?? null, protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "price_from", value: Number(form.pricing || 0), existing: Number(existing.price_from || 0) });
  addChanged(payload, clearFields, { apiKey: "image", value: form.image ?? "", existing: existing.image ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "services", value: Array.isArray(form.services) ? form.services : [], existing: Array.isArray(existing.services) ? existing.services : [], protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "stand_type", value: form.standType || "individual", existing: existing.stand_type || existing.standType || "individual" });
  if (hasFormField("marketplaceMode")) addChanged(payload, clearFields, { apiKey: "marketplace_mode", value: form.marketplaceMode || "service", existing: existing.marketplace_mode || existing.marketplaceMode || "service" });
  addChanged(payload, clearFields, { apiKey: "business_type", value: form.businessType ?? "", existing: existing.business_type || existing.businessType || "", protectedEmpty: true });
  if (hasFormField("coverImage")) addChanged(payload, clearFields, { apiKey: "cover_image_url", value: form.coverImage ?? "", existing: existing.cover_image_url || existing.coverImageUrl || "", protectedEmpty: true });
  if (hasFormField("businessHours")) addChanged(payload, clearFields, { apiKey: "business_hours", value: form.businessHours || {}, existing: existing.business_hours || existing.businessHours || {} });
  if (hasFormField("deliveryAvailable")) addChanged(payload, clearFields, { apiKey: "delivery_available", value: Boolean(form.deliveryAvailable), existing: booleanValue(existing.delivery_available ?? existing.deliveryAvailable) });
  if (hasFormField("pickupAvailable")) addChanged(payload, clearFields, { apiKey: "pickup_available", value: Boolean(form.pickupAvailable), existing: booleanValue(existing.pickup_available ?? existing.pickupAvailable, true) });
  if (hasFormField("deliveryAreas")) addChanged(payload, clearFields, { apiKey: "delivery_areas", value: Array.isArray(form.deliveryAreas) ? form.deliveryAreas : [], existing: arrayValue(existing.delivery_areas ?? existing.deliveryAreas ?? existing.delivery_areas_json), protectedEmpty: true });
  if (hasFormField("deliveryFee")) addChanged(payload, clearFields, { apiKey: "delivery_fee", value: form.deliveryFee === "" ? null : Number(form.deliveryFee), existing: existing.delivery_fee ?? existing.deliveryFee ?? null, protectedEmpty: true });
  if (hasFormField("deliveryNotes")) addChanged(payload, clearFields, { apiKey: "delivery_notes", value: form.deliveryNotes ?? "", existing: existing.delivery_notes || existing.deliveryNotes || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "map_icon_type", value: form.mapIconType ?? "", existing: existing.map_icon_type || existing.mapIconType || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "home_service_enabled", value: Boolean(form.homeServiceEnabled), existing: Boolean(Number(existing.home_service_enabled ?? existing.homeServiceEnabled ?? 0)) });
  addChanged(payload, clearFields, {
    apiKey: "selected_plan",
    value: String(form.selectedPlan || "FREE").toUpperCase(),
    existing: String(existing.selected_plan || existing.subscription?.tier || existing.subscription_tier || "FREE").toUpperCase(),
  });
  addChanged(payload, clearFields, { apiKey: "intro_text", value: form.introText ?? "", existing: existing.intro_text || existing.introText || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "verification_document_name", value: form.documentName ?? "", existing: existing.verification_document_name || existing.document_name || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "portfolio", value: Array.isArray(form.portfolio) ? form.portfolio : [], existing: existingPortfolio, protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "team_members", value: nextTeamMembers, existing: existingTeamMembers, protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "accepts_wallet", value: Boolean(form.acceptsWallet), existing: Boolean(Number(existing.accepts_wallet ?? existing.acceptsWallet ?? 0)) });
  addChanged(payload, clearFields, { apiKey: "accepts_cash", value: Boolean(form.acceptsCash), existing: Boolean(Number(existing.accepts_cash ?? existing.acceptsCash ?? 1)) });
  addChanged(payload, clearFields, { apiKey: "schedule_start", value: form.scheduleStart || "", existing: existingAvailability.start || existing.availability_start || "08:00" });
  addChanged(payload, clearFields, { apiKey: "schedule_end", value: form.scheduleEnd || "", existing: existingAvailability.end || existing.availability_end || "20:00" });
  if (dirtyFields.has("scheduleStart")) payload.schedule_start = form.scheduleStart || "";
  if (dirtyFields.has("scheduleEnd")) payload.schedule_end = form.scheduleEnd || "";

  if (clearFields.length) payload.clear_fields = [...new Set(clearFields)];
  return payload;
}
