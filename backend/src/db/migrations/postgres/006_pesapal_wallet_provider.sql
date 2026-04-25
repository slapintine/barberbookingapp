ALTER TABLE wallet_topups
  ALTER COLUMN provider SET DEFAULT 'pesapal';

UPDATE wallet_topups
SET provider = 'pesapal'
WHERE provider = 'flutterwave';
