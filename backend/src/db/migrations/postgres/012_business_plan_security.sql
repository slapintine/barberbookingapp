ALTER TABLE barbers ADD COLUMN IF NOT EXISTS business_status TEXT NOT NULL DEFAULT 'pending_payment';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS normalized_business_name TEXT DEFAULT '';
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS trial_plan TEXT DEFAULT NULL;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS trial_status TEXT DEFAULT NULL;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS used_trials JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE barbers
SET normalized_business_name = regexp_replace(lower(trim(business_name)), '\s+', ' ', 'g')
WHERE normalized_business_name IS NULL OR trim(normalized_business_name) = '';

UPDATE barbers
SET business_status = 'pending_payment',
    is_published = false,
    subscription_tier = NULL,
    subscription_status = 'pending_payment'
WHERE subscription_tier IS NULL
   OR trim(subscription_tier) = ''
   OR upper(subscription_tier) = 'UNKNOWN'
   OR subscription_status IS NULL
   OR trim(subscription_status) = ''
   OR upper(subscription_status) = 'UNKNOWN';

CREATE INDEX IF NOT EXISTS idx_barbers_public_plan_status
  ON barbers (business_status, is_published, subscription_tier);

CREATE INDEX IF NOT EXISTS idx_barbers_normalized_business_name
  ON barbers (normalized_business_name);

ALTER TABLE barbers
  ADD CONSTRAINT barbers_valid_public_plan
  CHECK (
    business_status NOT IN ('active', 'trialing')
    OR (
      subscription_tier IN ('FREE', 'PREMIUM', 'PLATINUM')
      AND subscription_status IN ('active', 'trialing')
    )
  );
