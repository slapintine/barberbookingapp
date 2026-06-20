-- Migration 032: Add metadata column to customer_subscriptions
-- The customerSubscriptionController stores promo details and provider response
-- in a metadata JSON column that was never added to the original migration 019.

ALTER TABLE customer_subscriptions
  ADD COLUMN IF NOT EXISTS metadata TEXT DEFAULT '{}';

-- Also add started_at column default consistency (some rows may lack it)
ALTER TABLE customer_subscriptions
  ALTER COLUMN started_at SET DEFAULT NOW();
