import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./features/barbers/BarberStandModals.jsx", import.meta.url), "utf8");

test("provider registration requires a manual Step 1 map icon", () => {
  assert.match(source, /mapIconType:\s*""/);
  assert.match(source, /if \(!form\.mapIconType\?\.trim\(\)\)/);
  assert.doesNotMatch(source, /mapIconType:\s*prev\.mapIconType\s*\|\|\s*getMapIconTypeForCategory/);
});

test("services including General service remain editable and removable", () => {
  assert.match(source, /preserveEmptyTitle:\s*true/);
  assert.match(source, /const removeService = \(index\)/);
  assert.match(source, /onClick=\{\(\) => removeService\(activeServiceIndex\)\}/);
});
