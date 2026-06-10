ALTER TABLE barber_subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE barber_subscriptions ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE barber_subscriptions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'UGX';
ALTER TABLE barber_subscriptions ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE barber_subscriptions ADD COLUMN IF NOT EXISTS trial_status TEXT DEFAULT NULL;
ALTER TABLE barber_subscriptions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS min_price NUMERIC DEFAULT NULL;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS max_price NUMERIC DEFAULT NULL;
ALTER TABLE barber_services ADD COLUMN IF NOT EXISTS starting_price NUMERIC DEFAULT NULL;

UPDATE barbers SET accepts_cash = 1 WHERE accepts_cash IS NULL OR accepts_cash = 0;
UPDATE barber_subscriptions SET price = 0, amount_paid = COALESCE(NULLIF(amount_paid, 0), 0) WHERE tier = 'FREE' AND billing_cycle = 'monthly';
UPDATE barber_subscriptions SET price = 12000, amount_paid = COALESCE(NULLIF(amount_paid, 0), 12000) WHERE tier = 'PREMIUM' AND billing_cycle = 'monthly';
UPDATE barber_subscriptions SET price = 24000, amount_paid = COALESCE(NULLIF(amount_paid, 0), 24000) WHERE tier = 'PLATINUM' AND billing_cycle = 'monthly';
