import db from "../config/db.js";
import { getProviderPublicationReadiness } from "../services/providerPublicationReadiness.js";

try {
  const readiness = await getProviderPublicationReadiness({ limit: 200 });
  console.log(JSON.stringify(readiness, null, 2));
} catch (error) {
  console.error("Provider publication readiness audit failed:", error.message);
  process.exitCode = 1;
} finally {
  await db.close?.();
}
