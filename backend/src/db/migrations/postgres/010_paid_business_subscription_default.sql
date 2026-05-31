ALTER TABLE barbers ALTER COLUMN subscription_tier SET DEFAULT 'PLUS';
ALTER TABLE barber_subscriptions ALTER COLUMN tier SET DEFAULT 'PLUS';
UPDATE barbers SET subscription_tier = 'PLUS' WHERE COALESCE(TRIM(subscription_tier), '') <> '' AND UPPER(subscription_tier) NOT IN ('PLUS', 'PREMIUM', 'PLATINUM');
UPDATE barber_subscriptions SET tier = 'PLUS', price = 6000 WHERE COALESCE(TRIM(tier), '') <> '' AND UPPER(tier) NOT IN ('PLUS', 'PREMIUM', 'PLATINUM');
