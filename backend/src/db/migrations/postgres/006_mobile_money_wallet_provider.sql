ALTER TABLE wallet_topups
  ALTER COLUMN provider SET DEFAULT 'mtn_mobile_money';

UPDATE wallet_topups
SET provider = 'mtn_mobile_money'
WHERE provider = 'flutterwave';
