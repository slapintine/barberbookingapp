CREATE INDEX IF NOT EXISTS idx_barber_services_barber_available
  ON barber_services(barber_id, is_available);
