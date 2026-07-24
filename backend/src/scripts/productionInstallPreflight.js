import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const backendRoot = path.resolve(process.cwd());
const packagePath = path.join(backendRoot, "package.json");
const lockPath = path.join(backendRoot, "package-lock.json");
const requiredFiles = [packagePath, lockPath];
const failures = [];
const warnings = [];

const explicitEnvPath = process.env.DOTENV_CONFIG_PATH || process.env.ENV_FILE || "";
const productionEnvPath = path.join(backendRoot, ".env.production");
const defaultEnvPath = path.join(backendRoot, ".env");
const resolvedExplicitEnvPath = explicitEnvPath ? path.resolve(backendRoot, explicitEnvPath) : "";
const envPath =
  (resolvedExplicitEnvPath && fs.existsSync(resolvedExplicitEnvPath) ? resolvedExplicitEnvPath : "") ||
  (process.env.NODE_ENV === "production" && fs.existsSync(productionEnvPath) && fs.statSync(productionEnvPath).size > 0
    ? productionEnvPath
    : defaultEnvPath);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: backendRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args]);
  }
  return run(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    shell: process.platform === "win32",
  });
}

function captureNpm(args) {
  const result = runNpm(args);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `npm ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function addFailure(message) {
  failures.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function redact(value) {
  return String(value || "")
    .replace(/([?&](?:token|secret|password|key)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\b(Bearer|Basic)\s+[^\s]+/gi, "$1 [redacted]");
}

function checkWorkingDirectory() {
  if (!fs.existsSync(packagePath)) addFailure("package.json is missing from the current directory.");
  if (!fs.existsSync(lockPath)) addFailure("package-lock.json is missing from the current directory.");

  const pkg = safeJson(fs.readFileSync(packagePath, "utf8"), {});
  if (pkg.name !== "queless-backend") {
    addFailure(`Run this from the backend directory. Expected package name queless-backend, found ${pkg.name || "unknown"}.`);
  }

  if (pkg.dependencies?.queless) {
    addFailure("backend/package.json must not depend on the repository root package (queless/file:..).");
  }

  if (pkg.dependencies?.sqlite3 && process.env.DB_CLIENT === "postgres") {
    addFailure("sqlite3 must not be a production dependency for PostgreSQL deployments.");
  }
}

function checkToolVersions() {
  const nodeVersion = process.version;
  const npmVersion = captureNpm(["--version"]);
  console.log(`Node: ${nodeVersion}`);
  console.log(`npm: ${npmVersion}`);

  const major = Number(nodeVersion.replace(/^v/, "").split(".")[0]);
  if (!Number.isFinite(major) || major < 20) {
    addFailure("Node.js 20 or newer is required for the production backend.");
  }
}

function checkGlibc() {
  if (process.platform !== "linux") {
    addWarning("glibc check skipped because this is not Linux.");
    return;
  }

  const result = run("getconf", ["GNU_LIBC_VERSION"]);
  if (result.status !== 0) {
    addWarning("Could not detect glibc with getconf GNU_LIBC_VERSION.");
    return;
  }

  console.log(`glibc: ${result.stdout.trim()}`);
}

function checkEnvPresence() {
  if (process.env.NODE_ENV === "production" && !fs.existsSync(envPath)) {
    addFailure(`Production env file is missing: ${envPath}`);
  } else if (fs.existsSync(envPath)) {
    console.log(`Env file present: ${envPath}`);
  } else {
    addWarning("No production env file was found. Set ENV_FILE or DOTENV_CONFIG_PATH before deployment.");
  }
}

function checkPackageLock() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = runNpm(["ci", "--package-lock-only", "--dry-run", "--ignore-scripts"]);
  if (result.status !== 0) {
    addFailure(`Lockfile consistency check failed:\n${redact(result.stderr || result.stdout)}`);
  }
}

function checkProductionTree() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const audit = runNpm(["audit", "--omit=dev"]);
  if (audit.status !== 0) {
    addFailure(`Production dependency audit failed:\n${redact(audit.stdout || audit.stderr)}`);
  }

  const tree = runNpm(["ls", "--omit=dev", "--json"]);
  if (tree.status !== 0 && !tree.stdout) {
    addFailure(`npm ls --omit=dev failed:\n${redact(tree.stderr)}`);
    return;
  }

  const parsed = safeJson(tree.stdout, {});
  if (parsed.dependencies?.queless) {
    addFailure("Production dependency tree includes the repository root package (queless -> file:..).");
  }
  if (parsed.dependencies?.sqlite3 && process.env.DB_CLIENT === "postgres") {
    addFailure("Production dependency tree includes sqlite3 even though DB_CLIENT=postgres.");
  }
}

async function checkRuntimeImports() {
  if (process.env.DB_CLIENT === "postgres") {
    try {
      await import("pg");
      console.log("pg import: ok");
    } catch (error) {
      addFailure(`pg cannot be imported: ${error.message}`);
    }
    return;
  }

  try {
    await import("sqlite3");
    console.log("sqlite3 import: ok");
  } catch (error) {
    addFailure(`sqlite3 cannot be imported for SQLite mode: ${error.message}`);
  }
}

async function checkBackendStartupSmoke() {
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "production",
    QUELESS_STARTUP_SMOKE: "true",
  };
  const result = run(process.execPath, ["src/scripts/startupSmoke.js"], { env });
  if (result.status !== 0) {
    addFailure(`Backend startup smoke failed:\n${redact(result.stdout)}\n${redact(result.stderr)}`);
  } else {
    process.stdout.write(result.stdout);
  }
}

checkWorkingDirectory();
checkToolVersions();
checkGlibc();
checkEnvPresence();
checkPackageLock();
checkProductionTree();
await checkRuntimeImports();
await checkBackendStartupSmoke();

for (const warning of warnings) {
  console.warn(`WARN: ${warning}`);
}

if (failures.length) {
  console.error("\nProduction install preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Production install preflight passed.");
