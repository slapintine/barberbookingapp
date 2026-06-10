import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import { logger } from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations", "postgres");
function emptyProductionPostgresAllowed() {
  return (
    String(process.env.ALLOW_EMPTY_PRODUCTION_POSTGRES || "").trim().toLowerCase() === "true" ||
    String(process.env.SQLITE_IMPORT_IN_PROGRESS || "").trim().toLowerCase() === "true"
  );
}

async function assertProductionDatabaseHasUsers(query) {
  if (process.env.NODE_ENV !== "production" || emptyProductionPostgresAllowed()) {
    return;
  }

  const table = await query("SELECT to_regclass('public.users') AS table_name");
  if (!table.rows?.[0]?.table_name) {
    throw new Error(
      "Refusing to run with an empty production PostgreSQL schema. Set ALLOW_EMPTY_PRODUCTION_POSTGRES=true only during the initial cutover/import window."
    );
  }

  const users = await query("SELECT COUNT(*)::int AS count FROM users");
  if (Number(users.rows?.[0]?.count || 0) === 0) {
    throw new Error(
      "Refusing to start against a production PostgreSQL database with zero users. Check DATABASE_URL; set ALLOW_EMPTY_PRODUCTION_POSTGRES=true only for the initial SQLite import."
    );
  }
}

export async function migratePostgres() {
  if (db.client !== "postgres") return;

  const client = await db.pool.connect();

  try {
    const query = (sql, params = []) => client.query(sql, params);

    await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await query("SELECT pg_advisory_lock(hashtext('queless_schema_migrations'))");

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const existing = await query(
        "SELECT id FROM schema_migrations WHERE id = $1",
        [file]
      );

      if (existing.rowCount > 0) continue;

      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");

      await query("BEGIN");
      try {
        await query(sql);
        await query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
        await query("COMMIT");
        logger.info({ migration: file }, "Applied PostgreSQL migration");
      } catch (error) {
        await query("ROLLBACK").catch(() => {});
        throw error;
      }
    }

    await assertProductionDatabaseHasUsers(query);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('queless_schema_migrations'))").catch(() => {});
    client.release();
  }
}
