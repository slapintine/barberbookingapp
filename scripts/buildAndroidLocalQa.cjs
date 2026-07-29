const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(repoRoot, "frontend");
const authoritativeAndroidDir = path.join(repoRoot, "android");
const androidFrontendDir = path.resolve(process.env.QUELESS_ANDROID_SOURCE_DIR || authoritativeAndroidDir);
const apiUrl = String(process.env.VITE_ANDROID_QA_API_URL || "http://127.0.0.1:5012/api").trim();
const expectedBranch = String(process.env.QUELESS_AUTHORITATIVE_BRANCH || "rc/backend-security-foundation").trim();
const expectedPackageName = "org.queless.app.localqa";
const buildMode = "local-qa";
const stalePathPatterns = [
  /[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i,
  /[\\/]\.codex/i,
  /[\\/]barber-booking-app[\\/]/i,
  /preservation/i,
  /backup/i,
  /old/i,
];

console.warn("Building Queless Local QA only. This command does not install an APK.");
console.warn("Local QA is a separate package: org.queless.app.localqa.");
console.warn("If installed, this installs a separate Queless Local QA application.");
console.warn("Install only with explicit user approval using npm run android:local-qa:install.");

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
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr || result.stdout || "");
    }
    process.exit(result.status || 1);
  }
  return String(result.stdout || "").trim();
}

function requireFile(filePath, message) {
  if (!fs.existsSync(filePath)) {
    console.error(`${message}: ${filePath}`);
    process.exit(1);
  }
}

