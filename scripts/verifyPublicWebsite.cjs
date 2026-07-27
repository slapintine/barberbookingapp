const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const websiteDir = path.resolve(repoRoot, "..", "line-up-barber-website");

function commandForPlatform(command) {
  if (process.platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  return command;
}

function run(command, args, options = {}) {
  const useShell = process.platform === "win32" && command === "npm";
  const result = spawnSync(useShell ? [command, ...args].join(" ") : commandForPlatform(command), useShell ? [] : args, {
    cwd: options.cwd || repoRoot,
    env: process.env,
    encoding: "utf8",
    shell: useShell,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (!options.silent && result.stdout) process.stdout.write(result.stdout);
  if (!options.silent && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout.trim();
}

function git(args, cwd) {
  return run("git", args, { cwd, silent: true });
}

function requireFile(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${message}: ${filePath}`);
  }
}

function verifyWebsiteSource() {
  requireFile(path.join(websiteDir, "package.json"), "Public website package.json is missing");
  requireFile(path.join(websiteDir, "src", "components", "MarketingSite.jsx"), "Public website source is missing");
  requireFile(path.join(websiteDir, "src", "services", "appReleaseUtils.js"), "Android app-release helpers are missing");

  const branch = git(["branch", "--show-current"], websiteDir) || "(detached)";
  const commit = git(["rev-parse", "HEAD"], websiteDir);
  const status = git(["status", "--short"], websiteDir);

  console.log("Public website source:");
  console.log(`Website repository: ${websiteDir}`);
  console.log(`Website branch: ${branch}`);
  console.log(`Website commit: ${commit.slice(0, 12)} (${commit})`);
  console.log(`Website dirty: ${status ? "yes" : "no"}`);
  if (status) {
    console.log("Website uncommitted changes:");
    console.log(status);
  }
}

function verifyDist() {
  const distDir = path.join(websiteDir, "dist");
  const htmlPath = path.join(distDir, "index.html");
  requireFile(htmlPath, "Public website build did not produce index.html");

  const html = fs.readFileSync(htmlPath, "utf8");
  if (!/assets\/index-[^"]+\.js/.test(html) && !/assets\/index-[^"]+\.css/.test(html)) {
    throw new Error("Public website build does not reference fingerprinted assets.");
  }

  const releaseSource = fs.readFileSync(path.join(websiteDir, "src", "services", "appReleaseUtils.js"), "utf8");
  if (!releaseSource.includes("/downloads/queless-latest.apk")) {
    throw new Error("Public website source no longer points Android downloads to /downloads/queless-latest.apk.");
  }

  const marketingSource = fs.readFileSync(path.join(websiteDir, "src", "components", "MarketingSite.jsx"), "utf8");
  if (!marketingSource.includes("MobileAppGateway") || !marketingSource.includes("Download Android APK")) {
    throw new Error("Public website source is missing the mobile Android download gateway.");
  }
}

try {
  console.log("Queless public website verification");
  console.log(`Authoritative application repository: ${repoRoot}`);
  verifyWebsiteSource();
  console.log("");
  console.log("[1/3] Website test suite");
  run("npm", ["test"], { cwd: websiteDir });
  console.log("");
  console.log("[2/3] Website lint");
  run("npm", ["run", "lint"], { cwd: websiteDir });
  console.log("");
  console.log("[3/3] Website production build");
  run("npm", ["run", "build"], { cwd: websiteDir });
  verifyDist();
  console.log("");
  console.log("Public website verification passed.");
} catch (error) {
  console.error("");
  console.error("Public website verification failed.");
  console.error(error.message);
  process.exit(1);
}
