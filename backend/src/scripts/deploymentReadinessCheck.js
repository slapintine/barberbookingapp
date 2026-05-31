import { getDeploymentReadiness } from "../services/deploymentReadiness.js";

const readiness = await getDeploymentReadiness();

console.log(
  JSON.stringify(
    {
      ...readiness,
      note: "This script never prints secret values. When online booking payments are enabled in production, this gate also requires MTN authentication to pass.",
    },
    null,
    2
  )
);

if (readiness.decision !== "GO") {
  process.exitCode = 1;
}
