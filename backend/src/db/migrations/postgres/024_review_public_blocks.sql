ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS blocked_from_public INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_by_user_id BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS block_reason TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_reviews_blocked
  ON reviews(barber_id, blocked_from_public);
