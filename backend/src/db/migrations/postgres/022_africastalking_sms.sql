CREATE TABLE IF NOT EXISTS sms_messages (
  id BIGSERIAL PRIMARY KEY,
  direction TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'africastalking',
  provider_message_id TEXT DEFAULT '',
  from_number TEXT DEFAULT '',
  to_number TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  business_id BIGINT REFERENCES barbers(id) ON DELETE SET NULL,
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  payment_id BIGINT DEFAULT NULL,
  subscription_id BIGINT DEFAULT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  sent_at TIMESTAMPTZ DEFAULT NULL,
  received_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_id
  ON sms_messages(provider_message_id);

CREATE INDEX IF NOT EXISTS idx_sms_messages_dedupe
  ON sms_messages(dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_messages_outgoing_dedupe
  ON sms_messages(dedupe_key)
  WHERE direction = 'outgoing' AND dedupe_key <> '';

CREATE INDEX IF NOT EXISTS idx_sms_messages_phone
  ON sms_messages(phone_number);

CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at
  ON sms_messages(created_at);

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
