import { env } from "../config/env.js";
import { getPaidFeatureSafety, remediatePaidFeatureEntitlements } from "../services/deploymentReadiness.js";

const args = new Set(process.argv.slice(2));
const shouldRemediate = args.has("--remediate");
const confirmed = args.has("--confirm-paid-feature-cleanup");

const safety = await getPaidFeatureSafety();

console.log(
  JSON.stringify(
    {
      mode: shouldRemediate ? "remediate" : "dry_run",
      database: env.dbClient,
      ...safety,
      note:
        "Dry run by default. Remediation expires/deactivates Customer Premium and provider Platinum rows that cannot satisfy paid-feature entitlement checks. It does not create missing payment records or decide disputed billing history.",
    },
    null,
    2
  )
);

if (!shouldRemediate) {
  process.exit(safety.customerUnsafeRows.length || safety.providerUnsafeRows.length ? 1 : 0);
}

if (!confirmed) {
  console.error("Refusing remediation without --confirm-paid-feature-cleanup.");
  process.exit(1);
}

if (env.nodeEnv === "production" && process.env.ALLOW_PRODUCTION_PAID_FEATURE_CLEANUP !== "true") {
  console.error("Refusing production remediation unless ALLOW_PRODUCTION_PAID_FEATURE_CLEANUP=true is set.");
  process.exit(1);
}

const result = await remediatePaidFeatureEntitlements({
  reason: "CLI paid feature entitlement cleanup",
});

console.log(
  JSON.stringify(
    {
      remediated: true,
      before: {
        unsafeCustomerPremiumRows: result.before.customerUnsafeRows.length,
        unsafeProviderPlatinumRows: result.before.providerUnsafeRows.length,
      },
      after: {
        unsafeCustomerPremiumRows: result.after.customerUnsafeRows.length,
        unsafeProviderPlatinumRows: result.after.providerUnsafeRows.length,
      },
    },
    null,
    2
  )
);

process.exit(result.after.customerUnsafeRows.length || result.after.providerUnsafeRows.length ? 1 : 0);
