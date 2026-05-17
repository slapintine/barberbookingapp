import { env } from "../config/env.js";
import { mtnService } from "../services/mtn.service.js";

function print(message) {
  process.stdout.write(`${message}\n`);
}

async function main() {
  print("Checking MTN Mobile Money authentication...");
  const auth = await mtnService.checkAuthentication();
  print(auth.success ? "MTN authentication: succeeded" : `MTN authentication: failed (${auth.message})`);

  const testPhone = String(process.env.MTN_TEST_PHONE || "").trim();
  if (!testPhone) {
    print("MTN payment request: skipped (set MTN_TEST_PHONE to run a live initiation check).");
    return;
  }

  try {
    const result = await mtnService.initiateCollection({
      amount: Number(process.env.MTN_TEST_AMOUNT || 500),
      phoneNumber: testPhone,
      reference: `mtn-check-${Date.now()}`,
      description: "Queless MTN integration check",
      callbackUrl: env.mtnCallbackUrl || env.mobileMoneyCallbackUrl,
    });

    print(`MTN payment request: accepted (${result.status})`);
  } catch (error) {
    if ([401, 403].includes(Number(error.statusCode || 0))) {
      print("MTN payment request: unauthorized. MTN may need to enable Mobile Money Collections for this app.");
      return;
    }

    print(`MTN payment request: failed (${error.message || "unknown error"})`);
  }
}

main().catch((error) => {
  print(`MTN integration check failed: ${error.message || "unknown error"}`);
  process.exitCode = 1;
});
