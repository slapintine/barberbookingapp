import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import { logger } from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations", "postgres");

export async function migratePostgres() {
  if (db.client !== "postgres") return;

  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await db.pool.query(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [file]
    );

    if (existing.rowCount > 0) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");

    await db.pool.query("BEGIN");
    try {
      await db.pool.query(sql);
      await db.pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await db.pool.query("COMMIT");
      logger.info({ migration: file }, "Applied PostgreSQL migration");
    } catch (error) {
      await db.pool.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
}
