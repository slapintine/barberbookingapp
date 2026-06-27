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
  const existingAvailability = existing.availability || {};

  addChanged(payload, clearFields, { apiKey: "business_name", value: form.businessName ?? "", existing: existing.business_name ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "phone", value: form.phone ?? "", existing: existing.phone ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "location", value: form.location ?? "", existing: existing.location ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "latitude", value: form.latitude === "" ? null : Number(form.latitude), existing: existing.latitude ?? null, protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "longitude", value: form.longitude === "" ? null : Number(form.longitude), existing: existing.longitude ?? null, protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "price_from", value: Number(form.pricing || 0), existing: Number(existing.price_from || 0) });
  addChanged(payload, clearFields, { apiKey: "image", value: form.image ?? "", existing: existing.image ?? "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "services", value: Array.isArray(form.services) ? form.services : [], existing: Array.isArray(existing.services) ? existing.services : [], protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "stand_type", value: form.standType || "individual", existing: existing.stand_type || existing.standType || "individual" });
  addChanged(payload, clearFields, { apiKey: "business_type", value: form.businessType ?? "", existing: existing.business_type || existing.businessType || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "map_icon_type", value: form.mapIconType ?? "", existing: existing.map_icon_type || existing.mapIconType || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "home_service_enabled", value: Boolean(form.homeServiceEnabled), existing: Boolean(Number(existing.home_service_enabled ?? existing.homeServiceEnabled ?? 0)) });
  addChanged(payload, clearFields, { apiKey: "intro_text", value: form.introText ?? "", existing: existing.intro_text || existing.introText || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "verification_document_name", value: form.documentName ?? "", existing: existing.verification_document_name || existing.document_name || "", protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "portfolio", value: Array.isArray(form.portfolio) ? form.portfolio : [], existing: Array.isArray(existing.portfolio) ? existing.portfolio : [], protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "team_members", value: Array.isArray(form.teamMembers) ? form.teamMembers : [], existing: Array.isArray(existing.team_members || existing.teamMembers) ? existing.team_members || existing.teamMembers : [], protectedEmpty: true });
  addChanged(payload, clearFields, { apiKey: "accepts_wallet", value: Boolean(form.acceptsWallet), existing: Boolean(Number(existing.accepts_wallet ?? existing.acceptsWallet ?? 0)) });
  addChanged(payload, clearFields, { apiKey: "accepts_cash", value: Boolean(form.acceptsCash), existing: Boolean(Number(existing.accepts_cash ?? existing.acceptsCash ?? 1)) });
  addChanged(payload, clearFields, { apiKey: "schedule_start", value: form.scheduleStart || "", existing: existingAvailability.start || existing.availability_start || "08:00" });
  addChanged(payload, clearFields, { apiKey: "schedule_end", value: form.scheduleEnd || "", existing: existingAvailability.end || existing.availability_end || "20:00" });

  if (clearFields.length) payload.clear_fields = [...new Set(clearFields)];
  return payload;
}
