CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_user_idempotency_present
  ON payments(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payouts_barber_idempotency_present
  ON payouts(barber_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payout_requests_barber_idempotency_present
  ON payout_requests(barber_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

-- Older databases can contain repeated deliveries from before this identity
-- was enforced. Retain the newest row for each exact webhook identity.
DELETE FROM webhook_events older
USING webhook_events newer
WHERE older.id < newer.id
  AND older.provider IS NOT DISTINCT FROM newer.provider
  AND older.event_type IS NOT DISTINCT FROM newer.event_type
  AND older.reference IS NOT DISTINCT FROM newer.reference
  AND older.provider_reference IS NOT DISTINCT FROM newer.provider_reference
  AND (COALESCE(older.reference, '') <> '' OR COALESCE(older.provider_reference, '') <> '');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_webhook_events_identity_present
  ON webhook_events(provider, event_type, reference, provider_reference)
  WHERE COALESCE(reference, '') <> '' OR COALESCE(provider_reference, '') <> '';
