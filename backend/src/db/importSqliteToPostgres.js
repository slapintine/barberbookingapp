import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import { env } from "../config/env.js";
import { migratePostgres } from "./migratePostgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");
const IMPORT_CONFIRMATION = "I_HAVE_BACKUPS_AND_TARGET_IS_PREPARED";
const PROTECTED_TARGET_TABLES = [
  "users",
  "profiles",
  "barbers",
  "barber_subscriptions",
  "bookings",
  "customer_subscriptions",
  "wallets",
  "wallet_transactions",
  "wallet_topups",
  "withdrawal_requests",
  "barber_wallets",
  "payout_requests",
  "payouts",
  "payments",
  "payment_transactions",
  "wallet_ledger",
  "webhook_events",
  "booking_events",
  "favorites",
  "reviews",
  "support_requests",
  "messages",
  "notifications",
  "notification_tokens",
  "audit_logs",
  "admin_audit_log",
  "subscription_events",
  "quote_requests",
  "otp_codes",
  "sms_messages",
  "push_subscriptions",
];

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

async function insertRows(pgClient, tableName, rows, columns, conflictSql = "ON CONFLICT (id) DO NOTHING") {
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
    const result = await pgClient.query(sql, values);
    imported += result.rowCount;
  }

  return imported;
}

async function resetIdentity(pgClient, tableName) {
  await pgClient.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${tableName}), 1), true)`,
    [tableName]
  );
}

async function importTable(pgClient, sqlite, tableName, columns, conflictSql) {
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
  const imported = await insertRows(pgClient, tableName, normalized, columns, conflictSql);
  await resetIdentity(pgClient, tableName);
  console.log(`${tableName}: imported ${imported}, skipped ${rows.length - imported}`);
}

async function countSqliteRows(sqlite, tableName) {
  if (!(await sqliteTableExists(sqlite, tableName))) return 0;
  const rows = await sqliteAll(sqlite, `SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(rows[0]?.count || 0);
}

async function assertPreparedImportTarget(pgClient) {
  const confirmation = String(process.env.IMPORT_SQLITE_TO_POSTGRES_CONFIRM || "").trim();
  if (confirmation !== IMPORT_CONFIRMATION) {
    throw new Error(
      `Refusing SQLite import without IMPORT_SQLITE_TO_POSTGRES_CONFIRM=${IMPORT_CONFIRMATION}. Back up SQLite and PostgreSQL first.`
    );
  }

  const allowNonEmpty = String(process.env.IMPORT_SQLITE_ALLOW_NON_EMPTY_POSTGRES || "").trim().toLowerCase() === "true";
  if (allowNonEmpty) return;

  const counts = [];
  for (const tableName of PROTECTED_TARGET_TABLES) {
    const exists = await pgClient.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
    if (!exists.rows?.[0]?.table_name) continue;

    const result = await pgClient.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    const count = Number(result.rows?.[0]?.count || 0);
    if (count > 0) counts.push(`${tableName}=${count}`);
  }

  if (counts.length) {
    throw new Error(
      `Refusing to import into a non-empty PostgreSQL database (${counts.join(", ")}). Use a fresh/prepared target, or set IMPORT_SQLITE_ALLOW_NON_EMPTY_POSTGRES=true only after manually verifying the target is safe.`
    );
  }
}

async function assertImportSource(sqlite) {
  const users = await countSqliteRows(sqlite, "users");
  if (users === 0) {
    throw new Error("Refusing to import from a SQLite database with zero users. Check DB_PATH before continuing.");
  }
}

