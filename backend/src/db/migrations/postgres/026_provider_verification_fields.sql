ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS verification_document_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_document_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_reviewed_by INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_barbers_verified_status
  ON barbers(verified_status);

CREATE INDEX IF NOT EXISTS idx_barbers_verification_submitted_at
  ON barbers(verification_submitted_at);
