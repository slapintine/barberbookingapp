import assert from "node:assert/strict";
import test from "node:test";
import {
  MAP_ICON_OPTIONS,
  getMapIconOption,
  getMapIconTypeForCategory,
  getMapIconTypeForSelectedCategories,
  normalizeMapIconType,
  resolveProviderMapIconType,
} from "./mapIconCategories.js";

test("category helpers can suggest icons without controlling the registration wizard", () => {
  assert.equal(getMapIconTypeForSelectedCategories(["Barber"]), "barber");
  assert.equal(getMapIconTypeForSelectedCategories(["Beauty", "Repairs & Maintenance"]), "beauty");
  assert.equal(getMapIconTypeForSelectedCategories(["Beauty"]), "beauty");
  assert.equal(getMapIconTypeForSelectedCategories([]), "");

  assert.equal(getMapIconTypeForSelectedCategories(["Repairs & Maintenance", "Cleaning Services"]), "repairs-maintenance");
  assert.equal(getMapIconTypeForSelectedCategories(["Repairs & Maintenance"]), "repairs-maintenance");

  assert.equal(getMapIconTypeForSelectedCategories(["Health & Fitness"]), "health-fitness");
  assert.equal(getMapIconTypeForSelectedCategories(["Health & Fitness", "Delivery & Errands"]), "health-fitness");
  assert.equal(getMapIconTypeForSelectedCategories(["Delivery & Errands"]), "delivery-errands");
});

test("maps every signup category to a distinct provider map icon", () => {
  assert.equal(getMapIconTypeForCategory("Barber"), "barber");
  assert.equal(getMapIconTypeForCategory("Beauty"), "beauty");
  assert.equal(getMapIconTypeForCategory("Salon"), "salon");
  assert.equal(getMapIconTypeForCategory("Spa"), "spa");
  assert.equal(getMapIconTypeForCategory("Home Services"), "home-services");
  assert.equal(getMapIconTypeForCategory("Auto Services"), "auto-services");
  assert.equal(getMapIconTypeForCategory("Events & Photography"), "events-photography");
  assert.equal(getMapIconTypeForCategory("Education & Tutoring"), "education-tutoring");
  assert.equal(getMapIconTypeForCategory("Health & Fitness"), "health-fitness");
  assert.equal(getMapIconTypeForCategory("Repairs & Maintenance"), "repairs-maintenance");
  assert.equal(getMapIconTypeForCategory("Business Services"), "business-services");
  assert.equal(getMapIconTypeForCategory("Cleaning Services"), "cleaning-services");
  assert.equal(getMapIconTypeForCategory("Delivery & Errands"), "delivery-errands");
});

test("provider-selected stand map icon stays authoritative for one or many services", () => {
  const provider = {
    map_icon_type: "barber",
    services: [
      { id: 1, category: "Barber", service_name: "Haircut" },
      { id: 2, category: "Events & Photography", service_name: "Portrait session" },
      { id: 3, category: "Cleaning Services", service_name: "Studio clean-up" },
    ],
  };

  assert.equal(resolveProviderMapIconType(provider), "barber");
  assert.equal(resolveProviderMapIconType({ ...provider, services: provider.services.slice(0, 1) }), "barber");
  assert.equal(
    resolveProviderMapIconType({ ...provider, services: [...provider.services, { category: "Tailoring" }] }),
    "barber"
  );
});

test("service edits do not change the selected map icon, but stand icon edits do", () => {
  const provider = {
    mapIconType: "beauty",
    services: [{ category: "Beauty" }],
  };

  assert.equal(resolveProviderMapIconType(provider), "beauty");
  assert.equal(resolveProviderMapIconType({ ...provider, services: [{ category: "Auto Services" }] }), "beauty");
  assert.equal(resolveProviderMapIconType({ ...provider, mapIconType: "auto-services" }), "auto-services");
});

test("multi-service map icon is retired from selectable and rendered icon values", () => {
  assert.equal(MAP_ICON_OPTIONS.some((option) => /multi|mixed|all-services/i.test(`${option.id} ${option.label}`)), false);
  assert.equal(normalizeMapIconType("multi"), "default");
  assert.equal(normalizeMapIconType("multi-service"), "default");
  assert.equal(normalizeMapIconType("multi-category"), "default");
  assert.equal(getMapIconOption("multi").id, "default");
  assert.equal(resolveProviderMapIconType({ map_icon_type: "multi", services: [{ category: "Barber" }, { category: "Beauty" }] }), "default");
});

test("customer map and Smart Match map launches use the same saved icon resolution", () => {
  const smartMatchProvider = {
    mapIconType: "events-photography",
    services: [
      { category_name: "Events & Photography" },
      { category_name: "Barber" },
    ],
  };
  const marker = { category: "Barber", service: { category_name: "Barber" } };

  assert.equal(resolveProviderMapIconType(smartMatchProvider, marker), "events-photography");
});
