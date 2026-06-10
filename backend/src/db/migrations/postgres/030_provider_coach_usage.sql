CREATE TABLE IF NOT EXISTS provider_coach_usage (
  id BIGSERIAL PRIMARY KEY,
  barber_id BIGINT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_coach_usage_daily
  ON provider_coach_usage(barber_id, usage_date);

CREATE INDEX IF NOT EXISTS idx_provider_coach_usage_user
  ON provider_coach_usage(user_id, created_at);
