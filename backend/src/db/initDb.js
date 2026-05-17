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
  await run(`CREATE INDEX IF NOT EXISTS idx_messages_barber_id ON messages(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_messages_customer_user_id ON messages(customer_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notifications_thread_message ON notifications(user_id, type, barber_id, customer_user_id, read)`);
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
  await run(`CREATE INDEX IF NOT EXISTS idx_barber_wallets_barber_id ON barber_wallets(barber_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id ON payment_transactions(booking_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(internal_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_reference ON payment_transactions(provider_reference)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_idempotency ON payment_transactions(idempotency_key)`);
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
}

async function migrateExistingSchema() {
  await addColumnIfMissing(
    "barbers",
    "image",
    `image TEXT DEFAULT ''`
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
    "subscription_tier",
    `subscription_tier TEXT NOT NULL DEFAULT 'FREE'`
  );
  await addColumnIfMissing(
    "barbers",
    "subscription_status",
    `subscription_status TEXT NOT NULL DEFAULT 'active'`
  );
  await addColumnIfMissing(
    "barbers",
    "subscription_expires_at",
    `subscription_expires_at TEXT DEFAULT NULL`
  );
  await addColumnIfMissing(
    "barbers",
    "featured_until",
    `featured_until TEXT DEFAULT NULL`
  );

  await addColumnIfMissing(
    "barber_services",
    "duration_minutes",
    `duration_minutes INTEGER NOT NULL DEFAULT 30`
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        full_name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        address TEXT DEFAULT '',
        profile_photo TEXT DEFAULT '',
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
        image TEXT DEFAULT '',
        availability_start TEXT DEFAULT '08:00',
        availability_end TEXT DEFAULT '20:00',
        accepts_wallet INTEGER NOT NULL DEFAULT 0,
        accepts_cash INTEGER NOT NULL DEFAULT 1,
        stand_type TEXT NOT NULL DEFAULT 'individual',
        subscription_tier TEXT NOT NULL DEFAULT 'FREE',
        subscription_status TEXT NOT NULL DEFAULT 'active',
        subscription_expires_at TEXT DEFAULT NULL,
        featured_until TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS barber_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        price_extra REAL NOT NULL DEFAULT 0,
        duration_minutes INTEGER NOT NULL DEFAULT 30,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
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
        provider TEXT NOT NULL DEFAULT 'pesapal',
        reference TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_reference TEXT DEFAULT '',
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
        tier TEXT NOT NULL DEFAULT 'FREE',
        price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
