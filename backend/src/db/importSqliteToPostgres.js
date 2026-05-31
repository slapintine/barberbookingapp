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
      { name: "account_status", defaultValue: "active" },
      { name: "email_verified_at" },
      { name: "disabled_at" },
      { name: "blocked_at" },
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
      { name: "normalized_business_name", defaultValue: "" },
      { name: "location" },
      { name: "latitude" },
      { name: "longitude" },
      { name: "price_from", defaultValue: 0 },
      { name: "verified_status", defaultValue: "New" },
      { name: "verification_document_name", defaultValue: "" },
      { name: "verification_document_url", defaultValue: "" },
      { name: "verification_notes", defaultValue: "" },
      { name: "verification_submitted_at" },
      { name: "verification_reviewed_at" },
      { name: "verification_reviewed_by" },
      { name: "image", defaultValue: "" },
      { name: "availability_start", defaultValue: "08:00" },
      { name: "availability_end", defaultValue: "20:00" },
      { name: "accepts_wallet", defaultValue: 0 },
      { name: "accepts_cash", defaultValue: 1 },
      { name: "stand_type", defaultValue: "individual" },
      { name: "business_type", defaultValue: "barber" },
      { name: "map_icon_type", defaultValue: "" },
      { name: "home_service_enabled", defaultValue: 0 },
      { name: "intro_text", defaultValue: "" },
      { name: "portfolio_json", defaultValue: "[]" },
      { name: "subscription_tier", defaultValue: "NONE" },
      { name: "selected_plan" },
      { name: "subscription_status", defaultValue: "none" },
      { name: "subscription_expires_at" },
      { name: "featured_until" },
      { name: "business_status", defaultValue: "pending_subscription" },
      { name: "is_published", defaultValue: 0 },
      { name: "trial_plan" },
      { name: "trial_started_at" },
      { name: "trial_ends_at" },
      { name: "trial_status" },
      { name: "used_trials", defaultValue: "[]" },
      { name: "trial_used", defaultValue: 0 },
      { name: "admin_approved", defaultValue: 0 },
      { name: "is_demo", defaultValue: 0 },
      { name: "deleted_at" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "barber_subscriptions", [
      { name: "id" },
      { name: "barber_id" },
      { name: "tier", defaultValue: "PLUS" },
      { name: "price", defaultValue: 0 },
      { name: "status", defaultValue: "active" },
      { name: "payment_reference", defaultValue: "" },
      { name: "provider", defaultValue: "internal" },
      { name: "started_at" },
      { name: "expires_at" },
      { name: "activated_at" },
      { name: "billing_cycle", defaultValue: "monthly" },
      { name: "amount_paid", defaultValue: 0 },
      { name: "currency", defaultValue: "UGX" },
      { name: "payment_status", defaultValue: "pending" },
      { name: "trial_status" },
      { name: "is_active", defaultValue: 0 },
      { name: "created_at" },
      { name: "updated_at" },
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
      { name: "payment_reference", defaultValue: "" },
      { name: "payment_provider", defaultValue: "" },
      { name: "payment_customer_phone", defaultValue: "" },
      { name: "commission_amount", defaultValue: 0 },
      { name: "barber_amount", defaultValue: 0 },
      { name: "paid_at" },
      { name: "team_member_id" },
      { name: "booking_location_type", defaultValue: "provider_location" },
      { name: "booking_address", defaultValue: "" },
      { name: "booking_details_json", defaultValue: "{}" },
      { name: "cancelled_by" },
      { name: "cancellation_reason", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "customer_subscriptions", [
      { name: "id" },
      { name: "user_id" },
      { name: "tier", defaultValue: "PREMIUM" },
      { name: "price", defaultValue: 0 },
      { name: "status", defaultValue: "pending" },
      { name: "billing_cycle", defaultValue: "monthly" },
      { name: "amount_paid", defaultValue: 0 },
      { name: "currency", defaultValue: "UGX" },
      { name: "payment_status", defaultValue: "pending" },
      { name: "payment_reference", defaultValue: "" },
      { name: "provider", defaultValue: "internal" },
      { name: "started_at" },
      { name: "expires_at" },
      { name: "activated_at" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "wallets", [
      { name: "id" },
      { name: "user_id" },
      { name: "balance", defaultValue: 0 },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "wallet_transactions", [
      { name: "id" },
      { name: "wallet_id" },
      { name: "booking_id" },
      { name: "direction" },
      { name: "amount", defaultValue: 0 },
      { name: "type" },
      { name: "note", defaultValue: "" },
      { name: "payment_transaction_id" },
      { name: "payout_request_id" },
      { name: "transaction_type", defaultValue: "legacy" },
      { name: "entry_type", defaultValue: "posted" },
      { name: "reference", defaultValue: "" },
      { name: "provider_reference", defaultValue: "" },
      { name: "metadata", defaultValue: "{}" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "wallet_topups", [
      { name: "id" },
      { name: "user_id" },
      { name: "wallet_id" },
      { name: "amount", defaultValue: 0 },
      { name: "method" },
      { name: "provider", defaultValue: "flutterwave" },
      { name: "reference" },
      { name: "status", defaultValue: "pending" },
      { name: "provider_reference", defaultValue: "" },
      { name: "payment_url", defaultValue: "" },
      { name: "idempotency_key", defaultValue: "" },
      { name: "wallet_credited", defaultValue: 0 },
      { name: "credited_at" },
      { name: "mtn_reference", defaultValue: "" },
      { name: "external_transaction_id", defaultValue: "" },
      { name: "last_status_checked_at" },
      { name: "error_message", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "withdrawal_requests", [
      { name: "id" },
      { name: "user_id" },
      { name: "wallet_id" },
      { name: "amount", defaultValue: 0 },
      { name: "status", defaultValue: "pending" },
      { name: "note", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "barber_wallets", [
      { name: "id" },
      { name: "barber_id" },
      { name: "pending_balance", defaultValue: 0 },
      { name: "available_balance", defaultValue: 0 },
      { name: "locked_balance", defaultValue: 0 },
      { name: "total_earned", defaultValue: 0 },
      { name: "withdrawn_total", defaultValue: 0 },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "payout_requests", [
      { name: "id" },
      { name: "barber_id" },
      { name: "wallet_id" },
      { name: "amount", defaultValue: 0 },
      { name: "mobile_money_number", defaultValue: "" },
      { name: "provider", defaultValue: "mtn_mobile_money" },
      { name: "reference" },
      { name: "provider_reference", defaultValue: "" },
      { name: "status", defaultValue: "pending" },
      { name: "idempotency_key", defaultValue: "" },
      { name: "note", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "payouts", [
      { name: "id" },
      { name: "barber_id" },
      { name: "wallet_id" },
      { name: "amount", defaultValue: 0 },
      { name: "mobile_money_number", defaultValue: "" },
      { name: "provider", defaultValue: "mtn_mobile_money" },
      { name: "internal_reference" },
      { name: "provider_reference", defaultValue: "" },
      { name: "status", defaultValue: "pending" },
      { name: "idempotency_key", defaultValue: "" },
      { name: "metadata", defaultValue: "{}" },
      { name: "note", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "payments", [
      { name: "id" },
      { name: "booking_id" },
      { name: "barber_id" },
      { name: "user_id" },
      { name: "flow_type", defaultValue: "booking" },
      { name: "provider", defaultValue: "internal" },
      { name: "internal_reference" },
      { name: "provider_reference", defaultValue: "" },
      { name: "callback_url", defaultValue: "" },
      { name: "idempotency_key", defaultValue: "" },
      { name: "payer_phone", defaultValue: "" },
      { name: "payee_phone", defaultValue: "" },
      { name: "gross_amount", defaultValue: 0 },
      { name: "commission_amount", defaultValue: 0 },
      { name: "barber_amount", defaultValue: 0 },
      { name: "currency", defaultValue: "UGX" },
      { name: "status", defaultValue: "pending" },
      { name: "metadata", defaultValue: "{}" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "payment_transactions", [
      { name: "id" },
      { name: "booking_id" },
      { name: "barber_id" },
      { name: "user_id" },
      { name: "subscription_id" },
      { name: "customer_subscription_id" },
      { name: "transaction_type", defaultValue: "booking_payment" },
      { name: "provider", defaultValue: "internal" },
      { name: "internal_reference" },
      { name: "provider_reference", defaultValue: "" },
      { name: "idempotency_key", defaultValue: "" },
      { name: "payer_phone", defaultValue: "" },
      { name: "payee_phone", defaultValue: "" },
      { name: "gross_amount", defaultValue: 0 },
      { name: "commission_amount", defaultValue: 0 },
      { name: "net_amount", defaultValue: 0 },
      { name: "currency", defaultValue: "UGX" },
      { name: "status", defaultValue: "pending" },
      { name: "metadata", defaultValue: "{}" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(sqlite, "wallet_ledger", [
      { name: "id" },
      { name: "owner_type" },
      { name: "owner_id" },
      { name: "wallet_id" },
      { name: "booking_id" },
      { name: "payment_id" },
      { name: "payout_id" },
      { name: "direction" },
      { name: "balance_bucket" },
      { name: "amount", defaultValue: 0 },
      { name: "reference", defaultValue: "" },
      { name: "provider_reference", defaultValue: "" },
      { name: "description", defaultValue: "" },
      { name: "metadata", defaultValue: "{}" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "webhook_events", [
      { name: "id" },
      { name: "provider" },
      { name: "event_type", defaultValue: "payment_callback" },
      { name: "reference", defaultValue: "" },
      { name: "provider_reference", defaultValue: "" },
      { name: "signature", defaultValue: "" },
      { name: "payload", defaultValue: "{}" },
      { name: "processing_status", defaultValue: "received" },
      { name: "processed_at" },
      { name: "created_at" },
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
      { name: "blocked_from_public", defaultValue: 0 },
      { name: "blocked_by_user_id", defaultValue: null },
      { name: "blocked_at", defaultValue: null },
      { name: "block_reason", defaultValue: "" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "support_requests", [
      { name: "id" },
      { name: "user_id" },
      { name: "topic", defaultValue: "Contact Support" },
      { name: "name", defaultValue: "" },
      { name: "contact" },
      { name: "booking_reference", defaultValue: "" },
      { name: "message" },
      { name: "status", defaultValue: "open" },
      { name: "admin_notes", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
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

    await importTable(sqlite, "notification_tokens", [
      { name: "id" },
      { name: "user_id" },
      { name: "token" },
      { name: "platform", defaultValue: "web" },
      { name: "browser", defaultValue: "" },
      { name: "device_label", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
      { name: "last_used_at" },
    ]);

    await importTable(sqlite, "audit_logs", [
      { name: "id" },
      { name: "user_id" },
      { name: "action" },
      { name: "created_at" },
    ]);

    await importTable(sqlite, "admin_audit_log", [
      { name: "id" },
      { name: "admin_user_id" },
      { name: "admin_username", defaultValue: "" },
      { name: "action_type" },
      { name: "target_type" },
      { name: "target_id", defaultValue: "" },
      { name: "old_value", defaultValue: "{}" },
      { name: "new_value", defaultValue: "{}" },
      { name: "reason", defaultValue: "" },
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
