ALTER TABLE barbers ALTER COLUMN subscription_tier SET DEFAULT 'FREE';
ALTER TABLE barber_subscriptions ALTER COLUMN tier SET DEFAULT 'FREE';
UPDATE barbers SET subscription_tier = 'FREE' WHERE COALESCE(TRIM(subscription_tier), '') <> '' AND UPPER(subscription_tier) NOT IN ('FREE', 'PREMIUM', 'PLATINUM');
UPDATE barber_subscriptions SET tier = 'FREE', price = 0 WHERE COALESCE(TRIM(tier), '') <> '' AND UPPER(tier) NOT IN ('FREE', 'PREMIUM', 'PLATINUM');
