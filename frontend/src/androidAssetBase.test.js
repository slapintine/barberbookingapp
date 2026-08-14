import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Android production build invokes Vite directly with packaged asset base", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "build-android-production.cjs"), "utf8");
  assert.match(script, /VITE_BASE_PATH:\s*"\.\/"/);
  assert.match(script, /"vite",\s*"build"/);
  assert.doesNotMatch(script, /npm",\s*\["run",\s*"build:web"/);
});

test("web production build keeps the /app/ deployment base", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts["build:web"], /VITE_BASE_PATH=\/app\//);
});
