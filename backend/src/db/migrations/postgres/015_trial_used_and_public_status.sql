ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS trial_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS admin_approved INTEGER NOT NULL DEFAULT 0;

ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS is_demo INTEGER NOT NULL DEFAULT 0;

ALTER TABLE barbers
  ALTER COLUMN business_status SET DEFAULT 'pending_subscription';

ALTER TABLE barbers
  ALTER COLUMN subscription_status SET DEFAULT 'none';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'barbers'
      AND column_name = 'is_published'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE barbers ALTER COLUMN is_published DROP DEFAULT;
    ALTER TABLE barbers
      ALTER COLUMN is_published TYPE INTEGER
      USING CASE WHEN is_published THEN 1 ELSE 0 END;
    ALTER TABLE barbers ALTER COLUMN is_published SET DEFAULT 0;
  END IF;
END $$;

UPDATE barbers
SET business_status = 'pending_subscription',
    subscription_status = 'none',
    subscription_tier = 'NONE',
    subscription_expires_at = NULL,
    trial_plan = NULL,
    trial_started_at = NULL,
    trial_ends_at = NULL,
    trial_status = NULL,
    is_published = 0
WHERE subscription_tier IS NULL
   OR TRIM(subscription_tier) = ''
   OR UPPER(subscription_tier) = 'UNKNOWN'
   OR subscription_status IS NULL
   OR TRIM(subscription_status) = ''
   OR UPPER(subscription_status) = 'UNKNOWN';

UPDATE barbers b
SET business_status = 'pending_subscription',
    subscription_status = 'none',
    subscription_tier = 'NONE',
    subscription_expires_at = NULL,
    trial_plan = NULL,
    trial_started_at = NULL,
    trial_ends_at = NULL,
    trial_status = NULL,
    is_published = 0
WHERE COALESCE(b.is_demo, 0) = 1
   OR (
     COALESCE(b.is_published, 0) = 1
     AND NOT (
       b.business_status IN ('active', 'approved', 'live')
       AND b.subscription_tier IN ('FREE', 'PREMIUM', 'PLATINUM')
       AND (
         EXISTS (
           SELECT 1
           FROM barber_subscriptions bs
           WHERE bs.barber_id = b.id
             AND bs.tier IN ('FREE', 'PREMIUM', 'PLATINUM')
             AND LOWER(COALESCE(bs.status, '')) = 'active'
             AND bs.expires_at IS NOT NULL
             AND bs.expires_at > NOW()
         )
         OR COALESCE(b.admin_approved, 0) = 1
         OR LOWER(COALESCE(b.subscription_status, '')) IN ('approved', 'manual_approved', 'admin_approved')
         OR (
           LOWER(COALESCE(b.subscription_status, '')) = 'active'
           AND b.subscription_expires_at IS NOT NULL
           AND b.subscription_expires_at > NOW()
         )
         OR (
           LOWER(COALESCE(b.subscription_status, '')) = 'trialing'
           AND
           LOWER(COALESCE(b.trial_status, '')) = 'active'
           AND b.trial_ends_at IS NOT NULL
           AND b.trial_ends_at > NOW()
         )
       )
     )
   );

UPDATE barbers b
SET business_status = 'pending_subscription',
    subscription_status = 'none',
    subscription_tier = 'NONE',
    subscription_expires_at = NULL,
    trial_plan = NULL,
    trial_started_at = NULL,
    trial_ends_at = NULL,
    trial_status = NULL,
    is_published = 0
WHERE LOWER(COALESCE(b.subscription_status, '')) = 'trialing'
  AND NOT EXISTS (
    SELECT 1
    FROM barber_subscriptions bs
    WHERE bs.barber_id = b.id
      AND LOWER(COALESCE(bs.provider, '')) = 'trial'
      AND LOWER(COALESCE(bs.status, '')) = 'trialing'
  );

CREATE OR REPLACE FUNCTION enforce_public_business_access()
RETURNS trigger AS $$
BEGIN
  IF NEW.business_status IN ('active', 'approved', 'live')
     AND (
       NEW.subscription_tier NOT IN ('FREE', 'PREMIUM', 'PLATINUM')
       OR NOT (
         (
           NEW.subscription_status = 'active'
           AND NEW.subscription_expires_at IS NOT NULL
           AND NEW.subscription_expires_at > NOW()
         )
         OR (
           NEW.subscription_status IN ('manual_approved', 'admin_approved', 'approved')
           OR COALESCE(NEW.admin_approved, 0) = 1
         )
         OR (
           NEW.subscription_status = 'trialing'
           AND
           NEW.trial_status = 'active'
           AND NEW.trial_ends_at IS NOT NULL
           AND NEW.trial_ends_at > NOW()
         )
       )
     ) THEN
    RAISE EXCEPTION 'Public businesses require a valid plan, active trial, or admin approval';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
