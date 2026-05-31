ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_details_json TEXT DEFAULT '{}';
