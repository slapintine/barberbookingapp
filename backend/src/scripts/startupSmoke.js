import "../app.js";
import { validateEnv } from "../config/env.js";
import db from "../config/db.js";

async function main() {
  validateEnv();

  if (db.client === "postgres") {
    await db.pool.query("SELECT 1");
  } else {
    await new Promise((resolve, reject) => {
      db.get("SELECT 1 AS ok", [], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  if (typeof db.close === "function") {
    await db.close();
  }

  console.log(`Backend startup smoke passed using ${db.client}.`);
}

main().catch(async (error) => {
  console.error(error?.message || error);
  if (typeof db.close === "function") {
    await db.close().catch(() => {});
  }
  process.exit(1);
});
