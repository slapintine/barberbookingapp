import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const controllerPath = path.resolve(here, "../controllers/marketplaceController.js");

test("marketplace providers include stored portfolio and service images", () => {
  const source = fs.readFileSync(controllerPath, "utf8");

  assert.match(source, /const portfolio = parseJsonArray\(row\.portfolio_json, \[\]\)/);
  assert.match(source, /SELECT barber_id, image/);
  assert.match(source, /withCanonicalProviderFields\([\s\S]*\{ services, portfolio \}\)/);
});
