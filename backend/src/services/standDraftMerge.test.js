import test from "node:test";
import assert from "node:assert/strict";
import {
  getClearFields,
  getStandPublishMissingDetails,
  hasMeaningfulDraftChanges,
  mergeDraftArray,
  mergeDraftBoolean,
  mergeDraftNumber,
  mergeDraftText,
  normalizeUgandaStandPhone,
} from "./standDraftMerge.js";

test("draft merge preserves stored values when fields are omitted or blank by accident", () => {
  const body = {
    business_name: "",
    services: [],
    portfolio: [],
    latitude: "",
  };
  const clearFields = getClearFields(body);

  assert.equal(mergeDraftText({ body, keys: ["business_name"], existing: "Saved salon", clearFields }), "Saved salon");
  assert.equal(mergeDraftNumber({ body, keys: ["latitude"], existing: 0.31, clearFields }), 0.31);
  assert.deepEqual(mergeDraftArray({ body, keys: ["services"], existing: [{ id: 1 }], clearFields }), [{ id: 1 }]);
  assert.deepEqual(mergeDraftArray({ body, keys: ["portfolio"], existing: [{ id: "photo-1" }], clearFields }), [{ id: "photo-1" }]);
});

test("draft merge only clears protected values through an explicit clear_fields action", () => {
  const body = {
    image: "",
    services: [],
    portfolio: [],
    clear_fields: ["image", "services", "portfolio"],
  };
  const clearFields = getClearFields(body);

  assert.equal(mergeDraftText({ body, keys: ["image"], existing: "/uploads/logo.webp", clearFields }), "");
  assert.deepEqual(mergeDraftArray({ body, keys: ["services"], existing: [{ id: 1 }], clearFields }), []);
  assert.deepEqual(mergeDraftArray({ body, keys: ["portfolio"], existing: [{ id: "photo-1" }], clearFields }), []);
});

test("draft merge accepts deliberate false and zero updates", () => {
  const body = { home_service_enabled: false, price_from: 0 };
  assert.equal(mergeDraftBoolean({ body, keys: ["home_service_enabled"], existing: true }), false);
  assert.equal(mergeDraftNumber({ body, keys: ["price_from"], existing: 5000 }), 0);
});

test("draft change detection ignores transport metadata but accepts real edits", () => {
  assert.equal(hasMeaningfulDraftChanges({ submit_intent: "draft", clear_fields: [] }), false);
  assert.equal(hasMeaningfulDraftChanges({ submit_intent: "draft", business_name: "New name" }), true);
  assert.equal(hasMeaningfulDraftChanges({ submit_intent: "draft", clear_fields: ["image"] }), true);
});

test("publish validation is strict without affecting draft merge", () => {
  assert.deepEqual(
    getStandPublishMissingDetails({
      stand: {
        business_name: "Business stand draft 7",
        business_type: "Services",
        phone: "",
        location: "Location not set",
        map_icon_type: "",
      },
      services: [],
      schedule: [],
    }),
    ["business name", "business category", "valid Uganda business phone", "business or service-area location", "map icon", "at least one service", "opening hours"]
  );

  assert.deepEqual(
    getStandPublishMissingDetails({
      stand: {
        business_name: "Kampala Cuts",
        business_type: "Barber",
        phone: "+256700000000",
        location: "Nakasero",
        map_icon_type: "barber",
      },
      services: [{ service_name: "Haircut", pricing_type: "fixed", price_extra: 15000, duration_minutes: 30 }],
      schedule: [{ day_of_week: 1, is_open: 1, start_time: "08:00", end_time: "18:00" }],
    }),
    []
  );
});

test("Uganda stand phones are normalized and long services can publish", () => {
  assert.equal(normalizeUgandaStandPhone("0772 123 456"), "+256772123456");
  assert.equal(normalizeUgandaStandPhone("1234"), "");

  assert.deepEqual(
    getStandPublishMissingDetails({
      stand: {
        business_name: "Remote Design Studio",
        business_type: "Design",
        phone: "0772123456",
        location: "Location not set",
        map_icon_type: "design",
      },
      services: [{
        service_name: "Brand project",
        pricing_type: "fixed",
        price_extra: 150000,
        duration_minutes: 10080,
        location_type: "online",
      }],
      schedule: [{ day_of_week: 1, is_open: 1, start_time: "08:00", end_time: "18:00" }],
    }),
    []
  );
});
