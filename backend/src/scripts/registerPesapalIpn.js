import { ensurePesapalIpn } from "../utils/pesapalSetup.js";
import { env } from "../config/env.js";

const ipnUrl =
  process.argv[2] ||
  process.env.PESAPAL_IPN_URL ||
  `${env.appPublicUrl || "https://lineupbarberbooking.org"}/api/wallet/pesapal/ipn`;

try {
  const result = await ensurePesapalIpn(ipnUrl);
  console.log(JSON.stringify({
    success: true,
    created: result.created,
    ipn_id: result.ipn.ipn_id,
    url: result.ipn.url || ipnUrl,
    status: result.ipn.status || "",
  }, null, 2));
  console.log(`\nAdd this to backend .env:\nPESAPAL_IPN_ID=${result.ipn.ipn_id}`);
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    message: error.message || "Could not register Pesapal IPN.",
  }, null, 2));
  process.exitCode = 1;
}
