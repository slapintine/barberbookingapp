CREATE TABLE IF NOT EXISTS support_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL DEFAULT 'Contact Support',
  name TEXT DEFAULT '',
  contact TEXT NOT NULL,
  booking_reference TEXT DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_requests_user_id
  ON support_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_support_requests_status
  ON support_requests(status, created_at);
