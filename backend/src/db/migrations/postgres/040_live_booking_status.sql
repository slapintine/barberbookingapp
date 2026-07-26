ALTER TABLE bookings ADD COLUMN IF NOT EXISTS live_status TEXT NOT NULL DEFAULT 'expected';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_start_time TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS live_status_updated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_ready_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_completed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_bookings_live_status ON bookings(barber_id, booking_date, live_status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_booking_events_idempotency_present
  ON booking_events(booking_id, idempotency_key)
  WHERE idempotency_key <> '';
