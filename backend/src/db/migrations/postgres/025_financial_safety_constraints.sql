DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallets_nonnegative_balance') THEN
    ALTER TABLE wallets
      ADD CONSTRAINT chk_wallets_nonnegative_balance CHECK (balance >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallet_topups_amount_limits') THEN
    ALTER TABLE wallet_topups
      ADD CONSTRAINT chk_wallet_topups_amount_limits CHECK (amount >= 1000 AND amount <= 5000000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallet_topups_status') THEN
    ALTER TABLE wallet_topups
      ADD CONSTRAINT chk_wallet_topups_status CHECK (
        LOWER(status) IN ('pending', 'initiated', 'successful', 'failed', 'cancelled', 'expired', 'unknown')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_transactions_amounts_nonnegative') THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT chk_payment_transactions_amounts_nonnegative CHECK (
        gross_amount >= 0 AND commission_amount >= 0 AND net_amount >= 0
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_transactions_status') THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT chk_payment_transactions_status CHECK (
        LOWER(status) IN ('pending', 'initiated', 'successful', 'failed', 'cancelled', 'expired', 'unknown', 'paid', 'processing')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_topups_user_idempotency_present
  ON wallet_topups(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_transactions_user_idempotency_present
  ON payment_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
