ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_verification_code_hash TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_email_code_sent_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ DEFAULT NULL;

UPDATE users
SET account_status = 'active'
WHERE account_status IS NULL OR TRIM(account_status) = '';

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON users(account_status);
