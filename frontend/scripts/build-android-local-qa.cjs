const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const apiUrl = String(process.env.VITE_ANDROID_QA_API_URL || process.env.VITE_API_URL || "").trim();

if (!apiUrl) {
  console.error("Set VITE_ANDROID_QA_API_URL to the local backend API URL, for example http://192.168.1.100:5011/api.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(apiUrl);
} catch {
  console.error(`VITE_ANDROID_QA_API_URL is not a valid URL: ${apiUrl}`);
  process.exit(1);
}

if (parsed.protocol !== "http:" || !parsed.pathname.replace(/\/+$/, "").endsWith("/api")) {
  console.error("Local Android QA requires an explicit http://.../api URL. Production HTTPS builds use npm run build:android.");
  process.exit(1);
}

if (/(^|\.)queless\.org$/i.test(parsed.hostname)) {
  console.error("Refusing to build a local-QA Android bundle against the production Queless API.");
  process.exit(1);
}

const env = {
  ...process.env,
  VITE_BASE_PATH: "./",
  VITE_API_URL: apiUrl,
  VITE_ENABLE_PAYMENTS: "false",
  VITE_ENABLE_SMS: "false",
};

function run(command, args) {
  const runViaCmd =
    process.platform === "win32" &&
    (["npm", "npx"].includes(command) || String(command).toLowerCase().endsWith(".bat"));
  const resolvedCommand = runViaCmd ? process.env.ComSpec || "cmd.exe" : command;
  const resolvedArgs = runViaCmd ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(resolvedCommand, resolvedArgs, {
    env,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

const externalWebDir = String(process.env.QUELESS_ANDROID_WEB_DIR || "").trim();
if (!externalWebDir) {
  console.error("Set QUELESS_ANDROID_WEB_DIR to the built dist from the current Queless frontend. Local QA must not build this older Android-shell frontend source.");
  process.exit(1);
}

const resolvedWebDir = path.resolve(externalWebDir);
const sourceIndex = path.join(resolvedWebDir, "index.html");
const sourceVersion = path.join(resolvedWebDir, "version.json");
if (!fs.existsSync(sourceIndex) || !fs.existsSync(sourceVersion)) {
  console.error(`QUELESS_ANDROID_WEB_DIR must point to a built web dist containing index.html and version.json: ${resolvedWebDir}`);
  process.exit(1);
}

const localDist = path.resolve(process.cwd(), "dist");
fs.rmSync(localDist, { recursive: true, force: true });
fs.cpSync(resolvedWebDir, localDist, { recursive: true });
console.log(`Copied authoritative Queless dist from ${resolvedWebDir}`);
run("npx", ["cap", "sync", "android"]);