function readJson(filePath, message) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`${message}: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function hashString(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function listFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (!entry.isFile()) return [];
    return [fullPath];
  });
}

function hashDirectory(rootDir) {
  const hash = crypto.createHash("sha256");
  const files = listFiles(rootDir)
    .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/"))
    .filter((relativePath) => !/(^|\/)(build|dist|\.gradle|node_modules)\//.test(relativePath))
    .filter((relativePath) => !/^android\/app\/src\/main\/assets\//.test(relativePath))
    .filter((relativePath) => !/^android\/app\/src\/main\/res\/xml\/config\.xml$/.test(relativePath))
    .sort();
  for (const relativePath of files) {
    const filePath = path.join(rootDir, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertAuthoritativeAndroidShell(shellDir) {
  const normalizedShell = path.resolve(shellDir);
  if (normalizedShell !== authoritativeAndroidDir) {
    console.error("Refusing to build Android local QA from a non-authoritative Android shell.");
    console.error(`Expected Android source: ${authoritativeAndroidDir}`);
    console.error(`Received Android source: ${normalizedShell}`);
    console.error("Do not use sibling repositories, preservation snapshots, deleted app copies, or temporary Android shells.");
    process.exit(1);
  }
  if (stalePathPatterns.some((pattern) => pattern.test(normalizedShell))) {
    console.error(`Refusing to build from a stale or temporary Android source path: ${normalizedShell}`);
    process.exit(1);
  }
}

function verifyCopiedAssets(sourceDir, targetDir) {
  const sourceFiles = listFiles(sourceDir);
  const sourceRelativePaths = new Set(sourceFiles.map((filePath) => path.relative(sourceDir, filePath)));
  const capacitorGeneratedAssetFiles = new Set(["cordova.js", "cordova_plugins.js"]);
  const mismatches = [];
  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(sourceDir, sourceFile);
    const targetFile = path.join(targetDir, relativePath);
    if (!fs.existsSync(targetFile)) {
      mismatches.push(`${relativePath} is missing from packaged assets`);
      continue;
    }
    const sourceHash = hashFile(sourceFile);
    const targetHash = hashFile(targetFile);
    if (sourceHash !== targetHash) {
      mismatches.push(`${relativePath} hash mismatch`);
    }
  }

  for (const targetFile of listFiles(targetDir)) {
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

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiUrl);
} catch {
  console.error(`VITE_ANDROID_QA_API_URL is not a valid URL: ${apiUrl}`);
  process.exit(1);
}

if (parsedApiUrl.protocol !== "http:" || !parsedApiUrl.pathname.replace(/\/+$/, "").endsWith("/api")) {
  console.error("Android local QA requires an explicit http://.../api URL.");
  process.exit(1);
}

if (/(^|\.)queless\.org$/i.test(parsedApiUrl.hostname)) {
  console.error("Refusing to build local QA against the production Queless API.");
  process.exit(1);
}

requireFile(path.join(frontendDir, "package.json"), "Current Queless frontend is missing");
assertAuthoritativeAndroidShell(androidFrontendDir);
requireFile(path.join(androidFrontendDir, "capacitor.config.json"), "Capacitor Android frontend shell is missing");
requireFile(path.join(androidFrontendDir, "android", "gradlew.bat"), "Android Gradle wrapper is missing");

const capacitorConfig = readJson(path.join(androidFrontendDir, "capacitor.config.json"), "Could not read Capacitor config");
if (capacitorConfig.appId !== "org.queless.app" || capacitorConfig.appName !== "Queless" || capacitorConfig.webDir !== "dist") {
  console.error("Capacitor config does not match the approved Queless Android identity.");
  console.error(JSON.stringify(capacitorConfig, null, 2));
  process.exit(1);
}

const appBuildGradle = fs.readFileSync(path.join(androidFrontendDir, "android", "app", "build.gradle"), "utf8");
if (!/applicationId\s+"org\.queless\.app"/.test(appBuildGradle) || !/applicationIdSuffix\s+"\.localqa"/.test(appBuildGradle)) {
  console.error("Android Gradle config must keep production and local-QA package IDs separate.");
  process.exit(1);
}
if (!/versionCode\s+8/.test(appBuildGradle) || !/versionName\s+"1\.0\.7"/.test(appBuildGradle)) {
  console.error("Android Gradle config must keep the approved 1.0.7 / code 8 identity.");
  process.exit(1);
}

const actualRepoRoot = path.resolve(run("git", ["rev-parse", "--show-toplevel"], { capture: true }));
if (actualRepoRoot !== repoRoot) {
  console.error(`Refusing to build from a non-authoritative repository. Expected ${repoRoot}, got ${actualRepoRoot}.`);
  process.exit(1);
}

const branch = run("git", ["branch", "--show-current"], { capture: true });
if (branch !== expectedBranch && process.env.QUELESS_ALLOW_NON_AUTHORITATIVE_BRANCH !== "1") {
  console.error(`Refusing to build Android local QA from branch ${branch || "(detached)"}. Expected ${expectedBranch}.`);
  console.error("Set QUELESS_ALLOW_NON_AUTHORITATIVE_BRANCH=1 only for intentional throwaway local testing.");
  process.exit(1);
}

const fullCommit = run("git", ["rev-parse", "HEAD"], { capture: true });
const commit = run("git", ["rev-parse", "--short=12", "HEAD"], { capture: true });
if (!fullCommit || !commit) {
  console.error("Could not identify the authoritative frontend commit.");
  process.exit(1);
}

const trackedDirty = run("git", ["status", "--porcelain", "--untracked-files=no"], { capture: true });
if (trackedDirty && process.env.QUELESS_ALLOW_DIRTY_ANDROID_QA !== "1") {
  console.error("Refusing to package Android local QA from a tracked-dirty source tree.");
  console.error("Commit or intentionally set QUELESS_ALLOW_DIRTY_ANDROID_QA=1 for throwaway local testing.");
  process.exit(1);
}

const buildEnv = {
  ...process.env,
  VITE_BASE_PATH: "/",
  VITE_API_URL: apiUrl,
  VITE_ENABLE_PAYMENTS: "false",
  VITE_ENABLE_SMS: "false",
  VITE_LOCAL_QA_BUILD_LABEL: `Local QA - commit ${commit}`,
};

console.log(`Authoritative repository: ${repoRoot}`);
console.log(`Authoritative branch: ${branch}`);
console.log(`Frontend commit: ${commit} (${fullCommit})`);
console.log(`Android shell: ${androidFrontendDir}`);
console.log(`API target: ${apiUrl}`);
console.log(`Package name: ${expectedPackageName}`);
console.log(`Build mode: ${buildMode}`);
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
  smartMatch: listFiles(distDir).some((filePath) => fs.readFileSync(filePath).includes("/smart-match")),
  providerCoach: listFiles(distDir).some((filePath) => fs.readFileSync(filePath).includes("/provider/ai-coach")),
  providerPlatinum: listFiles(distDir).some((filePath) => fs.readFileSync(filePath).includes("/provider/platinum")),
  login: listFiles(distDir).some((filePath) => fs.readFileSync(filePath).includes("/login")),
};
if (!routeEvidence.smartMatch || !routeEvidence.providerCoach || !routeEvidence.providerPlatinum || !routeEvidence.login) {
  console.error("Frontend build is missing one or more current Queless routes required for Android local QA.");
  console.error(JSON.stringify(routeEvidence, null, 2));
  process.exit(1);
}
const distText = distFilesBeforeManifest
  .filter((filePath) => /\.(html|js|css|json)$/.test(filePath))
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n");
const oldFlowAbsenceChecks = {
  noShopRoute: !/[`'"]\/shop[`'"]/.test(distText),
  noCartRoute: !/[`'"]\/cart[`'"]/.test(distText),
  noProductsRoute: !/[`'"]\/products[`'"]/.test(distText),
  noMarketplaceRoute: !/[`'"]\/marketplace[`'"]/.test(distText),
};
if (Object.values(oldFlowAbsenceChecks).some((passed) => !passed)) {
  console.error("Frontend build contains an old product/shop/cart/marketplace route literal.");
  console.error(JSON.stringify(oldFlowAbsenceChecks, null, 2));
  process.exit(1);
}

const version = readJson(versionPath, "Could not read frontend build version");
if (version.version !== commit) {
  console.error(`Frontend build version mismatch. Expected ${commit}, got ${version.version}`);
  process.exit(1);
}

const buildManifest = {
  repositoryName: "queless-rc-security",
  authoritativeRepository: "queless-rc-security",
  branch,
  gitCommit: fullCommit,
  buildTimestamp: new Date().toISOString(),
  buildType: buildMode,
  packageName: expectedPackageName,
  appName: "Queless Local QA",
  appVersion: "1.0.7-localqa",
  versionCode: 8,
  frontendOutputHash,
  androidSourcePath: "android",
  androidSourceHash: hashDirectory(androidFrontendDir),
  mainJavaScriptBundleHash: distFilesBeforeManifest
    .filter((filePath) => /\/assets\/index-[^/]+\.js$/.test(filePath.replace(/\\/g, "/")))
    .map(hashFile)[0] || null,
  mainCssBundleHash: distFilesBeforeManifest
    .filter((filePath) => /\/assets\/index-[^/]+\.css$/.test(filePath.replace(/\\/g, "/")))
    .map(hashFile)[0] || null,
  requiredRouteChecks: routeEvidence,
  oldFlowAbsenceChecks,
  packagedRoutes: ["/login", "/home", "/smart-match", "/provider/ai-coach", "/provider/platinum"],
};
fs.writeFileSync(path.join(distDir, "queless-build-manifest.json"), `${JSON.stringify(buildManifest, null, 2)}\n`);

const syncEnv = {
  ...buildEnv,
  QUELESS_ANDROID_WEB_DIR: distDir,
};

console.log(`Copying ${distDir} into Android shell at ${androidFrontendDir}`);
run("npm", ["run", "build:android:local-qa"], { cwd: androidFrontendDir, env: syncEnv });

const packagedVersionPath = path.join(androidFrontendDir, "android", "app", "src", "main", "assets", "public", "version.json");
requireFile(packagedVersionPath, "Capacitor sync did not package version.json");
const packagedVersion = readJson(packagedVersionPath, "Could not read packaged Android asset version");
if (packagedVersion.version !== commit) {
  console.error(`Packaged Android asset version mismatch. Expected ${commit}, got ${packagedVersion.version}`);
  process.exit(1);
}
verifyCopiedAssets(distDir, path.dirname(packagedVersionPath));

console.log("Assembling org.queless.app.localqa debug APK");
run(path.join(androidFrontendDir, "android", "gradlew.bat"), ["-p", path.join(androidFrontendDir, "android"), "assembleDebug"], {
  cwd: androidFrontendDir,
  env: buildEnv,
});

const apkPath = path.join(androidFrontendDir, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
requireFile(apkPath, "Android debug APK was not produced");

console.log(`Packaged commit: ${packagedVersion.version}`);
console.log(`Packaged version file: ${packagedVersionPath}`);
console.log(`Output APK: ${apkPath}`);
