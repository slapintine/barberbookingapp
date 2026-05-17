ALTER TABLE barbers ALTER COLUMN subscription_tier SET DEFAULT 'PRO';
ALTER TABLE barber_subscriptions ALTER COLUMN tier SET DEFAULT 'PRO';
UPDATE barbers SET subscription_tier = 'PRO' WHERE subscription_tier IN ('FREE', 'STANDARD', 'STARTER');
UPDATE barber_subscriptions SET tier = 'PRO', price = 6000 WHERE tier IN ('FREE', 'STANDARD', 'STARTER');
