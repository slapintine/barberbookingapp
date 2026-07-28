-- Release D: Provider Platinum operations.
-- Additive only: staff roles, branch/location structures, assignments, schedules,
-- report/export audit records, and booking assignment links.

ALTER TABLE barber_team_members ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE barber_team_members ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE barber_team_members ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE barber_team_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'service_professional';
ALTER TABLE barber_team_members ADD COLUMN IF NOT EXISTS user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE barber_team_members ADD COLUMN IF NOT EXISTS notification_preferences TEXT DEFAULT '{}';

CREATE TABLE IF NOT EXISTS provider_locations (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  area TEXT DEFAULT '',
  city TEXT DEFAULT '',
  latitude DOUBLE PRECISION DEFAULT NULL,
  longitude DOUBLE PRECISION DEFAULT NULL,
  contact_phone TEXT DEFAULT '',
  booking_instructions TEXT DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO provider_locations
  (barber_id, name, address, area, city, latitude, longitude, contact_phone, booking_instructions, is_primary, is_active, created_at, updated_at)
SELECT b.id,
       CASE WHEN COALESCE(TRIM(b.business_name), '') <> '' THEN b.business_name || ' main location' ELSE 'Main location' END,
       COALESCE(b.location, ''),
       COALESCE(b.location, ''),
       '',
       b.latitude,
       b.longitude,
       COALESCE(b.business_phone, ''),
       'Primary location copied from the provider stand.',
       1,
       1,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM barbers b
WHERE NOT EXISTS (SELECT 1 FROM provider_locations pl WHERE pl.barber_id = b.id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_primary_location ON provider_locations(barber_id) WHERE is_primary = 1;
CREATE INDEX IF NOT EXISTS idx_provider_locations_barber_status ON provider_locations(barber_id, is_active, is_primary);

CREATE TABLE IF NOT EXISTS provider_location_schedule (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1,
  start_time TEXT DEFAULT '08:00',
  end_time TEXT DEFAULT '20:00',
  break_start TEXT DEFAULT NULL,
  break_end TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS staff_service_assignments (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES barber_team_members(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES barber_services(id) ON DELETE CASCADE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(barber_id, staff_id, service_id)
);

CREATE TABLE IF NOT EXISTS staff_location_assignments (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES barber_team_members(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(barber_id, staff_id, location_id)
);

CREATE TABLE IF NOT EXISTS staff_schedules (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES barber_team_members(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  break_start TEXT DEFAULT NULL,
  break_end TEXT DEFAULT NULL,
  transition_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(barber_id, staff_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS staff_time_off (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES barber_team_members(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT DEFAULT NULL,
  end_time TEXT DEFAULT NULL,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_staff_id INTEGER DEFAULT NULL REFERENCES barber_team_members(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_location_id INTEGER DEFAULT NULL REFERENCES provider_locations(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_location_snapshot TEXT DEFAULT '{}';

CREATE TABLE IF NOT EXISTS provider_staff_invitations (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  staff_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'service_professional',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP DEFAULT NULL,
  revoked_at TIMESTAMP DEFAULT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_assignment_audit (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  staff_id INTEGER DEFAULT NULL REFERENCES barber_team_members(id) ON DELETE SET NULL,
  location_id INTEGER DEFAULT NULL REFERENCES provider_locations(id) ON DELETE SET NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_staff_id INTEGER DEFAULT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_export_audit (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL,
  filters_json TEXT DEFAULT '{}',
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_service_assignments_staff ON staff_service_assignments(staff_id, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_location_assignments_staff ON staff_location_assignments(staff_id, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_day ON staff_schedules(staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff_date ON staff_time_off(staff_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_staff_branch ON bookings(barber_id, assigned_staff_id, provider_location_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_provider_export_audit_barber ON provider_export_audit(barber_id, actor_user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_staff_invitation ON provider_staff_invitations(barber_id, staff_email) WHERE status = 'pending';
