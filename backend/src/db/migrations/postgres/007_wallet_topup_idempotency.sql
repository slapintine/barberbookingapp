ALTER TABLE wallet_topups
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_wallet_topups_user_idempotency
  ON wallet_topups(user_id, idempotency_key);
