ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT DEFAULT '';

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT '';

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS conversation_message_id INTEGER DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_sender_client_id
  ON messages(sender_user_id, client_message_id)
  WHERE client_message_id IS NOT NULL AND client_message_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_quote_requests_customer_idempotency
  ON quote_requests(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
