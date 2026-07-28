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
