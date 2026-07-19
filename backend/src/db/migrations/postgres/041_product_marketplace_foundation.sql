-- Services-only provider profile media and business-hours backfill.
-- Removed commerce tables are intentionally not created by this migration.
-- Existing production databases that already contain legacy commerce tables are left untouched.

ALTER TABLE barbers ADD COLUMN IF NOT EXISTS marketplace_mode TEXT NOT NULL DEFAULT 'service';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT '';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS business_hours_json TEXT NOT NULL DEFAULT '{}';

UPDATE barbers
SET marketplace_mode = 'service'
WHERE LOWER(TRIM(COALESCE(marketplace_mode, ''))) <> 'service';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'barbers_marketplace_mode_check'
  ) THEN
    ALTER TABLE barbers DROP CONSTRAINT barbers_marketplace_mode_check;
  END IF;

  ALTER TABLE barbers
    ADD CONSTRAINT barbers_marketplace_mode_check
    CHECK (marketplace_mode = 'service');
END $$;
