import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./features/barbers/BarberStandModals.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

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

test("stand wizard local backup preserves form values and resume position", () => {
  assert.match(source, /function readStandSetupBackup\(key, savedAt = 0\)/);
  assert.match(source, /resume:\s*\{\s*currentStep:/);
  assert.match(source, /activeServiceIndex:/);
  assert.match(source, /writeStandFormBackup\(backupKey, form, \{ currentStep, activeServiceIndex \}\)/);
  assert.match(source, /resumeState=\{resumeState\}/);
});

test("stale cached provider state does not block fresh stand creation", () => {
  assert.match(appSource, /const cachedExistingStand =/);
  assert.match(appSource, /const mineData = await getMyBarberStand\(\)/);
  assert.match(appSource, /setShowEditBarber\(true\)/);
  assert.match(appSource, /saveStoredBarbers\(nextBarbers\.filter\(isPublicProvider\)\)/);
  assert.doesNotMatch(appSource, /This account already has a business profile\. Open Edit Stand to continue/);
});
