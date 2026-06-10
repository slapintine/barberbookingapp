import assert from "node:assert/strict";
import test from "node:test";
import { getMapIconTypeForCategory, getMapIconTypeForSelectedCategories } from "./mapIconCategories.js";

test("derives signup map icon from the current selected categories", () => {
  assert.equal(getMapIconTypeForSelectedCategories(["Barber"]), "barber");
  assert.equal(getMapIconTypeForSelectedCategories(["Beauty", "Repairs & Maintenance"]), "multi");
  assert.equal(getMapIconTypeForSelectedCategories(["Beauty"]), "beauty");
  assert.equal(getMapIconTypeForSelectedCategories([]), "");

  assert.equal(getMapIconTypeForSelectedCategories(["Repairs & Maintenance", "Cleaning Services"]), "multi");
  assert.equal(getMapIconTypeForSelectedCategories(["Repairs & Maintenance"]), "repairs-maintenance");

  assert.equal(getMapIconTypeForSelectedCategories(["Health & Fitness"]), "health-fitness");
  assert.equal(getMapIconTypeForSelectedCategories(["Health & Fitness", "Delivery & Errands"]), "multi");
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
