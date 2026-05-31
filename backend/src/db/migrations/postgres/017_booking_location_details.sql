ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_location_type TEXT NOT NULL DEFAULT 'provider_location';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_address TEXT DEFAULT '';
