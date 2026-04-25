import { env } from "../config/env.js";
import { mtnService } from "../services/mtn.service.js";

function resolveCallbackHost() {
  const explicitHost = String(process.env.CALLBACK_HOST || "").trim();
  if (explicitHost) {
    return explicitHost.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }

  const callbackUrl = String(env.mobileMoneyCallbackUrl || "").trim();
  if (!callbackUrl) {
    throw new Error("CALLBACK_HOST or MOBILE_MONEY_CALLBACK_URL is required.");
  }

  return new URL(callbackUrl).host;
}

async function main() {
  const callbackHost = resolveCallbackHost();
  const result = await mtnService.createApiUser({ providerCallbackHost: callbackHost });
  const apiKeyResult = await mtnService.createApiKey({ apiUserId: result.apiUserId });

  process.stdout.write(
    `${JSON.stringify(
      {
        success: true,
        callbackHost,
        apiUserId: result.apiUserId,
        apiKey: apiKeyResult.apiKey,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  if (error?.providerResponse) {
    process.stderr.write(`${JSON.stringify(error.providerResponse, null, 2)}\n`);
  }
  process.exit(1);
});
