import db from "../config/db.js";
import { migratePostgres } from "./migratePostgres.js";
import { logger } from "../config/logger.js";

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function tableExists(tableName) {
  const rows = await all(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function getTableColumns(tableName) {
  const rows = await all(`PRAGMA table_info(${tableName})`);
  return rows.map((row) => row.name);
}

async function addColumnIfMissing(tableName, columnName, columnSql) {
  const exists = await tableExists(tableName);
  if (!exists) return;

  const columns = await getTableColumns(tableName);
  if (!columns.includes(columnName)) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
    logger.info({ tableName, columnName }, "Added missing column");
  }
}

async function createIndexes() {
  await run(`CREATE INDEX IF NOT EXISTS idx_bookings_barber_id ON bookings(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_bookings_customer_user_id ON bookings(customer_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_bookings_barber_date ON bookings(barber_id, booking_date)`);
  await run(`DROP INDEX IF EXISTS uniq_active_booking_slot`);
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_booking_slot_member
    ON bookings(barber_id, booking_date, booking_time, COALESCE(team_member_id, 0))
    WHERE status IN ('payment_pending','pending','confirmed')
  `);
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_customer_barber_booking
    ON bookings(customer_user_id, barber_id)
    WHERE status IN ('payment_pending','pending','confirmed')
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_reviews_barber_id ON reviews(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_reviews_blocked ON reviews(barber_id, blocked_from_public)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_quote_requests_customer_id ON quote_requests(customer_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_quote_requests_provider_id ON quote_requests(provider_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_support_requests_user_id ON support_requests(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status, created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_messages_barber_id ON messages(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_messages_customer_user_id ON messages(customer_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notifications_thread_message ON notifications(user_id, type, barber_id, customer_user_id, read)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_tokens_token ON notification_tokens(token)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notification_tokens_user_id ON notification_tokens(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barber_schedule_barber_day ON barber_schedule(barber_id, day_of_week)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barber_team_members_barber_id ON barber_team_members(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON booking_events(booking_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_booking_id ON wallet_transactions(booking_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet_id ON withdrawal_requests(wallet_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_otp_codes_user_channel ON otp_codes(user_id, channel, purpose)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_topups_reference ON wallet_topups(reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_topups_user_idempotency ON wallet_topups(user_id, idempotency_key)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barbers_subscription_tier ON barbers(subscription_tier, subscription_status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barbers_public_status ON barbers(business_status, is_published, subscription_tier)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barbers_normalized_business_name ON barbers(normalized_business_name)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barbers_verified_status ON barbers(verified_status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barbers_verification_submitted_at ON barbers(verification_submitted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barber_wallets_barber_id ON barber_wallets(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id ON payment_transactions(booking_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(internal_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_reference ON payment_transactions(provider_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_idempotency ON payment_transactions(idempotency_key)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_subscription_id ON payment_transactions(customer_subscription_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(internal_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(user_id, idempotency_key)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_ledger_owner ON wallet_ledger(owner_type, owner_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_ledger_payment ON wallet_ledger(payment_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_ledger_booking ON wallet_ledger(booking_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payouts_barber_id ON payouts(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payouts_wallet_id ON payouts(wallet_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payouts_idempotency ON payouts(barber_id, idempotency_key)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_webhook_events_reference ON webhook_events(reference, provider_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, event_type)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payment_id ON wallet_transactions(payment_transaction_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payout_id ON wallet_transactions(payout_request_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payout_requests_barber_id ON payout_requests(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payout_requests_wallet_id ON payout_requests(wallet_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payout_requests_idempotency ON payout_requests(barber_id, idempotency_key)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_barber_subscriptions_barber_id ON barber_subscriptions(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_id ON sms_messages(provider_message_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sms_messages_dedupe ON sms_messages(dedupe_key)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_messages_outgoing_dedupe ON sms_messages(dedupe_key) WHERE direction = 'outgoing' AND dedupe_key <> ''`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sms_messages_phone ON sms_messages(phone_number)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_status ON customer_subscriptions(user_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action_type, target_type, created_at)`);
  await run(`DROP TRIGGER IF EXISTS reject_invalid_active_barber_insert`);
  await run(`DROP TRIGGER IF EXISTS reject_invalid_active_barber_update`);
  await run(`
    CREATE TRIGGER reject_invalid_active_barber_insert
    BEFORE INSERT ON barbers
    WHEN NEW.business_status IN ('active', 'approved', 'live')
      AND (
        NEW.subscription_tier NOT IN ('PLUS', 'PREMIUM', 'PLATINUM')
        OR NOT (
          (
            NEW.subscription_status = 'active'
            AND NEW.subscription_expires_at IS NOT NULL
            AND NEW.subscription_expires_at > datetime('now')
          )
          OR (
            NEW.subscription_status IN ('manual_approved', 'admin_approved', 'approved')
            OR COALESCE(NEW.admin_approved, 0) = 1
          )
          OR (
            NEW.subscription_status = 'trialing'
            AND
            NEW.trial_status = 'active'
            AND NEW.trial_ends_at IS NOT NULL
            AND NEW.trial_ends_at > datetime('now')
          )
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'Public businesses require a valid plan, active trial, or admin approval');
    END
  `);
  await run(`
    CREATE TRIGGER reject_invalid_active_barber_update
    BEFORE UPDATE ON barbers
    WHEN NEW.business_status IN ('active', 'approved', 'live')
      AND (
        NEW.subscription_tier NOT IN ('PLUS', 'PREMIUM', 'PLATINUM')
        OR NOT (
          (
            NEW.subscription_status = 'active'
            AND NEW.subscription_expires_at IS NOT NULL
            AND NEW.subscription_expires_at > datetime('now')
          )
          OR (
            NEW.subscription_status IN ('manual_approved', 'admin_approved', 'approved')
            OR COALESCE(NEW.admin_approved, 0) = 1
          )
          OR (
            NEW.subscription_status = 'trialing'
            AND
            NEW.trial_status = 'active'
            AND NEW.trial_ends_at IS NOT NULL
            AND NEW.trial_ends_at > datetime('now')
          )
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'Public businesses require a valid plan, active trial, or admin approval');
    END
  `);
}

async function migrateExistingSchema() {
  await addColumnIfMissing(
    "barbers",
    "image",
    `image TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "verification_document_name",
    `verification_document_name TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "verification_document_url",
    `verification_document_url TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "verification_notes",
    `verification_notes TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "verification_submitted_at",
    `verification_submitted_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "verification_reviewed_at",
    `verification_reviewed_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "verification_reviewed_by",
    `verification_reviewed_by INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "availability_start",
    `availability_start TEXT DEFAULT '08:00'`
  );
  await addColumnIfMissing(
    "barbers",
    "availability_end",
    `availability_end TEXT DEFAULT '20:00'`
  );
  await addColumnIfMissing(
    "barbers",
    "accepts_wallet",
    `accepts_wallet INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barbers",
    "accepts_cash",
    `accepts_cash INTEGER NOT NULL DEFAULT 1`
  );
  await addColumnIfMissing(
    "barbers",
    "stand_type",
    `stand_type TEXT NOT NULL DEFAULT 'individual'`
  );
  await addColumnIfMissing(
    "barbers",
    "business_type",
    `business_type TEXT NOT NULL DEFAULT 'barber'`
  );
  await addColumnIfMissing(
    "barbers",
    "map_icon_type",
    `map_icon_type TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "home_service_enabled",
    `home_service_enabled INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barbers",
    "intro_text",
    `intro_text TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "portfolio_json",
    `portfolio_json TEXT DEFAULT '[]'`
  );
  await addColumnIfMissing(
    "barbers",
    "subscription_tier",
    `subscription_tier TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "subscription_status",
    `subscription_status TEXT NOT NULL DEFAULT 'none'`
  );
  await addColumnIfMissing(
    "barbers",
    "subscription_expires_at",
    `subscription_expires_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "business_status",
    `business_status TEXT NOT NULL DEFAULT 'pending_subscription'`
  );
  await addColumnIfMissing(
    "barbers",
    "is_published",
    `is_published INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barbers",
    "admin_approved",
    `admin_approved INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barbers",
    "is_demo",
    `is_demo INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barbers",
    "normalized_business_name",
    `normalized_business_name TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barbers",
    "trial_plan",
    `trial_plan TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "trial_started_at",
    `trial_started_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "trial_ends_at",
    `trial_ends_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "trial_status",
    `trial_status TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "used_trials",
    `used_trials TEXT DEFAULT '[]'`
  );
  await addColumnIfMissing(
    "barbers",
    "trial_used",
    `trial_used INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barbers",
    "featured_until",
    `featured_until TEXT DEFAULT NULL`
  );
  await run(`UPDATE barbers SET accepts_cash = 1 WHERE accepts_cash IS NULL OR accepts_cash = 0`);

  await run(`
    UPDATE barbers
    SET normalized_business_name = LOWER(TRIM(business_name))
    WHERE normalized_business_name IS NULL OR TRIM(normalized_business_name) = ''
  `);
  await run(`
    UPDATE barbers
    SET business_status = 'pending_subscription',
        is_published = 0,
        subscription_tier = 'NONE',
        subscription_status = 'none',
        subscription_expires_at = NULL,
        trial_plan = NULL,
        trial_started_at = NULL,
        trial_ends_at = NULL,
        trial_status = NULL
    WHERE subscription_tier IS NULL
       OR TRIM(subscription_tier) = ''
       OR UPPER(subscription_tier) = 'UNKNOWN'
       OR subscription_status IS NULL
       OR TRIM(subscription_status) = ''
       OR UPPER(subscription_status) = 'UNKNOWN'
  `);
  await run(`
    UPDATE barbers
    SET business_status = 'pending_subscription',
        is_published = 0,
        subscription_tier = 'NONE',
        subscription_status = 'none',
        subscription_expires_at = NULL,
        trial_plan = NULL,
        trial_started_at = NULL,
        trial_ends_at = NULL,
        trial_status = NULL
    WHERE COALESCE(is_demo, 0) = 1
       OR (
         COALESCE(is_published, 0) = 1
         AND NOT (
           business_status IN ('active', 'approved', 'live')
           AND subscription_tier IN ('PLUS', 'PREMIUM', 'PLATINUM')
           AND (
             EXISTS (
               SELECT 1
               FROM barber_subscriptions public_bs
               WHERE public_bs.barber_id = barbers.id
                 AND public_bs.tier IN ('PLUS', 'PREMIUM', 'PLATINUM')
                 AND LOWER(COALESCE(public_bs.status, '')) = 'active'
                 AND public_bs.expires_at IS NOT NULL
                 AND public_bs.expires_at > datetime('now')
             )
             OR COALESCE(admin_approved, 0) = 1
             OR LOWER(COALESCE(subscription_status, '')) IN ('approved', 'manual_approved', 'admin_approved')
             OR (
               LOWER(COALESCE(subscription_status, '')) = 'active'
               AND subscription_expires_at IS NOT NULL
               AND subscription_expires_at > datetime('now')
             )
             OR (
               LOWER(COALESCE(subscription_status, '')) = 'trialing'
               AND
               LOWER(COALESCE(trial_status, '')) = 'active'
               AND trial_ends_at IS NOT NULL
               AND trial_ends_at > datetime('now')
             )
           )
         )
       )
  `);
  await run(`
    UPDATE barbers
    SET business_status = 'pending_subscription',
        is_published = 0,
        subscription_tier = 'NONE',
        subscription_status = 'none',
        subscription_expires_at = NULL,
        trial_plan = NULL,
        trial_started_at = NULL,
        trial_ends_at = NULL,
        trial_status = NULL
    WHERE LOWER(COALESCE(subscription_status, '')) = 'trialing'
      AND NOT EXISTS (
        SELECT 1
        FROM barber_subscriptions bs
        WHERE bs.barber_id = barbers.id
          AND LOWER(COALESCE(bs.provider, '')) = 'trial'
          AND LOWER(COALESCE(bs.status, '')) = 'trialing'
      )
  `);

  await addColumnIfMissing(
    "barber_services",
    "duration_minutes",
    `duration_minutes INTEGER NOT NULL DEFAULT 30`
  );
  await addColumnIfMissing(
    "barber_services",
    "pricing_type",
    `pricing_type TEXT NOT NULL DEFAULT 'fixed'`
  );
  await addColumnIfMissing(
    "barber_services",
    "location_type",
    `location_type TEXT NOT NULL DEFAULT 'provider_location'`
  );
  await addColumnIfMissing(
    "barber_services",
    "is_featured",
    `is_featured INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barber_services",
    "category",
    `category TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barber_services",
    "description",
    `description TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barber_services",
    "is_available",
    `is_available INTEGER NOT NULL DEFAULT 1`
  );
  await addColumnIfMissing(
    "barber_services",
    "image",
    `image TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "barber_services",
    "min_price",
    `min_price REAL DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barber_services",
    "max_price",
    `max_price REAL DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barber_services",
    "starting_price",
    `starting_price REAL DEFAULT NULL`
  );

  await addColumnIfMissing(
    "bookings",
    "service_duration_minutes",
    `service_duration_minutes INTEGER NOT NULL DEFAULT 30`
  );
  await addColumnIfMissing(
    "bookings",
    "cancelled_by",
    `cancelled_by TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "bookings",
    "cancellation_reason",
    `cancellation_reason TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "bookings",
    "updated_at",
    `updated_at TEXT DEFAULT CURRENT_TIMESTAMP`
  );
  await addColumnIfMissing(
    "bookings",
    "payment_method",
    `payment_method TEXT NOT NULL DEFAULT 'cash'`
  );
  await addColumnIfMissing(
    "bookings",
    "payment_status",
    `payment_status TEXT NOT NULL DEFAULT 'unpaid'`
  );
  await addColumnIfMissing(
    "bookings",
    "paid_at",
    `paid_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "bookings",
    "team_member_id",
    `team_member_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "bookings",
    "payment_reference",
    `payment_reference TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "bookings",
    "payment_provider",
    `payment_provider TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "bookings",
    "payment_customer_phone",
    `payment_customer_phone TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "bookings",
    "commission_amount",
    `commission_amount REAL NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "bookings",
    "barber_amount",
    `barber_amount REAL NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "bookings",
    "booking_location_type",
    `booking_location_type TEXT NOT NULL DEFAULT 'provider_location'`
  );
  await addColumnIfMissing(
    "bookings",
    "booking_address",
    `booking_address TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "bookings",
    "booking_details_json",
    `booking_details_json TEXT DEFAULT '{}'`
  );

  await addColumnIfMissing(
    "notifications",
    "title",
    `title TEXT DEFAULT 'Notification'`
  );
  await addColumnIfMissing(
    "notifications",
    "type",
    `type TEXT DEFAULT 'system'`
  );
  await addColumnIfMissing(
    "notifications",
    "barber_id",
    `barber_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "notifications",
    "customer_user_id",
    `customer_user_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "notifications",
    "customer_username",
    `customer_username TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "notifications",
    "barber_owner_username",
    `barber_owner_username TEXT DEFAULT ''`
  );

  await addColumnIfMissing(
    "wallet_topups",
    "idempotency_key",
    `idempotency_key TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "wallet_topups",
    "wallet_credited",
    `wallet_credited INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "wallet_topups",
    "credited_at",
    `credited_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "wallet_topups",
    "mtn_reference",
    `mtn_reference TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "wallet_topups",
    "external_transaction_id",
    `external_transaction_id TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "wallet_topups",
    "last_status_checked_at",
    `last_status_checked_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "wallet_topups",
    "error_message",
    `error_message TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "otp_codes",
    "used_at",
    `used_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "otp_codes",
    "updated_at",
    `updated_at TEXT DEFAULT CURRENT_TIMESTAMP`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "booking_id",
    `booking_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "barber_id",
    `barber_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "user_id",
    `user_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "subscription_id",
    `subscription_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "customer_subscription_id",
    `customer_subscription_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "transaction_type",
    `transaction_type TEXT NOT NULL DEFAULT 'booking_payment'`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "internal_reference",
    `internal_reference TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "payer_phone",
    `payer_phone TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "payee_phone",
    `payee_phone TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "gross_amount",
    `gross_amount REAL NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "commission_amount",
    `commission_amount REAL NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "net_amount",
    `net_amount REAL NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "currency",
    `currency TEXT NOT NULL DEFAULT 'UGX'`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "metadata",
    `metadata TEXT DEFAULT '{}'`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "idempotency_key",
    `idempotency_key TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "payment_transactions",
    "updated_at",
    `updated_at TEXT DEFAULT CURRENT_TIMESTAMP`
  );
  await addColumnIfMissing(
    "barber_subscriptions",
    "billing_cycle",
    `billing_cycle TEXT NOT NULL DEFAULT 'monthly'`
  );
  await addColumnIfMissing(
    "barber_subscriptions",
    "amount_paid",
    `amount_paid REAL NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "barber_subscriptions",
    "currency",
    `currency TEXT NOT NULL DEFAULT 'UGX'`
  );
  await addColumnIfMissing(
    "barber_subscriptions",
    "payment_status",
    `payment_status TEXT NOT NULL DEFAULT 'pending'`
  );
  await addColumnIfMissing(
    "barber_subscriptions",
    "trial_status",
    `trial_status TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barber_subscriptions",
    "is_active",
    `is_active INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "reviews",
    "blocked_from_public",
    `blocked_from_public INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "reviews",
    "blocked_by_user_id",
    `blocked_by_user_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "reviews",
    "blocked_at",
    `blocked_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "reviews",
    "block_reason",
    `block_reason TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "payment_transaction_id",
    `payment_transaction_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "payout_request_id",
    `payout_request_id INTEGER DEFAULT NULL`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "transaction_type",
    `transaction_type TEXT DEFAULT 'legacy'`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "entry_type",
    `entry_type TEXT DEFAULT 'posted'`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "reference",
    `reference TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "provider_reference",
    `provider_reference TEXT DEFAULT ''`
  );
  await addColumnIfMissing(
    "wallet_transactions",
    "metadata",
    `metadata TEXT DEFAULT '{}'`
  );

  await run(`UPDATE barbers SET subscription_tier = 'PLUS' WHERE COALESCE(TRIM(subscription_tier), '') <> '' AND UPPER(subscription_tier) NOT IN ('PLUS', 'PREMIUM', 'PLATINUM')`).catch(() => {});
  await run(`UPDATE barber_subscriptions SET tier = 'PLUS' WHERE COALESCE(TRIM(tier), '') <> '' AND UPPER(tier) NOT IN ('PLUS', 'PREMIUM', 'PLATINUM')`).catch(() => {});
}

export async function initDb() {
  try {
    if (db.client === "postgres") {
      await migratePostgres();
      logger.info("PostgreSQL migrations are ready");
      return;
    }

    await run("PRAGMA foreign_keys = ON");

    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        account_status TEXT NOT NULL DEFAULT 'active',
        email_verified_at TEXT DEFAULT NULL,
        email_verification_code_hash TEXT DEFAULT '',
        email_verification_expires_at TEXT DEFAULT NULL,
        last_email_code_sent_at TEXT DEFAULT NULL,
        disabled_at TEXT DEFAULT NULL,
        blocked_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfMissing("users", "account_status", `account_status TEXT NOT NULL DEFAULT 'active'`);
    await addColumnIfMissing("users", "email_verified_at", `email_verified_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("users", "email_verification_code_hash", `email_verification_code_hash TEXT DEFAULT ''`);
    await addColumnIfMissing("users", "email_verification_expires_at", `email_verification_expires_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("users", "last_email_code_sent_at", `last_email_code_sent_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("users", "disabled_at", `disabled_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("users", "blocked_at", `blocked_at TEXT DEFAULT NULL`);

    await run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        full_name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        normalized_email TEXT DEFAULT '',
        normalized_phone TEXT DEFAULT '',
        address TEXT DEFAULT '',
        profile_photo TEXT DEFAULT '',
        trial_used INTEGER NOT NULL DEFAULT 0,
        trial_started_at TEXT DEFAULT NULL,
        trial_ends_at TEXT DEFAULT NULL,
        trial_plan TEXT DEFAULT NULL,
        trial_business_id INTEGER DEFAULT NULL,
        subscription_status TEXT DEFAULT 'none',
        last_trial_attempt_at TEXT DEFAULT NULL,
        selected_plan TEXT DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS barbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id INTEGER NOT NULL UNIQUE,
        business_name TEXT NOT NULL,
        location TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        price_from REAL NOT NULL DEFAULT 0,
        verified_status TEXT NOT NULL DEFAULT 'New',
        verification_document_name TEXT DEFAULT '',
        verification_document_url TEXT DEFAULT '',
        verification_notes TEXT DEFAULT '',
        verification_submitted_at TEXT DEFAULT NULL,
        verification_reviewed_at TEXT DEFAULT NULL,
        verification_reviewed_by INTEGER DEFAULT NULL,
        image TEXT DEFAULT '',
        availability_start TEXT DEFAULT '08:00',
        availability_end TEXT DEFAULT '20:00',
        accepts_wallet INTEGER NOT NULL DEFAULT 0,
        accepts_cash INTEGER NOT NULL DEFAULT 1,
        stand_type TEXT NOT NULL DEFAULT 'individual',
        business_type TEXT NOT NULL DEFAULT 'barber',
        map_icon_type TEXT DEFAULT '',
        home_service_enabled INTEGER NOT NULL DEFAULT 0,
        intro_text TEXT DEFAULT '',
        portfolio_json TEXT DEFAULT '[]',
        subscription_tier TEXT DEFAULT NULL,
        selected_plan TEXT DEFAULT NULL,
        subscription_status TEXT NOT NULL DEFAULT 'none',
        subscription_expires_at TEXT DEFAULT NULL,
        business_status TEXT NOT NULL DEFAULT 'pending_subscription',
        is_published INTEGER NOT NULL DEFAULT 0,
        admin_approved INTEGER NOT NULL DEFAULT 0,
        is_demo INTEGER NOT NULL DEFAULT 0,
        normalized_business_name TEXT DEFAULT '',
        trial_plan TEXT DEFAULT NULL,
        trial_started_at TEXT DEFAULT NULL,
        trial_ends_at TEXT DEFAULT NULL,
        trial_status TEXT DEFAULT NULL,
        used_trials TEXT DEFAULT '[]',
        trial_used INTEGER NOT NULL DEFAULT 0,
        featured_until TEXT DEFAULT NULL,
        deleted_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    for (const [columnName, columnSql] of [
      ["normalized_email", "normalized_email TEXT DEFAULT ''"],
      ["normalized_phone", "normalized_phone TEXT DEFAULT ''"],
      ["trial_used", "trial_used INTEGER NOT NULL DEFAULT 0"],
      ["trial_started_at", "trial_started_at TEXT DEFAULT NULL"],
      ["trial_ends_at", "trial_ends_at TEXT DEFAULT NULL"],
      ["trial_plan", "trial_plan TEXT DEFAULT NULL"],
      ["trial_business_id", "trial_business_id INTEGER DEFAULT NULL"],
      ["subscription_status", "subscription_status TEXT DEFAULT 'none'"],
      ["last_trial_attempt_at", "last_trial_attempt_at TEXT DEFAULT NULL"],
      ["selected_plan", "selected_plan TEXT DEFAULT NULL"],
    ]) {
      await addColumnIfMissing("profiles", columnName, columnSql);
    }

    await addColumnIfMissing("barbers", "selected_plan", `selected_plan TEXT DEFAULT NULL`);
    await addColumnIfMissing("barbers", "deleted_at", `deleted_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("barbers", "map_icon_type", `map_icon_type TEXT DEFAULT ''`);
    await addColumnIfMissing("barbers", "verification_document_name", `verification_document_name TEXT DEFAULT ''`);
    await addColumnIfMissing("barbers", "verification_document_url", `verification_document_url TEXT DEFAULT ''`);
    await addColumnIfMissing("barbers", "verification_notes", `verification_notes TEXT DEFAULT ''`);
    await addColumnIfMissing("barbers", "verification_submitted_at", `verification_submitted_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("barbers", "verification_reviewed_at", `verification_reviewed_at TEXT DEFAULT NULL`);
    await addColumnIfMissing("barbers", "verification_reviewed_by", `verification_reviewed_by INTEGER DEFAULT NULL`);

    await run(`
      CREATE TABLE IF NOT EXISTS barber_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        category TEXT DEFAULT '',
        price_extra REAL NOT NULL DEFAULT 0,
        pricing_type TEXT NOT NULL DEFAULT 'fixed',
        min_price REAL DEFAULT NULL,
        max_price REAL DEFAULT NULL,
        starting_price REAL DEFAULT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 30,
        location_type TEXT NOT NULL DEFAULT 'provider_location',
        description TEXT DEFAULT '',
        is_available INTEGER NOT NULL DEFAULT 1,
        is_featured INTEGER NOT NULL DEFAULT 0,
        image TEXT DEFAULT '',
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        business_id INTEGER,
        event_type TEXT NOT NULL,
        plan_id TEXT DEFAULT NULL,
        status TEXT DEFAULT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS barber_team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        title TEXT DEFAULT 'Barber',
        bio TEXT DEFAULT '',
        image TEXT DEFAULT '',
        specialties TEXT DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS barber_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL,
        is_open INTEGER NOT NULL DEFAULT 1,
        start_time TEXT DEFAULT '08:00',
        end_time TEXT DEFAULT '20:00',
        break_start TEXT DEFAULT NULL,
        break_end TEXT DEFAULT NULL,
        UNIQUE(barber_id, day_of_week),
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        barber_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, barber_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        customer_user_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        booking_date TEXT NOT NULL,
        booking_time TEXT NOT NULL,
        price REAL NOT NULL,
        service_duration_minutes INTEGER NOT NULL DEFAULT 30,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_method TEXT NOT NULL DEFAULT 'cash',
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        paid_at TEXT DEFAULT NULL,
        payment_reference TEXT DEFAULT '',
        payment_provider TEXT DEFAULT '',
        payment_customer_phone TEXT DEFAULT '',
        commission_amount REAL NOT NULL DEFAULT 0,
        barber_amount REAL NOT NULL DEFAULT 0,
        booking_location_type TEXT NOT NULL DEFAULT 'provider_location',
        booking_address TEXT DEFAULT '',
        booking_details_json TEXT DEFAULT '{}',
        team_member_id INTEGER DEFAULT NULL,
        cancelled_by TEXT DEFAULT NULL,
        cancellation_reason TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (team_member_id) REFERENCES barber_team_members(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS booking_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        actor_user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_note TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL UNIQUE,
        barber_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        review_text TEXT DEFAULT '',
        blocked_from_public INTEGER NOT NULL DEFAULT 0,
        blocked_by_user_id INTEGER DEFAULT NULL,
        blocked_at TEXT DEFAULT NULL,
        block_reason TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS quote_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        provider_id INTEGER NOT NULL,
        service_id INTEGER DEFAULT NULL,
        description TEXT NOT NULL,
        budget REAL DEFAULT NULL,
        preferred_date TEXT DEFAULT NULL,
        location TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES barber_services(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS support_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        topic TEXT NOT NULL DEFAULT 'Contact Support',
        name TEXT DEFAULT '',
        contact TEXT NOT NULL,
        booking_reference TEXT DEFAULT '',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        admin_notes TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        customer_user_id INTEGER NOT NULL,
        sender_user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        seen INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT DEFAULT 'Notification',
        type TEXT DEFAULT 'system',
        message TEXT NOT NULL,
        barber_id INTEGER DEFAULT NULL,
        customer_user_id INTEGER DEFAULT NULL,
        customer_username TEXT DEFAULT '',
        barber_owner_username TEXT DEFAULT '',
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS barber_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL UNIQUE,
        pending_balance REAL NOT NULL DEFAULT 0,
        available_balance REAL NOT NULL DEFAULT 0,
        locked_balance REAL NOT NULL DEFAULT 0,
        total_earned REAL NOT NULL DEFAULT 0,
        withdrawn_total REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        booking_id INTEGER DEFAULT NULL,
        payment_transaction_id INTEGER DEFAULT NULL,
        payout_request_id INTEGER DEFAULT NULL,
        direction TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        transaction_type TEXT DEFAULT 'legacy',
        entry_type TEXT DEFAULT 'posted',
        reference TEXT DEFAULT '',
        provider_reference TEXT DEFAULT '',
        note TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES barber_wallets(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS payout_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        mobile_money_number TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'mtn_mobile_money',
        reference TEXT NOT NULL UNIQUE,
        provider_reference TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        idempotency_key TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (wallet_id) REFERENCES barber_wallets(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS wallet_topups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'mtn_mobile_money',
        reference TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_reference TEXT DEFAULT '',
        wallet_credited INTEGER NOT NULL DEFAULT 0,
        credited_at TEXT DEFAULT NULL,
        mtn_reference TEXT DEFAULT '',
        external_transaction_id TEXT DEFAULT '',
        last_status_checked_at TEXT DEFAULT NULL,
        error_message TEXT DEFAULT '',
        payment_url TEXT DEFAULT '',
        idempotency_key TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER DEFAULT NULL,
        barber_id INTEGER DEFAULT NULL,
        user_id INTEGER DEFAULT NULL,
        subscription_id INTEGER DEFAULT NULL,
        transaction_type TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'internal',
        internal_reference TEXT NOT NULL UNIQUE,
        provider_reference TEXT DEFAULT '',
        idempotency_key TEXT DEFAULT '',
        payer_phone TEXT DEFAULT '',
        payee_phone TEXT DEFAULT '',
        gross_amount REAL NOT NULL DEFAULT 0,
        commission_amount REAL NOT NULL DEFAULT 0,
        net_amount REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'UGX',
        status TEXT NOT NULL DEFAULT 'pending',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER DEFAULT NULL,
        barber_id INTEGER DEFAULT NULL,
        user_id INTEGER DEFAULT NULL,
        flow_type TEXT NOT NULL DEFAULT 'booking',
        provider TEXT NOT NULL DEFAULT 'internal',
        internal_reference TEXT NOT NULL UNIQUE,
        provider_reference TEXT DEFAULT '',
        callback_url TEXT DEFAULT '',
        idempotency_key TEXT DEFAULT '',
        payer_phone TEXT DEFAULT '',
        payee_phone TEXT DEFAULT '',
        gross_amount REAL NOT NULL DEFAULT 0,
        commission_amount REAL NOT NULL DEFAULT 0,
        barber_amount REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'UGX',
        status TEXT NOT NULL DEFAULT 'pending',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS wallet_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_type TEXT NOT NULL,
        owner_id INTEGER DEFAULT NULL,
        wallet_id INTEGER DEFAULT NULL,
        booking_id INTEGER DEFAULT NULL,
        payment_id INTEGER DEFAULT NULL,
        payout_id INTEGER DEFAULT NULL,
        direction TEXT NOT NULL,
        balance_bucket TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        reference TEXT DEFAULT '',
        provider_reference TEXT DEFAULT '',
        description TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        FOREIGN KEY (wallet_id) REFERENCES barber_wallets(id) ON DELETE SET NULL,
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        mobile_money_number TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'mtn_mobile_money',
        internal_reference TEXT NOT NULL UNIQUE,
        provider_reference TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        idempotency_key TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (wallet_id) REFERENCES barber_wallets(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'payment_callback',
        reference TEXT DEFAULT '',
        provider_reference TEXT DEFAULT '',
        signature TEXT DEFAULT '',
        payload TEXT DEFAULT '{}',
        processing_status TEXT NOT NULL DEFAULT 'received',
        processed_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS barber_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        tier TEXT NOT NULL DEFAULT 'PLUS',
        price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        amount_paid REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'UGX',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        trial_status TEXT DEFAULT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        payment_reference TEXT DEFAULT '',
        provider TEXT DEFAULT 'internal',
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT DEFAULT NULL,
        activated_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS notification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT DEFAULT 'web',
        browser TEXT DEFAULT '',
        device_label TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS customer_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier TEXT NOT NULL DEFAULT 'PREMIUM',
        price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        amount_paid REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'UGX',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        payment_reference TEXT DEFAULT '',
        provider TEXT DEFAULT 'internal',
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT DEFAULT NULL,
        activated_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id INTEGER DEFAULT NULL,
        admin_username TEXT DEFAULT '',
        action_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        old_value TEXT DEFAULT '{}',
        new_value TEXT DEFAULT '{}',
        reason TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT NULL,
        channel TEXT NOT NULL,
        destination TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'account_verification',
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TEXT NOT NULL,
        verified_at TEXT DEFAULT NULL,
        used_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS sms_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        direction TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'africastalking',
        provider_message_id TEXT DEFAULT '',
        from_number TEXT DEFAULT '',
        to_number TEXT DEFAULT '',
        phone_number TEXT DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'received',
        user_id INTEGER DEFAULT NULL,
        business_id INTEGER DEFAULT NULL,
        booking_id INTEGER DEFAULT NULL,
        payment_id INTEGER DEFAULT NULL,
        subscription_id INTEGER DEFAULT NULL,
        raw_payload TEXT DEFAULT '{}',
        dedupe_key TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        sent_at TEXT DEFAULT NULL,
        received_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (business_id) REFERENCES barbers(id) ON DELETE SET NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
      )
    `);

    await migrateExistingSchema();
    await createIndexes();

    logger.info("Database tables and migrations are ready");
  } catch (error) {
    logger.fatal({ err: error }, "Database initialization failed");
    throw error;
  }
}
