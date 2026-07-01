import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppBasePath } from "./appBasePath.js";

test("normalizes web and Capacitor build bases without creating a dot route", () => {
  assert.equal(normalizeAppBasePath("/app/"), "/app");
  assert.equal(normalizeAppBasePath("./"), "");
  assert.equal(normalizeAppBasePath("."), "");
  assert.equal(normalizeAppBasePath("/"), "");
});
