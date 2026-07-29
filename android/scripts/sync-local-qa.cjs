const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const shellRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(shellRoot, "..");
const webDir = path.resolve(String(process.env.QUELESS_ANDROID_WEB_DIR || "").trim());
const localDist = path.join(shellRoot, "dist");
const packagedAssets = path.join(shellRoot, "android", "app", "src", "main", "assets", "public");
const generatedCapacitorConfig = path.join(shellRoot, "android", "app", "src", "main", "assets", "capacitor.config.json");
const generatedCapacitorPlugins = path.join(shellRoot, "android", "app", "src", "main", "assets", "capacitor.plugins.json");
const generatedConfigXml = path.join(shellRoot, "android", "app", "src", "main", "res", "xml", "config.xml");
const stalePathPatterns = [
  /[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i,
  /[\\/]\.codex/i,
  /[\\/]barber-booking-app[\\/]/i,
  /preservation/i,
  /backup/i,
  /old/i,
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireFile(filePath, message) {
  if (!fs.existsSync(filePath)) fail(`${message}: ${filePath}`);
}

function run(command, args) {
  const runViaCmd =
    process.platform === "win32" &&
    (["npm", "npx"].includes(command) || String(command).toLowerCase().endsWith(".bat"));
  const resolvedCommand = runViaCmd ? process.env.ComSpec || "cmd.exe" : command;
  const resolvedArgs = runViaCmd ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(resolvedCommand, resolvedArgs, {
    cwd: shellRoot,
    env: process.env,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) fail(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!process.env.QUELESS_ANDROID_WEB_DIR) {
  fail("Set QUELESS_ANDROID_WEB_DIR to the freshly built dist from the authoritative Queless frontend.");
}

if (!webDir.startsWith(path.join(repoRoot, "frontend") + path.sep)) {
  fail(`QUELESS_ANDROID_WEB_DIR must come from this repository's frontend build: ${webDir}`);
}

if (stalePathPatterns.some((pattern) => pattern.test(webDir) || pattern.test(shellRoot))) {
  fail("Refusing to sync Android assets from a stale, temporary, sibling, backup, or preservation path.");
}

requireFile(path.join(repoRoot, "frontend", "package.json"), "Authoritative frontend is missing");
requireFile(path.join(webDir, "index.html"), "Built frontend dist is missing index.html");
requireFile(path.join(webDir, "version.json"), "Built frontend dist is missing version.json");
requireFile(path.join(webDir, "queless-build-manifest.json"), "Built frontend dist is missing queless-build-manifest.json");
requireFile(path.join(shellRoot, "capacitor.config.json"), "Android shell is missing capacitor.config.json");
requireFile(path.join(shellRoot, "android", "gradlew.bat"), "Android shell is missing the Gradle wrapper");

fs.rmSync(localDist, { recursive: true, force: true });
fs.rmSync(packagedAssets, { recursive: true, force: true });
fs.rmSync(generatedCapacitorConfig, { force: true });
fs.rmSync(generatedCapacitorPlugins, { force: true });
fs.rmSync(generatedConfigXml, { force: true });
fs.cpSync(webDir, localDist, { recursive: true });

console.log(`Synced authoritative Queless dist from ${webDir}`);
run("npx", ["cap", "sync", "android"]);
