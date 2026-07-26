import assert from "node:assert/strict";
import test from "node:test";
import { getMapIconTypeForCategory, getMapIconTypeForSelectedCategories } from "./mapIconCategories.js";

test("category helpers can suggest icons without controlling the registration wizard", () => {
  assert.equal(getMapIconTypeForSelectedCategories(["Barber"]), "barber");
  assert.equal(getMapIconTypeForSelectedCategories(["Beauty", "Repairs & Maintenance"]), "multi");
  assert.equal(getMapIconTypeForSelectedCategories(["Beauty"]), "beauty");
  assert.equal(getMapIconTypeForSelectedCategories([]), "");

  assert.equal(getMapIconTypeForSelectedCategories(["Repairs & Maintenance", "Cleaning Services"]), "multi");
  assert.equal(getMapIconTypeForSelectedCategories(["Repairs & Maintenance"]), "repairs-maintenance");

  assert.equal(getMapIconTypeForSelectedCategories(["Health & Fitness"]), "health-fitness");
  assert.equal(getMapIconTypeForSelectedCategories(["Health & Fitness", "Errands & Local Help"]), "multi");
  assert.equal(getMapIconTypeForSelectedCategories(["Errands & Local Help"]), "errands-local-help");
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
  assert.equal(getMapIconTypeForCategory("Errands & Local Help"), "errands-local-help");
});
