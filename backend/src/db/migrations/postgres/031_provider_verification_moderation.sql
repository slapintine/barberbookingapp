-- Migration 031: Provider verification and moderation fields
-- Adds review_status, is_verified, is_suspended, is_banned, and audit fields to barbers table.
-- Existing businesses default to pending_review / unverified.

ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS is_verified INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_suspended INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_banned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_change_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS moderation_note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS moderated_at TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS moderated_by INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL;

-- Back-fill: businesses that were already admin-approved count as verified
UPDATE barbers
SET review_status = 'verified', is_verified = 1
WHERE admin_approved = 1
  AND review_status = 'pending_review';
