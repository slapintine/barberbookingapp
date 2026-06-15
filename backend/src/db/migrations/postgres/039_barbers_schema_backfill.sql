-- Columns that existed in the SQLite schema but were missing from the
-- PostgreSQL migration history. Safe to run multiple times (IF NOT EXISTS).
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS business_type          TEXT    DEFAULT 'Services';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS home_service_enabled   INTEGER DEFAULT 0;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS intro_text             TEXT    DEFAULT '';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS portfolio_json         TEXT    DEFAULT '[]';
