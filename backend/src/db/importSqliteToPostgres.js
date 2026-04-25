import path from "path";
import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import { env } from "../config/env.js";
import { migratePostgres } from "./migratePostgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

function sqliteAll(sqlite, sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
}

function sqliteClose(sqlite) {
  return new Promise((resolve, reject) => {
    sqlite.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function tableColumns(sqlite, tableName) {
  const rows = await sqliteAll(sqlite, `PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
}

async function sqliteTableExists(sqlite, tableName) {
  const rows = await sqliteAll(
    sqlite,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName]
  );
  return rows.length > 0;
}

function pick(row, columns, fallback = {}) {
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [
      key,
      columns.has(key) && row[key] !== undefined ? row[key] : value,
    ])
  );
}

async function insertRows(tableName, rows, columns, conflictSql = "ON CONFLICT (id) DO NOTHING") {
  if (!rows.length) return 0;

  let imported = 0;
  const names = columns.map((column) => column.name);
  const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `
    INSERT INTO ${tableName} (${names.join(", ")})
    VALUES (${placeholders})
    ${conflictSql}
  `;

  for (const row of rows) {
    const values = columns.map((column) => row[column.name] ?? column.defaultValue ?? null);
    const result = await db.pool.query(sql, values);
    imported += result.rowCount;
  }

  return imported;
}

async function resetIdentity(tableName) {
  await db.pool.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${tableName}), 1), true)`,
    [tableName]
  );
}

async function importTable(sqlite, tableName, columns, conflictSql) {
  if (!(await sqliteTableExists(sqlite, tableName))) {
    console.log(`${tableName}: source table missing, skipped`);
    return;
  }

  const rows = await sqliteAll(sqlite, `SELECT * FROM ${tableName} ORDER BY id ASC`);
  const sourceColumns = await tableColumns(sqlite, tableName);
  const normalized = rows.map((row) => {
    const defaults = Object.fromEntries(columns.map((column) => [column.name, column.defaultValue ?? null]));
    return { ...defaults, ...pick(row, sourceColumns, defaults) };
  });
  const imported = await insertRows(tableName, normalized, columns, conflictSql);
  await resetIdentity(tableName);
  console.log(`${tableName}: imported ${imported}, skipped ${rows.length - imported}`);
}

async function main() {
  if (db.client !== "postgres") {
    throw new Error("Set DB_CLIENT=postgres before importing SQLite data.");
  }

  await migratePostgres();

  const sqlitePath = path.resolve(projectRoot, env.dbPath);
  const sqlite = new sqlite3.Database(sqlitePath);

  try {
    await db.pool.query("BEGIN");

    await importTable(sqlite, "users", [
      { name: "id" },
      { name: "username" },
      { name: "password_hash" },
      { name: "role", defaultValue: "customer" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "profiles", [
      { name: "id" },
      { name: "user_id" },
      { name: "full_name", defaultValue: "" },
      { name: "phone", defaultValue: "" },
      { name: "email", defaultValue: "" },
      { name: "address", defaultValue: "" },
      { name: "profile_photo", defaultValue: "" },
    ]);

    await importTable(sqlite, "barbers", [
      { name: "id" },
      { name: "owner_user_id" },
      { name: "business_name" },
      { name: "location" },
      { name: "latitude" },
      { name: "longitude" },
      { name: "price_from", defaultValue: 0 },
      { name: "verified_status", defaultValue: "New" },
      { name: "image", defaultValue: "" },
      { name: "availability_start", defaultValue: "08:00" },
      { name: "availability_end", defaultValue: "20:00" },
      { name: "accepts_wallet", defaultValue: 0 },
      { name: "accepts_cash", defaultValue: 1 },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "barber_services", [
      { name: "id" },
      { name: "barber_id" },
      { name: "service_name" },
      { name: "price_extra", defaultValue: 0 },
      { name: "duration_minutes", defaultValue: 30 },
    ]);

    await importTable(sqlite, "barber_schedule", [
      { name: "id" },
      { name: "barber_id" },
      { name: "day_of_week" },
      { name: "is_open", defaultValue: 1 },
      { name: "start_time", defaultValue: "08:00" },
      { name: "end_time", defaultValue: "20:00" },
      { name: "break_start" },
      { name: "break_end" },
    ]);

    await importTable(sqlite, "bookings", [
      { name: "id" },
      { name: "barber_id" },
      { name: "customer_user_id" },
      { name: "service_name" },
      { name: "booking_date" },
      { name: "booking_time" },
      { name: "price", defaultValue: 0 },
      { name: "service_duration_minutes", defaultValue: 30 },
      { name: "status", defaultValue: "pending" },
      { name: "payment_method", defaultValue: "cash" },
      { name: "payment_status", defaultValue: "unpaid" },
      { name: "paid_at" },
      { name: "cancelled_by" },
      { name: "cancellation_reason", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "booking_events", [
      { name: "id" },
      { name: "booking_id" },
      { name: "actor_user_id" },
      { name: "event_type" },
      { name: "event_note", defaultValue: "" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "favorites", [
      { name: "id" },
      { name: "user_id" },
      { name: "barber_id" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "reviews", [
      { name: "id" },
      { name: "booking_id" },
      { name: "barber_id" },
      { name: "user_id" },
      { name: "rating" },
      { name: "review_text", defaultValue: "" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "messages", [
      { name: "id" },
      { name: "barber_id" },
      { name: "customer_user_id" },
      { name: "sender_user_id" },
      { name: "text" },
      { name: "seen", defaultValue: 0 },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "notifications", [
      { name: "id" },
      { name: "user_id" },
      { name: "title", defaultValue: "Notification" },
      { name: "type", defaultValue: "system" },
      { name: "message" },
      { name: "barber_id" },
      { name: "customer_user_id" },
      { name: "customer_username", defaultValue: "" },
      { name: "barber_owner_username", defaultValue: "" },
      { name: "read", defaultValue: 0 },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "audit_logs", [
      { name: "id" },
      { name: "user_id" },
      { name: "action" },
      { name: "created_at" },
    ]);

    await db.pool.query("COMMIT");
    console.log("SQLite import complete.");
  } catch (error) {
    await db.pool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await sqliteClose(sqlite);
    await db.close?.();
  }
}

main().catch((error) => {
  console.error("SQLite import failed:", error);
  process.exit(1);
});
