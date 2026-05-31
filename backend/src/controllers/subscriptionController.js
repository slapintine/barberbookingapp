import { get, run, transaction } from "../db/query.js";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  createReference,
  FREE_TRIAL_DAYS,
  getPlanPrice,
  getMobileMoneyProviderLabel,
  getSubscriptionEndDate,
  getSubscriptionPlans,
  getSubscriptionTierConfig,
  normalizeBillingCycle,
  normalizeProviderPlan,
  normalizePhoneNumber,
} from "../services/paymentService.js";
import { getMobileMoneyService } from "../services/mobileMoneyService.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function addDays(days) {
  const value = new Date();
  value.setDate(value.getDate() + Number(days || 0));
  return value.toISOString();
}

function getOfficialPlanOrThrow(tier, billingCycle) {
  const requestedTier = normalizeProviderPlan(tier);
  if (!requestedTier) {
    throw httpError(400, "A valid plan is required before creating a business.");
  }
  const cycle = normalizeBillingCycle(billingCycle);
  if (!cycle) {
    throw httpError(400, "Choose monthly or annual billing.");
  }
  const tierConfig = getSubscriptionTierConfig(requestedTier);
  const price = getPlanPrice(requestedTier, cycle);
  if (!price || price <= 0) {
    throw httpError(400, "Plan price unavailable.");
  }
  return { requestedTier, cycle, tierConfig, price };
}

function normalizePromoCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function hashPromoCode(value) {
  return crypto.createHash("sha256").update(normalizePromoCode(value)).digest("hex");
}

