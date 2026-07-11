import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const modalSource = fs.readFileSync(
  new URL("./features/barbers/BarberStandModals.jsx", import.meta.url),
  "utf8"
);

test("stand edit modal tolerates the no-stand state during login and refresh", () => {
  assert.match(modalSource, /barber\?\.subscription/);
  assert.match(modalSource, /\.\.\.\(barber \|\| \{\}\)/);
  assert.doesNotMatch(modalSource, /subscription:\s*barber\.subscription/);
});

test("draft save is available before the final wizard step and publish stays separate", () => {
  assert.match(modalSource, /currentStep !== lastStep[\s\S]*submitWizard\("draft"\)/);
  assert.match(modalSource, /const stepSequence = \[1, 2, 3, 4, 5, 6\]/);
  assert.match(modalSource, /submitWizard\(selectedPaidPlanComingSoon \? "draft" : "publish"\)/);
  assert.doesNotMatch(modalSource, /submitWizard\("payment"\)/);
});

test("stand wizard does not expose shop, hybrid, or product setup paths", () => {
  assert.doesNotMatch(modalSource, /Shop Stand|MARKETPLACE_MODES\.PRODUCT|MARKETPLACE_MODES\.HYBRID|ProductCatalogueEditor/);
  assert.match(modalSource, /const marketplaceMode = "service"/);
});

test("partially entered service titles stay empty when a draft is reopened", () => {
  assert.match(modalSource, /barber\.services\.map\(\(service, index\) => normalizeServiceForBooking\(service, index, \{ preserveEmptyTitle: true \}\)\)/);
});
