ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS normalized_email TEXT DEFAULT '';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT DEFAULT '';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_plan TEXT DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_business_id BIGINT DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_trial_attempt_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS selected_plan TEXT DEFAULT NULL;

ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS selected_plan TEXT DEFAULT NULL;

ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE TABLE IF NOT EXISTS subscription_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  business_id BIGINT,
  event_type TEXT NOT NULL,
  plan_id TEXT DEFAULT NULL,
  status TEXT DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_trial_identity_email
  ON profiles(normalized_email)
  WHERE COALESCE(trial_used, 0) = 1;

CREATE INDEX IF NOT EXISTS idx_profiles_trial_identity_phone
  ON profiles(normalized_phone)
  WHERE COALESCE(trial_used, 0) = 1;

CREATE INDEX IF NOT EXISTS idx_subscription_events_user
  ON subscription_events(user_id, event_type, created_at);

UPDATE profiles
SET normalized_email = LOWER(TRIM(COALESCE(email, ''))),
    normalized_phone = REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g')
WHERE normalized_email IS NULL
   OR normalized_email = ''
   OR normalized_phone IS NULL
   OR normalized_phone = '';