async function resolveProviderPromo({ client, userId, barberId, rawCode, price }) {
  const code = normalizePromoCode(rawCode);
  if (!code) {
    return { finalAmount: price, discountAmount: 0, promo: null };
  }

  const expiresAt = env.providerPromoExpiresAt ? new Date(env.providerPromoExpiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw httpError(400, "Promo code is invalid or expired.");
  }

  const promoOptions = [
    env.providerPromoFreeCode ? { type: "free_month", code: normalizePromoCode(env.providerPromoFreeCode), discountPercent: 100 } : null,
    env.providerPromoPercentCode ? { type: "twenty_percent_off", code: normalizePromoCode(env.providerPromoPercentCode), discountPercent: 20 } : null,
  ].filter(Boolean);
  const matched = promoOptions.find((item) => item.code && item.code === code);
  if (!matched) {
    throw httpError(400, "Promo code is invalid or expired.");
  }

  const promoHash = hashPromoCode(code);
  const used = await client.get(
    `SELECT id FROM payment_transactions
     WHERE user_id = ?
       AND transaction_type = 'subscription_payment'
       AND metadata LIKE ?
       AND LOWER(COALESCE(status, '')) IN ('pending', 'initiated', 'successful', 'completed')
     LIMIT 1`,
    [userId, `%"promoHash":"${promoHash}"%`]
  );
  if (used) {
    throw httpError(409, "Promo code has already been used.");
  }

  const discountAmount = Math.min(price, Math.round((price * matched.discountPercent) / 100));
  return {
    finalAmount: Math.max(0, price - discountAmount),
    discountAmount,
    promo: {
      type: matched.type,
      discountPercent: matched.discountPercent,
      promoHash,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

function getTrialEndDate(startedAt) {
  const base = startedAt ? new Date(startedAt) : new Date();
  base.setDate(base.getDate() + FREE_TRIAL_DAYS);
  return base;
}

function getRemainingTrialDays(trialEndsAt) {
  const target = new Date(trialEndsAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((target - now) / (24 * 60 * 60 * 1000)));
}

async function getOwnedBarber(userId, client = { get }) {
  return client.get(
    `SELECT b.*,
            p.phone,
            p.email,
            p.normalized_email AS owner_normalized_email,
            p.normalized_phone AS owner_normalized_phone,
            p.trial_used AS owner_trial_used,
            p.selected_plan AS owner_selected_plan
     FROM barbers b
     LEFT JOIN profiles p ON p.user_id = b.owner_user_id
     WHERE b.owner_user_id = ?`,
    [userId]
  );
}

function normalizeIdentityEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function getLatestSubscription(barberId, client = { get }) {
  return client.get(
    `SELECT *
     FROM barber_subscriptions
     WHERE barber_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [barberId]
  );
}

function mapSubscription(subscription, barber) {
  const baseTier = normalizeProviderPlan(subscription?.tier || barber?.subscription_tier);
  const status = String(subscription?.status || barber?.subscription_status || barber?.trial_status || "").toLowerCase();
  const trialEndsAt = barber?.trial_ends_at || null;
  const trialActive = Boolean(baseTier) && ["trialing", "trial"].includes(status) && trialEndsAt && Date.now() < new Date(trialEndsAt).getTime();
  const paidActive = Boolean(baseTier) && status === "active";
  if (!baseTier || (!trialActive && !paidActive)) {
    return {
      tier: "LOCKED",
      name: "No active plan",
      price: 0,
      status: status === "expired" || status === "trial_expired" ? "expired" : "none",
      started_at: null,
      expires_at: null,
      activated_at: null,
      is_trial: false,
      trial_days_total: FREE_TRIAL_DAYS,
      trial_days_left: 0,
      fallback_tier_after_trial: null,
      features: {
        rankingWeight: 0,
        analyticsLevel: "locked",
        homepageFeatured: false,
        searchPriority: 0,
        topBarberBadge: false,
        verifiedBadge: false,
        adsPlacement: false,
        promotionsEnabled: false,
        marketingPushEnabled: false,
        homeServiceEnabled: false,
        profileCustomizationLevel: "locked",
        visibilityLabel: "Plan required",
        supportLevel: "Choose a provider plan to activate your business.",
        serviceLimit: 0,
        photoLimit: 0,
        videoLimit: 0,
        reviewsEnabled: false,
        earningsTracking: false,
        bookingAnalytics: false,
        customBrandingHighlight: false,
        portfolioEnabled: false,
      beforeAfterGalleryEnabled: false,
        advancedAnalytics: false,
        aiBusinessCoach: false,
        reviewInsights: false,
        videoUploads: false,
        homepageFeature: false,
        priorityRanking: false,
        customBanner: false,
        aiWeeklyReport: false,
      },
    };
  }
  const tierConfig = getSubscriptionTierConfig(baseTier);

  return {
    tier: tierConfig.code,
    name: tierConfig.name,
    price: Number(subscription?.price ?? tierConfig.price ?? 0),
    billingCycle: subscription?.billing_cycle || "monthly",
    status: trialActive
      ? "trialing"
      : subscription?.status || barber?.subscription_status || "active",
    started_at: subscription?.started_at || barber?.created_at || null,
    expires_at: trialActive
      ? trialEndsAt
      : subscription?.expires_at || barber?.subscription_expires_at || null,
    activated_at: subscription?.activated_at || null,
    is_trial: trialActive,
    trial_days_total: FREE_TRIAL_DAYS,
    trial_days_left: trialActive ? getRemainingTrialDays(trialEndsAt) : 0,
    fallback_tier_after_trial: null,
    features: {
      rankingWeight: tierConfig.rankingWeight,
      analyticsLevel: tierConfig.analyticsLevel,
      homepageFeatured: tierConfig.homepageFeatured,
      searchPriority: tierConfig.searchPriority,
      topBarberBadge: tierConfig.topBarberBadge,
      verifiedBadge: tierConfig.verifiedBadge,
      adsPlacement: tierConfig.adsPlacement,
      promotionsEnabled: tierConfig.promotionsEnabled,
      marketingPushEnabled: tierConfig.marketingPushEnabled,
      homeServiceEnabled: tierConfig.homeServiceEnabled,
      profileCustomizationLevel: tierConfig.profileCustomizationLevel,
      visibilityLabel: tierConfig.visibilityLabel,
      supportLevel: tierConfig.supportLevel,
      serviceLimit: tierConfig.serviceLimit,
      photoLimit: tierConfig.photoLimit,
      videoLimit: tierConfig.videoLimit,
      reviewsEnabled: tierConfig.reviewsEnabled,
      earningsTracking: tierConfig.earningsTracking,
      bookingAnalytics: tierConfig.bookingAnalytics,
      customBrandingHighlight: tierConfig.customBrandingHighlight,
      portfolioEnabled: tierConfig.portfolioEnabled,
      beforeAfterGalleryEnabled: tierConfig.beforeAfterGalleryEnabled,
      advancedAnalytics: tierConfig.advancedAnalytics,
      aiBusinessCoach: tierConfig.aiBusinessCoach,
      reviewInsights: tierConfig.reviewInsights,
      videoUploads: tierConfig.videoUploads,
      homepageFeature: tierConfig.homepageFeature,
      priorityRanking: tierConfig.priorityRanking,
      customBanner: tierConfig.customBanner,
      aiWeeklyReport: tierConfig.aiWeeklyReport,
    },
  };
}

function mapAdminPreviewSubscription(tier = "PLATINUM") {
  const tierConfig = getSubscriptionTierConfig(tier);
  return {
    tier: tierConfig.code,
    name: `${tierConfig.name} Preview`,
    price: Number(tierConfig.price || 0),
    billingCycle: "monthly",
    status: "admin_preview",
    started_at: null,
    expires_at: null,
    activated_at: null,
    is_trial: false,
    trial_days_total: FREE_TRIAL_DAYS,
    trial_days_left: 0,
    fallback_tier_after_trial: null,
    adminPreview: true,
    features: {
      rankingWeight: tierConfig.rankingWeight,
      analyticsLevel: tierConfig.analyticsLevel,
      homepageFeatured: true,
      searchPriority: tierConfig.searchPriority,
      topBarberBadge: true,
      verifiedBadge: true,
      adsPlacement: true,
      promotionsEnabled: true,
      marketingPushEnabled: true,
      homeServiceEnabled: true,
      profileCustomizationLevel: tierConfig.profileCustomizationLevel,
      visibilityLabel: "Admin preview mode",
      supportLevel: "Admin unrestricted access",
      serviceLimit: -1,
      photoLimit: -1,
      videoLimit: -1,
      reviewsEnabled: true,
      earningsTracking: true,
      bookingAnalytics: true,
      customBrandingHighlight: true,
      portfolioEnabled: true,
      beforeAfterGalleryEnabled: true,
      advancedAnalytics: true,
      aiBusinessCoach: true,
      reviewInsights: true,
      videoUploads: true,
      homepageFeature: true,
      priorityRanking: true,
      customBanner: true,
      aiWeeklyReport: true,
    },
  };
}

export async function getMySubscription(req, res, next) {
  try {
    if (req.user?.role === "admin") {
      return res.status(200).json({
        success: true,
        adminPreview: true,
        subscription: mapAdminPreviewSubscription(),
        tiers: ["PLUS", "PREMIUM", "PLATINUM"].map((tier) =>
          getSubscriptionTierConfig(tier)
        ),
      });
    }

    const barber = await getOwnedBarber(req.user.id);
    if (!barber) {
      throw httpError(404, "Barber profile not found.");
    }

    const subscription = await getLatestSubscription(barber.id);

    res.status(200).json({
      success: true,
      subscription: mapSubscription(subscription, barber),
      tiers: getSubscriptionPlans(),
    });
  } catch (error) {
    next(error);
  }
}

export async function startSubscriptionUpgrade(req, res, next) {
  try {
    const requestedTierRaw = req.body.planId || req.body.tier;
    const billingCycleRaw = req.body.billingCycle || req.body.billing_cycle || "monthly";
    const provider = String(req.body.provider || req.body.method || "mtn_mobile_money").trim().toLowerCase();
    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);
    const { requestedTier, cycle: billingCycle, tierConfig, price } = getOfficialPlanOrThrow(requestedTierRaw, billingCycleRaw);
    if (req.body.price !== undefined && Number(req.body.price) !== price) {
      throw httpError(400, "Plan details could not be loaded. Please choose a plan again.");
    }

    if (!["mtn_mobile_money", "airtel_money", "trial"].includes(provider)) {
      throw httpError(400, "Choose MTN Mobile Money or Airtel Money.");
    }

    if (provider === "trial" && !env.providerFreeTrialsEnabled) {
      throw httpError(403, "Provider free trials are disabled. Choose a provider plan to activate your business.");
    }

    if (req.user?.role === "admin") {
      const reference = createReference("admin_subscription_preview", req.user.id);
      return res.status(201).json({
        success: true,
        adminPreview: true,
        message: `Admin preview started for ${tierConfig.name}. No real payment is required.`,
        subscription: mapAdminPreviewSubscription(requestedTier),
        payment: {
          reference,
          status: "preview",
          provider,
          amount: price,
        },
      });
    }

    const result = await transaction(async (client) => {
      const barber = await getOwnedBarber(req.user.id, client);
      if (!barber) {
        throw httpError(404, "Barber profile not found.");
      }

      if (provider === "trial") {
        const normalizedEmail = normalizeIdentityEmail(barber.email);
        const normalizedPhone = normalizeIdentityPhone(barber.phone);
        await client.run(
          `UPDATE profiles
           SET normalized_email = ?,
               normalized_phone = ?,
               last_trial_attempt_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [normalizedEmail, normalizedPhone, req.user.id]
        ).catch(() => {});

        const identityTrial = await client.get(
          `SELECT p.user_id
           FROM profiles p
           WHERE COALESCE(p.trial_used, 0) = 1
             AND (
               p.user_id = ?
               OR (? <> '' AND LOWER(COALESCE(p.normalized_email, LOWER(TRIM(p.email)), '')) = ?)
               OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.normalized_phone, p.phone, ''), '+', ''), ' ', ''), '-', ''), '(', '') LIKE ?)
             )
           LIMIT 1`,
          [req.user.id, normalizedEmail, normalizedEmail, normalizedPhone, `%${normalizedPhone.slice(-9)}`]
        );
        if (identityTrial || Number(barber.owner_trial_used || 0) === 1) {
          throw httpError(409, "You have already used your free trial. Please choose a paid plan to continue making your business visible.");
        }

        const usedTrials = (() => {
          try {
            const parsed = JSON.parse(barber.used_trials || "[]");
            return Array.isArray(parsed) ? parsed.map((item) => String(item).toLowerCase()) : [];
          } catch {
            return [];
          }
        })();
        if (Number(barber.trial_used || 0) === 1 || usedTrials.length > 0) {
          throw httpError(409, "You have already used your free trial. Please choose a paid plan to continue making your business visible.");
        }

        const trialStartedAt = new Date().toISOString();
        const trialEndsAt = getTrialEndDate(trialStartedAt).toISOString();
        const insertResult = await client.run(
          `INSERT INTO barber_subscriptions
           (barber_id, tier, price, status, payment_reference, provider, billing_cycle, amount_paid, currency, payment_status, trial_status, is_active, started_at, expires_at, activated_at)
           VALUES (?, ?, 0, 'trialing', ?, 'trial', 'monthly', 0, 'UGX', 'trial', 'active', 1, ?, ?, ?)`,
          [barber.id, requestedTier, createReference("trial", barber.id), trialStartedAt, trialEndsAt, trialStartedAt]
        );
        await client.run(
          `UPDATE barbers
           SET subscription_tier = ?,
               subscription_status = 'trialing',
               subscription_expires_at = ?,
               business_status = 'active',
               is_published = 1,
               trial_plan = ?,
               trial_started_at = ?,
               trial_ends_at = ?,
               trial_status = 'active',
               trial_used = 1,
               used_trials = ?
           WHERE id = ?`,
          [requestedTier, trialEndsAt, requestedTier, trialStartedAt, trialEndsAt, JSON.stringify([...new Set([...usedTrials, requestedTier.toLowerCase()])]), barber.id]
        );
        await client.run(
          `UPDATE profiles
           SET trial_used = 1,
               trial_started_at = ?,
               trial_ends_at = ?,
               trial_plan = ?,
               trial_business_id = ?,
               subscription_status = 'trialing',
               selected_plan = ?
           WHERE user_id = ?`,
          [trialStartedAt, trialEndsAt, requestedTier, barber.id, requestedTier, req.user.id]
        ).catch(() => {});
        await client.run(
          `INSERT INTO subscription_events (user_id, business_id, event_type, plan_id, status, metadata)
           VALUES (?, ?, 'trial_started', ?, 'trialing', ?)`,
          [req.user.id, barber.id, requestedTier, JSON.stringify({ trialEndsAt })]
        ).catch(() => {});
        return {
          subscription: await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [insertResult.lastID]),
          payment: {
            provider: "trial",
            internal_reference: "",
            status: "trialing",
            gross_amount: 0,
          },
          barber: await getOwnedBarber(req.user.id, client),
          trialStarted: true,
        };
      }

      const latestSubscription = await getLatestSubscription(barber.id, client);
      if (idempotencyKey) {
        const duplicate = await client.get(
          `SELECT * FROM payment_transactions
           WHERE barber_id = ?
             AND transaction_type = 'subscription_payment'
             AND idempotency_key = ?
           ORDER BY id DESC
           LIMIT 1`,
          [barber.id, idempotencyKey]
        );

        if (duplicate) {
          return {
            subscription: latestSubscription,
            payment: duplicate,
            barber,
          };
        }
      }

      const phoneNumber = normalizePhoneNumber(req.body.payment_phone || req.body.phoneNumber || barber.phone || "");
      if (!phoneNumber) {
        throw httpError(400, "Add a valid phone number before upgrading.");
      }
      const paymentReference = createReference("subscription", barber.id);
      const promoResult = await resolveProviderPromo({
        client,
        userId: req.user.id,
        barberId: barber.id,
        rawCode: req.body.promoCode || req.body.promo_code || "",
        price,
      });
      const payableAmount = promoResult.finalAmount;
      const paymentMetadata = {
        ...(promoResult.promo ? { promo: promoResult.promo } : {}),
        officialPrice: price,
        payableAmount,
        discountAmount: promoResult.discountAmount,
      };

      if (payableAmount <= 0) {
        const activatedAt = new Date().toISOString();
        const expiresAt = getSubscriptionEndDate(activatedAt, billingCycle);
        const insertResult = await client.run(
          `INSERT INTO barber_subscriptions
           (barber_id, tier, price, status, payment_reference, provider, billing_cycle, amount_paid, currency, payment_status, is_active, started_at, expires_at, activated_at)
           VALUES (?, ?, ?, 'active', ?, 'promo', ?, 0, 'UGX', 'paid', 1, ?, ?, ?)`,
          [barber.id, tierConfig.code, price, paymentReference, billingCycle, activatedAt, expiresAt, activatedAt]
        );
        await client.run(
          `INSERT INTO payment_transactions
           (barber_id, user_id, subscription_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, currency, status, metadata)
           VALUES (?, ?, ?, 'subscription_payment', 'promo', ?, '', ?, ?, 0, 'UGX', 'successful', ?)`,
          [barber.id, req.user.id, insertResult.lastID, paymentReference, idempotencyKey, phoneNumber || "", JSON.stringify(paymentMetadata)]
        );
        await client.run(
          `UPDATE barbers
           SET subscription_tier = ?,
               selected_plan = ?,
               subscription_status = 'active',
               subscription_expires_at = ?,
               business_status = 'active',
               is_published = 1
           WHERE id = ?`,
          [tierConfig.code, tierConfig.id, expiresAt, barber.id]
        );
        return {
          subscription: await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [insertResult.lastID]),
          payment: {
            provider: "promo",
            internal_reference: paymentReference,
            status: "successful",
            gross_amount: 0,
          },
          barber: await getOwnedBarber(req.user.id, client),
          promoActivated: true,
        };
      }

      const collection = await getMobileMoneyService(provider).initiateCollection({
        provider,
        amount: payableAmount,
        phoneNumber,
        reference: paymentReference,
        description: `${tierConfig.name} ${billingCycle} plan upgrade`,
      });

      const startedAt = new Date();
      const expiresAt = getSubscriptionEndDate(startedAt, billingCycle);
      const insertResult = await client.run(
        `INSERT INTO barber_subscriptions
         (barber_id, tier, price, status, payment_reference, provider, billing_cycle, amount_paid, currency, payment_status, expires_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 'UGX', 'pending', ?)`,
        [barber.id, tierConfig.code, price, paymentReference, provider, billingCycle, payableAmount, expiresAt]
      );

      await client.run(
        `INSERT INTO payment_transactions
         (barber_id, user_id, subscription_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, currency, status, metadata)
         VALUES (?, ?, ?, 'subscription_payment', ?, ?, ?, ?, ?, ?, 'UGX', ?, ?)`,
        [
          barber.id,
          req.user.id,
          insertResult.lastID,
          provider,
          paymentReference,
          collection.providerReference || "",
          idempotencyKey,
          phoneNumber || "",
          payableAmount,
          collection.status || "pending",
          JSON.stringify({ ...paymentMetadata, providerResponse: collection.rawResponse || {} }),
        ]
      );

      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE subscription_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [insertResult.lastID]
      );

      const subscription = await client.get(
        `SELECT * FROM barber_subscriptions WHERE id = ?`,
        [insertResult.lastID]
      );

      return {
        subscription,
        payment,
        barber,
      };
    });

    res.status(201).json({
      success: true,
      message: result.trialStarted
        ? `Your ${tierConfig.name} free trial is active. Your business is now visible to customers.`
        : result.promoActivated
        ? "Payment successful. Your business is now active on Queless."
        : `Approve the ${getMobileMoneyProviderLabel(result.payment.provider)} prompt to activate ${requestedTier}.`,
      subscription: mapSubscription(result.subscription, result.barber),
      payment: {
        reference: result.payment.internal_reference,
        status: result.payment.status,
        provider: result.payment.provider,
        amount: Number(result.payment.gross_amount || 0),
        billingCycle: result.subscription?.billing_cycle || billingCycle,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function verifySubscriptionUpgrade(req, res, next) {
  try {
    const reference = String(req.body.reference || req.params.reference || "").trim();
    if (!reference) {
      throw httpError(400, "Payment reference is required.");
    }

    if (req.user?.role === "admin") {
      return res.status(200).json({
        success: true,
        adminPreview: true,
        message: "Admin payment preview completed. No real subscription was changed.",
        subscription: mapAdminPreviewSubscription(req.body.tier || "PLATINUM"),
      });
    }

    const result = await transaction(async (client) => {
      const barber = await getOwnedBarber(req.user.id, client);
      if (!barber) {
        throw httpError(404, "Barber profile not found.");
      }

      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE barber_id = ?
           AND transaction_type = 'subscription_payment'
           AND internal_reference = ?
         ORDER BY id DESC
         LIMIT 1`,
        [barber.id, reference]
      );

      if (!payment) {
        throw httpError(404, "Subscription payment not found.");
      }
      const pendingSubscription = await client.get(
        `SELECT * FROM barber_subscriptions WHERE id = ?`,
        [payment.subscription_id]
      );
      if (!pendingSubscription) {
        throw httpError(409, "This subscription payment is missing its subscription record.");
      }
      if (String(payment.status || "").trim().toLowerCase() === "successful") {
        const paidExpiry = pendingSubscription.expires_at ? new Date(pendingSubscription.expires_at) : null;
        const isCurrentPaid =
          String(pendingSubscription.status || "").trim().toLowerCase() === "active" &&
          ["paid", "successful"].includes(String(pendingSubscription.payment_status || "").trim().toLowerCase()) &&
          paidExpiry &&
          Number.isFinite(paidExpiry.getTime()) &&
          paidExpiry.getTime() > Date.now();
        if (!isCurrentPaid) {
          throw httpError(409, "This subscription payment is no longer attached to a valid active subscription period.");
        }
        return {
          barber: await getOwnedBarber(req.user.id, client),
          subscription: pendingSubscription,
        };
      }
      if (String(pendingSubscription.status || "").trim().toLowerCase() !== "pending") {
        throw httpError(409, "This subscription payment can no longer activate the current business state.");
      }
      const pendingExpiry = pendingSubscription.expires_at ? new Date(pendingSubscription.expires_at) : null;
      if (!pendingExpiry || !Number.isFinite(pendingExpiry.getTime()) || pendingExpiry.getTime() <= Date.now()) {
        throw httpError(409, "This subscription payment window has expired. Start a fresh upgrade.");
      }

      const verification = await getMobileMoneyService(payment.provider).verifyTransaction({
        providerReference: payment.provider_reference,
        reference: payment.internal_reference,
        amount: payment.gross_amount,
        provider: payment.provider,
      });

      if (!verification.success) {
        throw httpError(402, "Payment was not completed. Your business has been saved, but it will only go live after payment.");
      }

      await client.run(
        `UPDATE payment_transactions
         SET status = 'successful',
             provider_reference = ?,
             metadata = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          verification.providerReference || payment.provider_reference || "",
          JSON.stringify(verification.rawResponse || {}),
          payment.id,
        ]
      );
      await client.run(
        `UPDATE barber_subscriptions
         SET status = 'expired',
             is_active = 0,
             expires_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE barber_id = ?
           AND id <> ?
           AND LOWER(status) IN ('active', 'trialing')
           AND expires_at IS NOT NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [barber.id, payment.subscription_id]
      );

      await client.run(
        `UPDATE barber_subscriptions
         SET status = 'active',
             payment_status = 'paid',
             is_active = 1,
             activated_at = CURRENT_TIMESTAMP,
             started_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payment.subscription_id]
      );

      const subscription = await client.get(
        `SELECT * FROM barber_subscriptions WHERE id = ?`,
        [payment.subscription_id]
      );

      await client.run(
        `UPDATE barbers
         SET subscription_tier = ?,
             subscription_status = 'active',
             subscription_expires_at = ?,
             business_status = 'active',
             is_published = 1,
             featured_until = CASE WHEN ? IN ('PREMIUM', 'PLATINUM') THEN ? ELSE featured_until END
         WHERE id = ?`,
        [
          subscription.tier,
          subscription.expires_at,
          subscription.tier,
          subscription.expires_at,
          barber.id,
        ]
      );
      await client.run(
        `UPDATE profiles
         SET subscription_status = 'active',
             selected_plan = ?
         WHERE user_id = ?`,
        [subscription.tier, req.user.id]
      ).catch(() => {});
      await client.run(
        `INSERT INTO subscription_events (user_id, business_id, event_type, plan_id, status, metadata)
         VALUES (?, ?, 'subscription_started', ?, 'active', ?)`,
        [req.user.id, barber.id, subscription.tier, JSON.stringify({ expiresAt: subscription.expires_at })]
      ).catch(() => {});

      return {
        barber: await getOwnedBarber(req.user.id, client),
        subscription,
      };
    });

    res.status(200).json({
      success: true,
      message: "Payment successful. Your business is now active on Queless.",
      subscription: mapSubscription(result.subscription, result.barber),
    });
  } catch (error) {
    next(error);
  }
}
