UPDATE barbers
SET business_status = 'active'
WHERE business_status = 'trialing'
  AND COALESCE(is_published, false) = true
  AND subscription_tier IN ('PRO', 'PREMIUM', 'PLATINUM')
  AND LOWER(COALESCE(trial_status, '')) = 'active'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at > NOW();

UPDATE barbers b
SET business_status = 'pending_payment',
    is_published = false
WHERE COALESCE(b.is_published, false) = true
  AND (
    b.business_status <> 'active'
    OR b.subscription_tier NOT IN ('PRO', 'PREMIUM', 'PLATINUM')
    OR LOWER(COALESCE(b.subscription_status, '')) IN (
      'cancelled',
      'draft',
      'expired',
      'inactive',
      'pending_payment',
      'payment_failed',
      'plan_required',
      'rejected',
      'suspended',
      'trial_expired',
      'subscription_expired',
      'almost_ready'
    )
    OR NOT (
      EXISTS (
        SELECT 1
        FROM barber_subscriptions bs
        WHERE bs.barber_id = b.id
          AND bs.tier IN ('PRO', 'PREMIUM', 'PLATINUM')
          AND LOWER(COALESCE(bs.status, '')) = 'active'
          AND bs.expires_at IS NOT NULL
          AND bs.expires_at > NOW()
      )
      OR (
        LOWER(COALESCE(b.subscription_status, '')) = 'active'
        AND b.subscription_expires_at IS NOT NULL
        AND b.subscription_expires_at > NOW()
      )
      OR (
        LOWER(COALESCE(b.trial_status, '')) = 'active'
        AND b.trial_ends_at IS NOT NULL
        AND b.trial_ends_at > NOW()
      )
    )
  );

CREATE OR REPLACE FUNCTION enforce_public_business_access()
RETURNS trigger AS $$
BEGIN
  IF NEW.business_status = 'active'
     AND (
       NEW.subscription_tier NOT IN ('PRO', 'PREMIUM', 'PLATINUM')
       OR NOT (
         (
           NEW.subscription_status = 'active'
           AND NEW.subscription_expires_at IS NOT NULL
           AND NEW.subscription_expires_at > NOW()
         )
         OR (
           NEW.trial_status = 'active'
           AND NEW.trial_ends_at IS NOT NULL
           AND NEW.trial_ends_at > NOW()
         )
       )
     ) THEN
    RAISE EXCEPTION 'Active businesses require a valid provider plan and unexpired subscription or trial';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reject_invalid_active_barber_insert ON barbers;
DROP TRIGGER IF EXISTS reject_invalid_active_barber_update ON barbers;

CREATE TRIGGER reject_invalid_active_barber_insert
BEFORE INSERT ON barbers
FOR EACH ROW
EXECUTE FUNCTION enforce_public_business_access();

CREATE TRIGGER reject_invalid_active_barber_update
BEFORE UPDATE ON barbers
FOR EACH ROW
EXECUTE FUNCTION enforce_public_business_access();
