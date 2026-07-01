import { getDeploymentReadiness } from "../services/deploymentReadiness.js";
import db from "../config/db.js";

function publicReport(readiness) {
  return {
    success: readiness.success,
    decision: readiness.decision,
    generatedAt: readiness.generatedAt,
    targetDomain: readiness.targetDomain,
    checks: readiness.checks,
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    metrics: readiness.metrics,
    nextActions: readiness.nextActions,
    note:
      "Secret values and record-level provider/customer data are omitted. When production online booking payments are enabled, MTN authentication must also pass.",
  };
}

try {
  const readiness = await getDeploymentReadiness();
  console.log(JSON.stringify(publicReport(readiness), null, 2));

  if (readiness.decision !== "GO") {
    process.exitCode = 1;
  }
} catch (error) {
  const errorCode = String(error?.code || "READINESS_CHECK_FAILED").replace(/[^A-Z0-9_-]/gi, "");
  console.error(
    JSON.stringify(
      {
        success: false,
        decision: "NO_GO",
        error: "Deployment readiness check could not complete.",
        errorCode,
        note: "Error details are withheld because connection errors can contain credentials. Check the private server logs.",
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await db.close?.().catch(() => {});
}
