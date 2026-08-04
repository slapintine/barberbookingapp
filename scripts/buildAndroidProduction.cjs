const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(repoRoot, "frontend");
const androidFrontendDir = path.join(repoRoot, "android");
const expectedPackageName = "org.queless.app";
const expectedVersionName = "1.0.9";
const expectedVersionCode = 10;
const gradleBuildDir = path.resolve(
  process.env.QUELESS_GRADLE_BUILD_DIR || path.join(os.tmpdir(), "queless-android-gradle-release", commitSafeTimestamp())
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const runViaCmd =
    process.platform === "win32" &&
    (["npm", "npx"].includes(command) || String(command).toLowerCase().endsWith(".bat"));
  const resolvedCommand = runViaCmd ? process.env.ComSpec || "cmd.exe" : command;
  const resolvedArgs = runViaCmd ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(resolvedCommand, resolvedArgs, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) fail(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

function output(command, args, options = {}) {
  const runViaCmd =
    process.platform === "win32" &&
    (["git"].includes(command) || String(command).toLowerCase().endsWith(".bat"));
  const resolvedCommand = runViaCmd ? process.env.ComSpec || "cmd.exe" : command;
  const resolvedArgs = runViaCmd ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(resolvedCommand, resolvedArgs, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    shell: false,
    encoding: "utf8",
  });
  if (result.error) fail(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) fail((result.stderr || result.stdout || `Command failed: ${command}`).trim());
  return result.stdout.trim();
}

function requireFile(filePath, message) {
  if (!fs.existsSync(filePath)) fail(`${message}: ${filePath}`);
}

function listFiles(rootDir) {
  const result = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(fullPath));
    else if (entry.isFile()) result.push(fullPath);
  }
  return result;
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashString(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashDirectory(rootDir) {
  const files = listFiles(rootDir)
    .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"))
    .filter((relativePath) => !/(^|\/)(build|dist|\.gradle|node_modules)\//.test(relativePath))
    .filter((relativePath) => !/^android\/app\/src\/main\/assets\//.test(relativePath))
    .filter((relativePath) => !/^android\/app\/src\/main\/res\/xml\/config\.xml$/.test(relativePath))
    .sort();
  return hashString(files.map((relativePath) => `${relativePath}:${hashFile(path.join(rootDir, relativePath))}`).join("\n"));
}

function commitSafeTimestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function verifyCopiedAssets(sourceDir, targetDir) {
  const sourceFiles = listFiles(sourceDir);
  const sourceRelativePaths = new Set(sourceFiles.map((filePath) => path.relative(sourceDir, filePath)));
  const targetFiles = listFiles(targetDir);
  const capacitorGeneratedAssetFiles = new Set([
    "capacitor.config.json",
    "capacitor.plugins.json",
    "cordova.js",
    "cordova_plugins.js",
  ]);
  const mismatches = [];

  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(sourceDir, sourceFile);
    const targetFile = path.join(targetDir, relativePath);
    if (!fs.existsSync(targetFile)) mismatches.push(`${relativePath} is missing from packaged assets`);
    else if (hashFile(sourceFile) !== hashFile(targetFile)) mismatches.push(`${relativePath} hash does not match fresh frontend dist`);
  }

  for (const targetFile of targetFiles) {
    const relativePath = path.relative(targetDir, targetFile);
    if (!sourceRelativePaths.has(relativePath) && !capacitorGeneratedAssetFiles.has(relativePath.replace(/\\/g, "/"))) {
      mismatches.push(`${relativePath} is stale or extra in packaged assets`);
    }
  }

  if (mismatches.length) {
    console.error("Packaged Android assets do not match the authoritative frontend dist:");
    for (const mismatch of mismatches.slice(0, 20)) console.error(`- ${mismatch}`);
    if (mismatches.length > 20) console.error(`- ${mismatches.length - 20} more mismatches`);
    process.exit(1);
  }
}

function assertNoOldFlows(distText) {
  const oldFlowAbsenceChecks = {
    noShopRoute: !/[`'"]\/shop[`'"]/.test(distText),
    noCartRoute: !/[`'"]\/cart[`'"]/.test(distText),
    noProductsRoute: !/[`'"]\/products[`'"]/.test(distText),
    noMarketplaceRoute: !/[`'"]\/marketplace[`'"]/.test(distText),
    noPhoneOtpLogin: !/phone\s*otp\s*(?:login|sign[\s-]?in|auth)|(?:login|sign[\s-]?in|auth)\s*(?:with|by)?\s*phone\s*otp|\/phone-otp|\/otp-login/i.test(distText),
    noOldSourcePaths: !/barber-booking-app|AppData[\\/]Local[\\/]Temp|\.codex/i.test(distText),
  };
  const failed = Object.entries(oldFlowAbsenceChecks).filter(([, passed]) => !passed);
  if (failed.length) {
    console.error("Production APK build failed old-flow absence checks:");
    for (const [name] of failed) console.error(`- ${name}`);
    process.exit(1);
  }
  return oldFlowAbsenceChecks;
}

if (path.basename(repoRoot) !== "queless-rc-security") fail("Run this script inside the authoritative queless-rc-security repository.");
const branch = output("git", ["branch", "--show-current"]);
if (branch !== "rc/backend-security-foundation") fail(`Refusing production Android build from unexpected branch: ${branch}`);
const commit = output("git", ["rev-parse", "HEAD"]);
const trackedStatus = output("git", ["status", "--porcelain", "--untracked-files=no"]);
if (trackedStatus) {
  fail("Refusing to package production Android from a tracked-dirty source tree. Commit reviewed source changes first.");
}
requireFile(path.join(frontendDir, "package.json"), "Authoritative frontend is missing");
requireFile(path.join(androidFrontendDir, "capacitor.config.json"), "Authoritative Android shell is missing");
requireFile(path.join(androidFrontendDir, "android", "gradlew.bat"), "Android Gradle wrapper is missing");
requireFile(process.env.QUELESS_ANDROID_SIGNING_PROPERTIES || "", "Set QUELESS_ANDROID_SIGNING_PROPERTIES to the untracked release signing properties file");

const capacitorConfig = JSON.parse(fs.readFileSync(path.join(androidFrontendDir, "capacitor.config.json"), "utf8"));
if (capacitorConfig.appId !== expectedPackageName || capacitorConfig.appName !== "Queless" || capacitorConfig.webDir !== "dist") {
  fail("Capacitor config does not match the approved production Queless Android identity.");
}
const appBuildGradle = fs.readFileSync(path.join(androidFrontendDir, "android", "app", "build.gradle"), "utf8");
if (
  !new RegExp(`applicationId\\s+"${expectedPackageName.replace(/\./g, "\\.")}"`).test(appBuildGradle) ||
  !new RegExp(`versionCode\\s+${expectedVersionCode}`).test(appBuildGradle) ||
  !new RegExp(`versionName\\s+"${expectedVersionName.replace(/\./g, "\\.")}"`).test(appBuildGradle)
) {
  fail(`Android Gradle config must keep production ${expectedVersionName} / code ${expectedVersionCode} identity.`);
}

const buildEnv = {
  ...process.env,
  VITE_API_BASE_URL: "https://queless.org/api",
  VITE_BASE_PATH: "/",
  VITE_BUILD_TARGET: "android-production",
};

console.log("Building signed Queless production APK. This command does not install an APK.");
console.log(`Package name: ${expectedPackageName}`);
console.log(`Version: ${expectedVersionName} (${expectedVersionCode})`);
console.log(`Commit: ${commit}`);
run("npm", ["--prefix", "frontend", "run", "build"], { cwd: repoRoot, env: buildEnv });

const distDir = path.join(frontendDir, "dist");
const versionPath = path.join(distDir, "version.json");
requireFile(path.join(distDir, "index.html"), "Frontend build did not produce index.html");
requireFile(versionPath, "Frontend build did not produce version.json");

const distFilesBeforeManifest = listFiles(distDir).filter((filePath) => path.basename(filePath) !== "queless-build-manifest.json");
const frontendOutputHash = hashString(
  distFilesBeforeManifest
    .map((filePath) => `${path.relative(distDir, filePath).replace(/\\/g, "/")}:${hashFile(filePath)}`)
    .sort()
    .join("\n")
);
const routeEvidence = {
  login: distFilesBeforeManifest.some((filePath) => fs.readFileSync(filePath).includes("/login")),
  smartMatch: distFilesBeforeManifest.some((filePath) => fs.readFileSync(filePath).includes("/smart-match")),
  providerCoach: distFilesBeforeManifest.some((filePath) => fs.readFileSync(filePath).includes("/provider/ai-coach")),
  providerPlatinum: distFilesBeforeManifest.some((filePath) => fs.readFileSync(filePath).includes("/provider/platinum")),
};
if (!routeEvidence.login || !routeEvidence.smartMatch || !routeEvidence.providerCoach || !routeEvidence.providerPlatinum) {
  fail("Production Android build is missing required current Queless routes.");
}
const distText = distFilesBeforeManifest
  .filter((filePath) => /\.(html|js|css|json)$/.test(filePath))
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n");
const oldFlowAbsenceChecks = assertNoOldFlows(distText);
if (/https?:\/\/(?:localhost|127\.0\.0\.1)|:5012|local-qa|localqa|staging\.queless/i.test(distText)) {
  fail("Production APK contains a local, QA, or staging API endpoint.");
}

const buildManifest = {
  repositoryName: "queless-rc-security",
  authoritativeRepository: "queless-rc-security",
  branch,
  gitCommit: commit,
  buildTimestamp: new Date().toISOString(),
  buildType: "production-android",
  packageName: expectedPackageName,
  appName: "Queless",
  appVersion: expectedVersionName,
  versionCode: expectedVersionCode,
  frontendOutputHash,
  androidSourcePath: "android",
  androidSourceHash: hashDirectory(androidFrontendDir),
  mainJavaScriptBundleHash:
    distFilesBeforeManifest
      .filter((filePath) => /\/assets\/index-[^/]+\.js$/.test(filePath.replace(/\\/g, "/")))
      .map(hashFile)[0] || null,
  mainCssBundleHash:
    distFilesBeforeManifest
      .filter((filePath) => /\/assets\/index-[^/]+\.css$/.test(filePath.replace(/\\/g, "/")))
      .map(hashFile)[0] || null,
  requiredRouteChecks: routeEvidence,
  oldFlowAbsenceChecks,
  packagedRoutes: ["/login", "/home", "/smart-match", "/provider/ai-coach", "/provider/platinum"],
};
fs.writeFileSync(path.join(distDir, "queless-build-manifest.json"), `${JSON.stringify(buildManifest, null, 2)}\n`);

const syncEnv = { ...buildEnv, QUELESS_ANDROID_WEB_DIR: distDir };
console.log(`Copying ${distDir} into Android shell at ${androidFrontendDir}`);
run("npm", ["run", "build:android:local-qa"], { cwd: androidFrontendDir, env: syncEnv });

const packagedVersionPath = path.join(androidFrontendDir, "android", "app", "src", "main", "assets", "public", "version.json");
const packagedManifestPath = path.join(androidFrontendDir, "android", "app", "src", "main", "assets", "public", "queless-build-manifest.json");
requireFile(packagedVersionPath, "Capacitor sync did not package version.json");
requireFile(packagedManifestPath, "Capacitor sync did not package queless-build-manifest.json");
const packagedVersion = JSON.parse(fs.readFileSync(packagedVersionPath, "utf8"));
const packagedManifest = JSON.parse(fs.readFileSync(packagedManifestPath, "utf8"));
if (
  packagedVersion.version !== commit.slice(0, 12) ||
  packagedManifest.gitCommit !== commit ||
  packagedManifest.packageName !== expectedPackageName
) {
  fail("Packaged production metadata does not match this repository commit and package identity.");
}
verifyCopiedAssets(distDir, path.dirname(packagedVersionPath));

console.log("Assembling signed org.queless.app release APK");
run(path.join(androidFrontendDir, "android", "gradlew.bat"), ["-p", path.join(androidFrontendDir, "android"), "assembleRelease"], {
  cwd: androidFrontendDir,
  env: { ...buildEnv, QUELESS_GRADLE_BUILD_DIR: gradleBuildDir },
});

const apkPath = path.join(gradleBuildDir, "_app", "outputs", "apk", "release", "app-release.apk");
requireFile(apkPath, "Android release APK was not produced");
console.log(`Packaged commit: ${packagedVersion.version}`);
console.log(`Packaged manifest: ${packagedManifestPath}`);
console.log(`Output APK: ${apkPath}`);
