CREATE INDEX IF NOT EXISTS idx_messages_conversation_latest
  ON messages(barber_id, customer_user_id, id);
