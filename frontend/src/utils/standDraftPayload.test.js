import test from "node:test";
import assert from "node:assert/strict";
import { buildStandDraftUpdatePayload } from "./standDraftPayload.js";

const existing = {
  business_name: "Kampala Cuts",
  phone: "+256700000000",
  location: "Nakasero",
  latitude: 0.31,
  longitude: 32.58,
  price_from: 15000,
  image: "/uploads/logo.webp",
  services: [{ id: 1, service_name: "Haircut", price_extra: 15000 }],
  stand_type: "individual",
  business_type: "Barber",
  map_icon_type: "barber",
  home_service_enabled: 0,
  intro_text: "Trusted local cuts",
  verification_document_name: "license.pdf",
  portfolio: [{ id: "photo-1", afterImage: "/uploads/work.webp" }],
  team_members: [],
  accepts_wallet: 0,
  accepts_cash: 1,
  availability: { start: "08:00", end: "18:00" },
};

function editableForm(overrides = {}) {
  return {
    businessName: existing.business_name,
    phone: existing.phone,
    location: existing.location,
    latitude: String(existing.latitude),
    longitude: String(existing.longitude),
    pricing: String(existing.price_from),
    image: existing.image,
    services: existing.services,
    standType: existing.stand_type,
    businessType: existing.business_type,
    mapIconType: existing.map_icon_type,
    homeServiceEnabled: false,
    introText: existing.intro_text,
    documentName: existing.verification_document_name,
    portfolio: existing.portfolio,
    teamMembers: existing.team_members,
    acceptsWallet: false,
    acceptsCash: true,
    scheduleStart: "08:00",
    scheduleEnd: "18:00",
    ...overrides,
  };
}

test("saving an unchanged stand sends no destructive fields", () => {
  assert.deepEqual(buildStandDraftUpdatePayload(editableForm(), existing), { submit_intent: "draft" });
});

test("editing only description leaves services, images, phone, location, and hours out of payload", () => {
  assert.deepEqual(
    buildStandDraftUpdatePayload(editableForm({ introText: "Updated description" }), existing),
    { submit_intent: "draft", intro_text: "Updated description" }
  );
});

test("an explicit image removal is represented by clear_fields", () => {
  assert.deepEqual(
    buildStandDraftUpdatePayload(editableForm({ image: "" }), existing),
    { submit_intent: "draft", image: "", clear_fields: ["image"] }
  );
});

test("an explicit service removal does not affect other saved collections", () => {
  assert.deepEqual(
    buildStandDraftUpdatePayload(editableForm({ services: [] }), existing),
    { submit_intent: "draft", services: [], clear_fields: ["services"] }
  );
});
