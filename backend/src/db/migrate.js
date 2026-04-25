import dotenv from "dotenv";
import { validateEnv } from "../config/env.js";
import db from "../config/db.js";
import { initDb } from "./initDb.js";

dotenv.config();

validateEnv();
await initDb();

if (typeof db.close === "function") {
  await db.close();
}
