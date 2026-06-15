CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_user_idempotency_present
  ON payments(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payouts_barber_idempotency_present
  ON payouts(barber_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payout_requests_barber_idempotency_present
  ON payout_requests(barber_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_webhook_events_identity_present
  ON webhook_events(provider, event_type, reference, provider_reference)
  WHERE COALESCE(reference, '') <> '' OR COALESCE(provider_reference, '') <> '';
