UPDATE barbers
SET subscription_tier = 'PREMIUM',
    selected_plan = CASE
      WHEN UPPER(COALESCE(selected_plan, '')) = CHR(80) || CHR(76) || CHR(85) || CHR(83) THEN 'PREMIUM'
      ELSE selected_plan
    END
WHERE UPPER(COALESCE(subscription_tier, '')) = CHR(80) || CHR(76) || CHR(85) || CHR(83);

UPDATE barber_subscriptions
SET tier = 'PREMIUM',
    price = CASE
      WHEN COALESCE(price, 0) IN (0, 12000 / 2, 120000 / 2)
        THEN CASE WHEN LOWER(COALESCE(billing_cycle, 'monthly')) = 'annual' THEN 120000 ELSE 12000 END
      ELSE price
    END,
    amount_paid = CASE
      WHEN COALESCE(amount_paid, 0) IN (0, 12000 / 2, 120000 / 2)
        THEN CASE WHEN LOWER(COALESCE(billing_cycle, 'monthly')) = 'annual' THEN 120000 ELSE 12000 END
      ELSE amount_paid
    END
WHERE UPPER(COALESCE(tier, '')) = CHR(80) || CHR(76) || CHR(85) || CHR(83);

UPDATE barbers
SET subscription_tier = 'FREE'
WHERE COALESCE(TRIM(subscription_tier), '') <> ''
  AND UPPER(subscription_tier) NOT IN ('FREE', 'PREMIUM', 'PLATINUM');

UPDATE barber_subscriptions
SET tier = 'FREE', price = 0
WHERE COALESCE(TRIM(tier), '') <> ''
  AND UPPER(tier) NOT IN ('FREE', 'PREMIUM', 'PLATINUM');

CREATE OR REPLACE FUNCTION enforce_public_business_access()
RETURNS trigger AS $$
BEGIN
  IF NEW.business_status IN ('active', 'approved', 'live')
     AND (
       NEW.subscription_tier NOT IN ('FREE', 'PREMIUM', 'PLATINUM')
       OR NOT (
         (
           NEW.subscription_tier = 'FREE'
           AND NEW.subscription_status = 'active'
         )
         OR (
           NEW.subscription_status = 'active'
           AND NEW.subscription_expires_at IS NOT NULL
           AND NEW.subscription_expires_at > NOW()
         )
         OR (
           NEW.subscription_status IN ('manual_approved', 'admin_approved', 'approved')
           OR COALESCE(NEW.admin_approved, 0) = 1
         )
         OR (
           NEW.subscription_status = 'trialing'
           AND NEW.trial_status = 'active'
           AND NEW.trial_ends_at IS NOT NULL
           AND NEW.trial_ends_at > NOW()
         )
       )
     ) THEN
    RAISE EXCEPTION 'Public businesses require a valid plan, active trial, or admin approval';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
