import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = resolve(currentDir, "../..");
const repoRoot = resolve(frontendRoot, "..");

const privateViteNamePattern =
  /^VITE_.*(SECRET|PRIVATE|PASSWORD|SERVICE_ROLE|DATABASE|JWT|TOKEN|MTN|AIRTEL|AFRICAS|AFRICASTALKING|WEBHOOK|ADMIN)/i;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (fullPath.includes(`${join("", "node_modules")}`) || fullPath.includes(`${join("", "dist")}`)) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

test("frontend only references public VITE env names", () => {
  const files = walk(join(frontendRoot, "src")).filter((file) => /\.(js|jsx|ts|tsx)$/.test(file));
  const unsafeReferences = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
      if (privateViteNamePattern.test(match[1])) {
        unsafeReferences.push(`${file.replace(repoRoot, "")}:${match[1]}`);
      }
    }
  }

  assert.deepEqual(unsafeReferences, []);
});

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

test("production env file only contains public client config", () => {
  const productionEnvPath = join(frontendRoot, ".env.production");
  if (existsSync(productionEnvPath)) {
    const env = parseEnv(readFileSync(productionEnvPath, "utf8"));
    assert.equal(env.VITE_API_URL, "https://queless.org/api");
    assert.equal(env.VITE_BASE_PATH, "/app/");
    assert.equal(env.VITE_FIREBASE_API_KEY || "", "");
    assert.equal(env.VITE_FIREBASE_VAPID_KEY || "", "");
  }

  assert.equal(existsSync(join(frontendRoot, ".env.local")), false);
});
