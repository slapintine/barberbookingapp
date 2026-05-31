import { env } from "../config/env.js";
import { getDemoBusinessSuspects, softDisableDemoBusinesses } from "../services/deploymentReadiness.js";

const args = new Set(process.argv.slice(2));
const shouldDelete = args.has("--delete");
const confirmed = args.has("--confirm-demo-cleanup");
const onlyCustomerFacing = args.has("--only-customer-facing");
const idsArg = process.argv.find((arg) => arg.startsWith("--ids="));
const selectedIds = idsArg
  ? idsArg
      .slice("--ids=".length)
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean)
  : [];
const suspects = await getDemoBusinessSuspects();
const customerFacingSuspects = suspects.filter((item) => item.customerFacing);
const cleanupTargets = selectedIds.length
  ? suspects.filter((item) => selectedIds.includes(Number(item.id)))
  : onlyCustomerFacing
  ? customerFacingSuspects
  : suspects;

console.log(
  JSON.stringify(
    {
      mode: shouldDelete ? "delete" : "dry_run",
      database: env.dbClient,
      suspects,
      customerFacingSuspects,
      cleanupTargets,
      note:
        "Dry run by default. Cleanup soft-disables suspect businesses only; it does not delete users, bookings, payments, or audit records. Use --ids=1,2 or --only-customer-facing to narrow confirmed cleanup targets.",
    },
    null,
    2
  )
);

if (!shouldDelete) {
  process.exit(0);
}

if (!confirmed) {
  console.error("Refusing cleanup without --confirm-demo-cleanup.");
  process.exit(1);
}

if (env.nodeEnv === "production" && process.env.ALLOW_PRODUCTION_DEMO_CLEANUP !== "true") {
  console.error("Refusing production cleanup unless ALLOW_PRODUCTION_DEMO_CLEANUP=true is set.");
  process.exit(1);
}

if (!cleanupTargets.length) {
  console.log("No matching demo cleanup targets found.");
  process.exit(0);
}

const result = await softDisableDemoBusinesses({
  ids: cleanupTargets.map((item) => item.id),
  reason: "CLI production launch demo cleanup",
});

console.log(`Soft-disabled ${result.disabledCount} suspected demo business record(s).`);
