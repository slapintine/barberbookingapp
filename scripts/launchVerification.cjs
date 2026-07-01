const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  {
    name: "Backend syntax check",
    command: [npmCommand, ["run", "backend:check"]],
  },
  {
    name: "Backend test suite",
    command: [npmCommand, ["run", "backend:test"]],
  },
  {
    name: "Database migrations",
    command: [npmCommand, ["run", "backend:db:migrate"]],
  },
  {
    name: "Frontend test suite",
    command: [npmCommand, ["run", "frontend:test"]],
  },
  {
    name: "Frontend production build",
    command: [npmCommand, ["run", "frontend:build"]],
  },
  {
    name: "Provider publication audit",
    command: [npmCommand, ["--prefix", "backend", "run", "audit:provider-readiness"]],
  },
  {
    name: "Demo business audit",
    command: [npmCommand, ["--prefix", "backend", "run", "audit:demo-businesses"]],
  },
  {
    name: "Queless deployment gate",
    command: [npmCommand, ["--prefix", "backend", "run", "check:deployment"]],
    authoritativeGate: true,
  },
];

function printDecision(decision, reason = "") {
  const write = decision === "GO" ? console.log : console.error;
  write("");
  write("========================================");
  write(`Queless launch decision: ${decision}`);
  if (reason) write(reason);
  write("========================================");
}

function redactSensitiveOutput(value) {
  return String(value || "")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, "$1 [REDACTED]")
    .replace(/([?&](?:api[_-]?key|access[_-]?token|auth|authorization|password|secret|token)=)[^&#\s"']+/gi, "$1[REDACTED]")
    .replace(
      /((?:"|')?(?:api[_-]?key|access[_-]?token|authorization|cookie|jwt[_-]?secret|password|private[_-]?key|secret|subscription[_-]?key|token)(?:"|')?\s*[:=]\s*)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s,}]+)/gi,
      "$1[REDACTED]"
    );
}

function writeFailureOutput(result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (output) process.stderr.write(redactSensitiveOutput(output));
}

function runStep(step, index) {
  const [command, args] = step.command;
  const displayCommand = [command, ...args].join(" ");
  console.log("");
  console.log(`[${index + 1}/${steps.length}] ${step.name}`);
  console.log(`$ ${displayCommand}`);

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (result.error) {
    printDecision("NO_GO", `First blocker: ${step.name} could not start (${result.error.message}).`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (step.authoritativeGate) writeFailureOutput(result);
    const detail = step.authoritativeGate
      ? "First blocker: the deployment gate reported NO_GO. Clear the blocker checks printed above before launch."
      : `First blocker: ${step.name} failed with exit code ${result.status}.`;
    printDecision("NO_GO", detail);
    process.exit(result.status || 1);
  }

  console.log("PASS");
}

console.log("Queless launch verification");
console.log("Running backend, frontend, migration, provider, demo, and deployment gate checks.");

steps.forEach(runStep);

printDecision("GO", "All launch verification checks passed.");
