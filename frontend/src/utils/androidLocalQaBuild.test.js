import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

test("Android local-QA build uses root asset paths for deep routes", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const script = fs.readFileSync(path.join(repoRoot, "scripts", "buildAndroidLocalQa.cjs"), "utf8");

  assert.match(script, /VITE_BASE_PATH:\s*"\/"/);
  assert.doesNotMatch(script, /VITE_BASE_PATH:\s*"\.\/"/);
});

test("Android local-QA build refuses stale external shells", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const script = fs.readFileSync(path.join(repoRoot, "scripts", "buildAndroidLocalQa.cjs"), "utf8");

  assert.match(script, /authoritativeAndroidDir\s*=\s*path\.join\(repoRoot,\s*"android"\)/);
  assert.match(script, /assertAuthoritativeAndroidShell\(androidFrontendDir\)/);
  assert.match(script, /Do not use sibling repositories, preservation snapshots, deleted app copies, or temporary Android shells/);
  assert.doesNotMatch(script, /path\.join\(repoRoot,\s*"\.\.",\s*"barber-booking-app",\s*"frontend"\)/);
  assert.doesNotMatch(script, /QUELESS_ANDROID_FRONTEND_DIR/);
});

test("Android local-QA build packages a manifest for current app verification", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const script = fs.readFileSync(path.join(repoRoot, "scripts", "buildAndroidLocalQa.cjs"), "utf8");
  const sourceDoc = fs.readFileSync(path.join(repoRoot, "ANDROID_AUTHORITATIVE_SOURCE.md"), "utf8");

  assert.match(script, /queless-build-manifest\.json/);
  assert.match(script, /"\/smart-match"/);
  assert.match(script, /"\/provider\/ai-coach"/);
  assert.match(script, /"\/provider\/platinum"/);
  assert.match(sourceDoc, /The active Queless application in this repository is the only current app source/);
  assert.match(sourceDoc, /Temporary Android shells are not authoritative/);
});
