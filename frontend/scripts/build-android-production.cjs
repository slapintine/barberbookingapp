const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const frontendRoot = path.resolve(__dirname, "..");
const expectedApiUrl = "https://queless.org/api";
const versionName = "1.0.11";
const versionCode = "12";

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
    cwd: options.cwd || frontendRoot,
    env: options.env || process.env,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) fail(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

const branch = git(["branch", "--show-current"]);
const commit = git(["rev-parse", "HEAD"]);
if (!/^release\/queless-/.test(branch) && !/^recovery\/restore-modern-queless-/.test(branch)) {
  fail(`Refusing production Android sync from unexpected branch: ${branch}`);
}
if (commit.startsWith("74ca5b29d0d6")) fail("Refusing to build the known-bad 1.0.9 regression commit.");
if (git(["ls-files", "android"])) fail("Tracked root android/ files are forbidden for the production build.");

const env = {
  ...process.env,
  QUELESS_BUILD_VERSION: commit.slice(0, 12),
  VITE_BASE_PATH: "./",
  VITE_API_URL: expectedApiUrl,
  VITE_ENABLE_PAYMENTS: "false",
  VITE_ENABLE_SMS: "false",
};

fs.rmSync(path.join(frontendRoot, "dist"), { recursive: true, force: true });
fs.rmSync(path.join(frontendRoot, "android", "app", "src", "main", "assets", "public"), { recursive: true, force: true });

run("npx", ["vite", "build", "--mode", "production"], { cwd: frontendRoot, env });

const manifest = {
  app: "Queless",
  packageName: "org.queless.app",
  versionName,
  versionCode: Number(versionCode),
  branch,
  gitCommit: commit,
  sourceCommit: "5d4bc1e6c8ec5774de573a1e58f936bdc98350db",
  builtAt: new Date().toISOString(),
  apiUrl: expectedApiUrl,
  webDir: "frontend/dist",
  androidShell: "frontend/android",
};
fs.writeFileSync(path.join(frontendRoot, "dist", "queless-release-manifest.json"), JSON.stringify(manifest, null, 2));

run("npx", ["cap", "sync", "android"], { cwd: frontendRoot, env });
run("node", [path.join(repoRoot, "scripts", "verifyAndroidReleaseCandidate.cjs"), "--allow-dirty"], {
  cwd: repoRoot,
  env,
});
