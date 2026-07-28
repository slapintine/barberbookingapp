-- Release D follow-up: staff invitation acceptance and role-scoped access.
-- Additive only; preserves existing invitation and staff rows.

ALTER TABLE provider_staff_invitations ADD COLUMN IF NOT EXISTS metadata_json TEXT DEFAULT '{}';
ALTER TABLE provider_staff_invitations ADD COLUMN IF NOT EXISTS accepted_by_user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE provider_staff_invitations ADD COLUMN IF NOT EXISTS accepted_staff_id INTEGER DEFAULT NULL REFERENCES barber_team_members(id) ON DELETE SET NULL;
ALTER TABLE provider_staff_invitations ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_staff_invitations_token_status
  ON provider_staff_invitations(token_hash, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_barber_team_members_user_active
  ON barber_team_members(user_id, barber_id, is_active);
