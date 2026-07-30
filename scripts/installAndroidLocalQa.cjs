const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const gradleBuildDir = process.env.QUELESS_GRADLE_BUILD_DIR ? path.resolve(process.env.QUELESS_GRADLE_BUILD_DIR) : null;
const apkPath = process.env.QUELESS_LOCALQA_APK_PATH
  ? path.resolve(process.env.QUELESS_LOCALQA_APK_PATH)
  : gradleBuildDir
    ? path.join(gradleBuildDir, "_app", "outputs", "apk", "debug", "app-debug.apk")
    : path.join(repoRoot, "android", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const adbPath = process.env.ADB_EXE || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe");
const confirmation = "I_UNDERSTAND_THIS_INSTALLS_SEPARATE_LOCAL_QA";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr || result.stdout || "");
    process.exit(result.status || 1);
  }
  return String(result.stdout || "").trim();
}

console.warn("This installs a separate Queless Local QA application.");
console.warn("It installs only org.queless.app.localqa and must never be used as user-facing visual proof unless explicitly approved.");
console.warn("It does not install, update, clear, or uninstall org.queless.app.");

if (process.env.QUELESS_CONFIRM_LOCALQA_INSTALL !== confirmation) {
  console.error(`Refusing to install Local QA. Set QUELESS_CONFIRM_LOCALQA_INSTALL=${confirmation} only after explicit user approval.`);
  process.exit(1);
}

if (!fs.existsSync(apkPath)) {
  console.error(`Local QA APK not found. Build first with npm run android:local-qa:build`);
  console.error(apkPath);
  process.exit(1);
}

if (!fs.existsSync(adbPath)) {
  console.error(`ADB executable not found: ${adbPath}`);
  process.exit(1);
}

const packagesBefore = run(adbPath, ["shell", "pm", "list", "packages"], { capture: true });
if (!/^package:org\.queless\.app$/m.test(packagesBefore)) {
  console.warn("Warning: org.queless.app is not currently installed on the connected device.");
}

console.log(`Installing exact Local QA APK: ${apkPath}`);
run(adbPath, ["install", "-r", apkPath]);

const packagesAfter = run(adbPath, ["shell", "pm", "list", "packages"], { capture: true });
if (!/^package:org\.queless\.app\.localqa$/m.test(packagesAfter)) {
  console.error("Install did not produce org.queless.app.localqa.");
  process.exit(1);
}
if (/^package:org\.queless\.app$/m.test(packagesBefore) && !/^package:org\.queless\.app$/m.test(packagesAfter)) {
  console.error("Safety check failed: org.queless.app disappeared after Local QA install.");
  process.exit(1);
}

console.log("Installed org.queless.app.localqa. The real org.queless.app package was left separate.");
