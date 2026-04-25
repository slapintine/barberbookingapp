ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_barbers_subscription_tier
  ON barbers(subscription_tier, subscription_status);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_reference TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_customer_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS barber_amount DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS barber_wallets (
  id BIGSERIAL PRIMARY KEY,
  barber_id BIGINT NOT NULL UNIQUE REFERENCES barbers(id) ON DELETE CASCADE,
  pending_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  available_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  locked_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_earned DOUBLE PRECISION NOT NULL DEFAULT 0,
  withdrawn_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barber_wallets_barber_id
  ON barber_wallets(barber_id);

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS payment_transaction_id BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payout_request_id BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS reference TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_reference TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payment_id
  ON wallet_transactions(payment_transaction_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payout_id
  ON wallet_transactions(payout_request_id);

CREATE TABLE IF NOT EXISTS payout_requests (
  id BIGSERIAL PRIMARY KEY,
  barber_id BIGINT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES barber_wallets(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  mobile_money_number TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mtn_mobile_money',
  reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_barber_id
  ON payout_requests(barber_id);

CREATE INDEX IF NOT EXISTS idx_payout_requests_wallet_id
  ON payout_requests(wallet_id);

CREATE INDEX IF NOT EXISTS idx_payout_requests_idempotency
  ON payout_requests(barber_id, idempotency_key);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  barber_id BIGINT REFERENCES barbers(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  subscription_id BIGINT DEFAULT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'booking_payment',
  provider TEXT NOT NULL DEFAULT 'internal',
  internal_reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT DEFAULT '',
  idempotency_key TEXT DEFAULT '',
  payer_phone TEXT DEFAULT '',
  payee_phone TEXT DEFAULT '',
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id
  ON payment_transactions(booking_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference
  ON payment_transactions(internal_reference);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_reference
  ON payment_transactions(provider_reference);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_idempotency
  ON payment_transactions(idempotency_key);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  barber_id BIGINT REFERENCES barbers(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  flow_type TEXT NOT NULL DEFAULT 'booking',
  provider TEXT NOT NULL DEFAULT 'internal',
  internal_reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT DEFAULT '',
  callback_url TEXT DEFAULT '',
  idempotency_key TEXT DEFAULT '',
  payer_phone TEXT DEFAULT '',
  payee_phone TEXT DEFAULT '',
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  barber_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id
  ON payments(booking_id);

CREATE INDEX IF NOT EXISTS idx_payments_reference
  ON payments(internal_reference);

CREATE INDEX IF NOT EXISTS idx_payments_provider_reference
  ON payments(provider_reference);

CREATE INDEX IF NOT EXISTS idx_payments_idempotency
  ON payments(user_id, idempotency_key);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id BIGINT,
  wallet_id BIGINT REFERENCES barber_wallets(id) ON DELETE SET NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  payout_id BIGINT DEFAULT NULL,
  direction TEXT NOT NULL,
  balance_bucket TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  reference TEXT DEFAULT '',
  provider_reference TEXT DEFAULT '',
  description TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_owner
  ON wallet_ledger(owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_payment
  ON wallet_ledger(payment_id);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_booking
  ON wallet_ledger(booking_id);

CREATE TABLE IF NOT EXISTS payouts (
  id BIGSERIAL PRIMARY KEY,
  barber_id BIGINT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES barber_wallets(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  mobile_money_number TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mtn_mobile_money',
  internal_reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_barber_id
  ON payouts(barber_id);

CREATE INDEX IF NOT EXISTS idx_payouts_wallet_id
  ON payouts(wallet_id);

CREATE INDEX IF NOT EXISTS idx_payouts_idempotency
  ON payouts(barber_id, idempotency_key);

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'payment_callback',
  reference TEXT DEFAULT '',
  provider_reference TEXT DEFAULT '',
  signature TEXT DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'received',
  processed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_reference
  ON webhook_events(reference, provider_reference);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
  ON webhook_events(provider, event_type);

CREATE TABLE IF NOT EXISTS barber_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  barber_id BIGINT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'FREE',
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  payment_reference TEXT DEFAULT '',
  provider TEXT DEFAULT 'internal',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  activated_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barber_subscriptions_barber_id
  ON barber_subscriptions(barber_id);
