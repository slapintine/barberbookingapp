import dotenv from "dotenv";
import { validateEnv } from "../config/env.js";
import db from "../config/db.js";
import { initDb } from "./initDb.js";
import { migratePostgres } from "./migratePostgres.js";

dotenv.config();

validateEnv();

if (db.client === "postgres") {
  await migratePostgres();
} else {
  await initDb();
}

if (typeof db.close === "function") {
  await db.close();
}