async function main() {
  if (db.client !== "postgres") {
    throw new Error("Set DB_CLIENT=postgres before importing SQLite data.");
  }

  process.env.SQLITE_IMPORT_IN_PROGRESS = "true";
  await migratePostgres();

  const sqlitePath = path.resolve(projectRoot, env.dbPath);
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database not found at ${sqlitePath}`);
  }

  const sqlite = new sqlite3.Database(sqlitePath);
  const pgClient = await db.pool.connect();

  try {
    await assertImportSource(sqlite);
    await assertPreparedImportTarget(pgClient);

    await pgClient.query("BEGIN");

    await importTable(pgClient, sqlite, "users", [
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

    await importTable(pgClient, sqlite, "profiles", [
      { name: "id" },
      { name: "user_id" },
      { name: "full_name", defaultValue: "" },
      { name: "phone", defaultValue: "" },
      { name: "email", defaultValue: "" },
      { name: "address", defaultValue: "" },
      { name: "profile_photo", defaultValue: "" },
    ]);

    await importTable(pgClient, sqlite, "barbers", [
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

    await importTable(pgClient, sqlite, "barber_subscriptions", [
      { name: "id" },
      { name: "barber_id" },
      { name: "tier", defaultValue: "FREE" },
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

    await importTable(pgClient, sqlite, "barber_services", [
      { name: "id" },
      { name: "barber_id" },
      { name: "service_name" },
      { name: "category", defaultValue: "" },
      { name: "price_extra", defaultValue: 0 },
      { name: "pricing_type", defaultValue: "fixed" },
      { name: "min_price" },
      { name: "max_price" },
      { name: "starting_price" },
      { name: "duration_minutes", defaultValue: 30 },
      { name: "location_type", defaultValue: "provider_location" },
      { name: "description", defaultValue: "" },
      { name: "is_available", defaultValue: 1 },
      { name: "is_featured", defaultValue: 0 },
      { name: "image", defaultValue: "" },
    ]);

    await importTable(pgClient, sqlite, "barber_team_members", [
      { name: "id" },
      { name: "barber_id" },
      { name: "name" },
      { name: "title", defaultValue: "Barber" },
      { name: "bio", defaultValue: "" },
      { name: "image", defaultValue: "" },
      { name: "specialties", defaultValue: "" },
      { name: "is_active", defaultValue: 1 },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(pgClient, sqlite, "barber_schedule", [
      { name: "id" },
      { name: "barber_id" },
      { name: "day_of_week" },
      { name: "is_open", defaultValue: 1 },
      { name: "start_time", defaultValue: "08:00" },
      { name: "end_time", defaultValue: "20:00" },
      { name: "break_start" },
      { name: "break_end" },
    ]);

    await importTable(pgClient, sqlite, "bookings", [
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

    await importTable(pgClient, sqlite, "customer_subscriptions", [
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

    await importTable(pgClient, sqlite, "wallets", [
      { name: "id" },
      { name: "user_id" },
      { name: "balance", defaultValue: 0 },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(pgClient, sqlite, "wallet_transactions", [
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

    await importTable(pgClient, sqlite, "wallet_topups", [
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

    await importTable(pgClient, sqlite, "withdrawal_requests", [
      { name: "id" },
      { name: "user_id" },
      { name: "wallet_id" },
      { name: "amount", defaultValue: 0 },
      { name: "status", defaultValue: "pending" },
      { name: "note", defaultValue: "" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(pgClient, sqlite, "barber_wallets", [
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

    await importTable(pgClient, sqlite, "payout_requests", [
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

    await importTable(pgClient, sqlite, "payouts", [
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

    await importTable(pgClient, sqlite, "payments", [
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

    await importTable(pgClient, sqlite, "payment_transactions", [
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

    await importTable(pgClient, sqlite, "wallet_ledger", [
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

    await importTable(pgClient, sqlite, "webhook_events", [
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

    await importTable(pgClient, sqlite, "booking_events", [
      { name: "id" },
      { name: "booking_id" },
      { name: "actor_user_id" },
      { name: "event_type" },
      { name: "event_note", defaultValue: "" },
      { name: "created_at" },
    ]);

    await importTable(pgClient, sqlite, "favorites", [
      { name: "id" },
      { name: "user_id" },
      { name: "barber_id" },
      { name: "created_at" },
    ]);

    await importTable(pgClient, sqlite, "reviews", [
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

    await importTable(pgClient, sqlite, "support_requests", [
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

    await importTable(pgClient, sqlite, "messages", [
      { name: "id" },
      { name: "barber_id" },
      { name: "customer_user_id" },
      { name: "sender_user_id" },
      { name: "text" },
      { name: "seen", defaultValue: 0 },
      { name: "created_at" },
    ]);

    await importTable(pgClient, sqlite, "notifications", [
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

    await importTable(pgClient, sqlite, "notification_tokens", [
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

    await importTable(pgClient, sqlite, "audit_logs", [
      { name: "id" },
      { name: "user_id" },
      { name: "action" },
      { name: "created_at" },
    ]);

    await importTable(pgClient, sqlite, "admin_audit_log", [
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

    await importTable(pgClient, sqlite, "subscription_events", [
      { name: "id" },
      { name: "user_id" },
      { name: "business_id" },
      { name: "event_type" },
      { name: "plan_id" },
      { name: "status" },
      { name: "metadata", defaultValue: "{}" },
      { name: "created_at" },
    ]);

    await importTable(pgClient, sqlite, "quote_requests", [
      { name: "id" },
      { name: "customer_id" },
      { name: "provider_id" },
      { name: "service_id" },
      { name: "description" },
      { name: "budget" },
      { name: "preferred_date" },
      { name: "location", defaultValue: "" },
      { name: "status", defaultValue: "pending" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(pgClient, sqlite, "otp_codes", [
      { name: "id" },
      { name: "user_id" },
      { name: "channel" },
      { name: "destination" },
      { name: "purpose", defaultValue: "account_verification" },
      { name: "code_hash" },
      { name: "attempts", defaultValue: 0 },
      { name: "max_attempts", defaultValue: 5 },
      { name: "expires_at" },
      { name: "verified_at" },
      { name: "used_at" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(pgClient, sqlite, "sms_messages", [
      { name: "id" },
      { name: "direction" },
      { name: "provider", defaultValue: "africastalking" },
      { name: "provider_message_id", defaultValue: "" },
      { name: "from_number", defaultValue: "" },
      { name: "to_number", defaultValue: "" },
      { name: "phone_number", defaultValue: "" },
      { name: "message", defaultValue: "" },
      { name: "status", defaultValue: "received" },
      { name: "user_id" },
      { name: "business_id" },
      { name: "booking_id" },
      { name: "payment_id" },
      { name: "subscription_id" },
      { name: "raw_payload", defaultValue: "{}" },
      { name: "dedupe_key", defaultValue: "" },
      { name: "error_message", defaultValue: "" },
      { name: "sent_at" },
      { name: "received_at" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);

    await importTable(pgClient, sqlite, "push_subscriptions", [
      { name: "id" },
      { name: "username" },
      { name: "subscription" },
      { name: "created_at" },
    ]);

    await pgClient.query("COMMIT");
    console.log("SQLite import complete.");
  } catch (error) {
    await pgClient.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    pgClient.release();
    await sqliteClose(sqlite);
    await db.close?.();
  }
}

main().catch((error) => {
  console.error("SQLite import failed:", error);
  process.exit(1);
});
