const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(repoRoot, "frontend");
const androidFrontendDir = path.resolve(
  process.env.QUELESS_ANDROID_FRONTEND_DIR ||
    path.join(repoRoot, "..", "barber-booking-app", "frontend")
);
const apiUrl = String(process.env.VITE_ANDROID_QA_API_URL || "http://127.0.0.1:5012/api").trim();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    shell: process.platform === "win32",
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
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
requireFile(path.join(androidFrontendDir, "capacitor.config.json"), "Capacitor Android frontend shell is missing");
requireFile(path.join(androidFrontendDir, "android", "gradlew.bat"), "Android Gradle wrapper is missing");

const commit = run("git", ["rev-parse", "--short=12", "HEAD"], { capture: true });
const trackedDirty = run("git", ["status", "--porcelain", "--untracked-files=no"], { capture: true });
if (trackedDirty && process.env.QUELESS_ALLOW_DIRTY_ANDROID_QA !== "1") {
  console.error("Refusing to package Android local QA from a tracked-dirty source tree.");
  console.error("Commit or intentionally set QUELESS_ALLOW_DIRTY_ANDROID_QA=1 for throwaway local testing.");
  process.exit(1);
}

const buildEnv = {
  ...process.env,
  VITE_BASE_PATH: "./",
  VITE_API_URL: apiUrl,
  VITE_ENABLE_PAYMENTS: "false",
  VITE_ENABLE_SMS: "false",
  VITE_LOCAL_QA_BUILD_LABEL: `Local QA - commit ${commit}`,
};

console.log(`Building current Queless frontend at ${commit}`);
console.log(`Android local QA API target: ${apiUrl}`);
run("npm", ["--prefix", "frontend", "run", "build"], { cwd: repoRoot, env: buildEnv });

const distDir = path.join(frontendDir, "dist");
const versionPath = path.join(distDir, "version.json");
requireFile(path.join(distDir, "index.html"), "Frontend build did not produce index.html");
requireFile(versionPath, "Frontend build did not produce version.json");

const version = JSON.parse(fs.readFileSync(versionPath, "utf8"));
if (version.version !== commit) {
  console.error(`Frontend build version mismatch. Expected ${commit}, got ${version.version}`);
  process.exit(1);
}

const syncEnv = {
  ...buildEnv,
  QUELESS_ANDROID_WEB_DIR: distDir,
};

console.log(`Copying ${distDir} into Android shell at ${androidFrontendDir}`);
run("npm", ["run", "build:android:local-qa"], { cwd: androidFrontendDir, env: syncEnv });

const packagedVersionPath = path.join(androidFrontendDir, "android", "app", "src", "main", "assets", "public", "version.json");
requireFile(packagedVersionPath, "Capacitor sync did not package version.json");
const packagedVersion = JSON.parse(fs.readFileSync(packagedVersionPath, "utf8"));
if (packagedVersion.version !== commit) {
  console.error(`Packaged Android asset version mismatch. Expected ${commit}, got ${packagedVersion.version}`);
  process.exit(1);
}

console.log("Assembling org.queless.app.localqa debug APK");
run(path.join(androidFrontendDir, "android", "gradlew.bat"), ["-p", path.join(androidFrontendDir, "android"), "assembleDebug"], {
  cwd: androidFrontendDir,
  env: buildEnv,
});

const apkPath = path.join(androidFrontendDir, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
requireFile(apkPath, "Android debug APK was not produced");

console.log(`Included frontend commit: ${commit}`);
console.log(`Packaged version file: ${packagedVersionPath}`);
console.log(`Output APK: ${apkPath}`);
