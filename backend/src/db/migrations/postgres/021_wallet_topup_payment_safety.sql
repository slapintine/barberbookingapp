ALTER TABLE wallet_topups
  ADD COLUMN IF NOT EXISTS wallet_credited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mtn_reference TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_status_checked_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT '';

UPDATE wallet_topups
SET wallet_credited = TRUE,
    credited_at = COALESCE(credited_at, updated_at)
WHERE LOWER(COALESCE(status, '')) IN ('successful', 'success', 'completed', 'paid')
  AND wallet_credited = FALSE;
