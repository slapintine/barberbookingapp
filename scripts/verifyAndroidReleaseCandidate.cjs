const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const suspectCommit = "74ca5b29d0d6";
const requiredSourceMarkers = [
  "ServiceDetailsModal",
  "PortfolioLightbox",
  "ProviderCoachChatScreen",
  "providerCoachModel",
  "bookingReturn",
  "entitlements",
  "standSetupUtils",
  "Smart Match",
  "Request Quote",
  "Book again",
  "customer.smartMatch.rebooking",
  "Earlier slot alert",
  "createEarlierSlotAlert",
  "/api/customer-premium/slot-alerts",
  "Provider Premium",
  "Provider Platinum",
  "Email or Username",
  "reset code",
  "service-hero-overlay",
  "authBootState",
  "portfolio_json",
];
const requiredBackendMarkers = [
  "customer_slot_alerts",
  "createEarlierSlotAlert",
  "CUSTOMER_EARLIER_SLOT_ALERTS",
  "DUPLICATE_ALERT",
  "ALERT_LIMIT_REACHED",
  "provider_id = ? AND service_id = ?",
];
const requiredBundleMarkers = [
  "ServiceDetailsModal",
  "PortfolioLightbox",
  "ProviderCoachChatScreen",
  "Smart Match",
  "Request Quote",
  "Earlier slot alert",
  "/api/customer-premium/slot-alerts",
  "Email or Username",
  "authBootState",
  "service-hero-overlay",
];
const forbiddenBundleMarkers = [
  "Product marketplace",
  "Shop Products",
  "Checkout",
  "/api/cart",
  "send-phone-otp",
  "verify-phone-otp",
  "queless.app.localqa",
  "127.0.0.1",
  "localhost",
  ":5012",
  suspectCommit,
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listFiles(dir, predicate = () => true) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (predicate(fullPath)) files.push(fullPath);
    }
  }
  return files;
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label} is missing required marker: ${needle}`);
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) fail(`${label} contains forbidden marker: ${needle}`);
}

function assertPublicAssets(publicDir, expectedHead, label) {
  if (!fs.existsSync(path.join(publicDir, "index.html"))) fail(`${label} is missing index.html`);
  const versionPath = path.join(publicDir, "version.json");
  if (!fs.existsSync(versionPath)) fail(`${label} is missing version.json`);
  const version = JSON.parse(read(versionPath));
  if (version.version !== expectedHead.slice(0, 12)) {
    fail(`${label} version marker ${version.version} does not match Git HEAD ${expectedHead.slice(0, 12)}`);
  }
  const jsAndCss = listFiles(path.join(publicDir, "assets"), (file) => /\.(js|css)$/i.test(file));
  const bundleText = jsAndCss.map(read).join("\n");
  for (const marker of requiredBundleMarkers) assertContains(bundleText, marker, label);
  for (const marker of forbiddenBundleMarkers) assertNotContains(bundleText, marker, label);
}

function extractApk(apkPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-apk-inspect-"));
  const result = spawnSync("jar", ["xf", apkPath], { cwd: tempDir, stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    fail(`Unable to extract APK with jar: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return tempDir;
}

const args = process.argv.slice(2);
const apkIndex = args.indexOf("--apk");
const apkPath = apkIndex >= 0 ? path.resolve(args[apkIndex + 1] || "") : "";
const expectedVersionName = args.includes("--version-name")
  ? args[args.indexOf("--version-name") + 1]
  : "1.0.10";
const expectedVersionCode = args.includes("--version-code")
  ? Number(args[args.indexOf("--version-code") + 1])
  : 11;
const allowDirty = args.includes("--allow-dirty");

const head = git(["rev-parse", "HEAD"]);
const branch = git(["branch", "--show-current"]);
if (head.startsWith(suspectCommit)) fail(`Refusing suspect regression commit ${suspectCommit}`);
if (!/^release\/queless-/.test(branch) && !/^recovery\/restore-modern-queless-/.test(branch)) {
  fail(`Unexpected release branch: ${branch}`);
}
const trackedRootAndroid = git(["ls-files", "android"]);
if (trackedRootAndroid) fail("Tracked root android/ files are not allowed; production shell must be frontend/android.");
if (!fs.existsSync(path.join(repoRoot, "frontend", "android"))) fail("Missing selected Android shell frontend/android.");
if (!allowDirty && git(["status", "--porcelain", "--untracked-files=no"])) {
  fail("Tracked working tree is dirty.");
}

const buildGradle = read(path.join(repoRoot, "frontend", "android", "app", "build.gradle"));
assertContains(buildGradle, 'applicationId "org.queless.app"', "Android build.gradle");
assertContains(buildGradle, `versionCode ${expectedVersionCode}`, "Android build.gradle");
assertContains(buildGradle, `versionName "${expectedVersionName}"`, "Android build.gradle");

const sourceFiles = listFiles(path.join(repoRoot, "frontend", "src"), (file) => /\.(js|jsx|css)$/i.test(file));
const sourceText = sourceFiles.map(read).join("\n");
for (const marker of requiredSourceMarkers) assertContains(sourceText, marker, "frontend source");

const backendFiles = listFiles(path.join(repoRoot, "backend", "src"), (file) => /\.(js|sql)$/i.test(file));
const backendText = backendFiles.map(read).join("\n");
for (const marker of requiredBackendMarkers) assertContains(backendText, marker, "backend source");

const publicDir = path.join(repoRoot, "frontend", "android", "app", "src", "main", "assets", "public");
if (fs.existsSync(publicDir)) assertPublicAssets(publicDir, head, "Android web assets");
if (apkPath) {
  if (!fs.existsSync(apkPath)) fail(`APK not found: ${apkPath}`);
  const extracted = extractApk(apkPath);
  assertPublicAssets(path.join(extracted, "assets", "public"), head, "APK assets");
}

console.log(JSON.stringify({ ok: true, branch, commit: head, versionName: expectedVersionName, versionCode: expectedVersionCode }, null, 2));
