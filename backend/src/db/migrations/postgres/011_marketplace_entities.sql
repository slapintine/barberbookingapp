ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'provider_location';
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS is_featured INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_requests (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES barber_services(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  budget REAL,
  preferred_date TEXT,
  location TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_customer_id ON quote_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_provider_id ON quote_requests(provider_id);
