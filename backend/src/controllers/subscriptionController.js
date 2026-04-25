import { get, run, transaction } from "../db/query.js";
import {
  createReference,
  getMobileMoneyProviderLabel,
  getSubscriptionTierConfig,
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

async function getOwnedBarber(userId, client = { get }) {
  return client.get(
    `SELECT b.*, p.phone
     FROM barbers b
     LEFT JOIN profiles p ON p.user_id = b.owner_user_id
     WHERE b.owner_user_id = ?`,
    [userId]
  );
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
  const tierConfig = getSubscriptionTierConfig(subscription?.tier || barber?.subscription_tier || "FREE");
  return {
    tier: tierConfig.code,
    name: tierConfig.name,
    price: Number(subscription?.price ?? tierConfig.price ?? 0),
    status: subscription?.status || barber?.subscription_status || "active",
    started_at: subscription?.started_at || null,
    expires_at: subscription?.expires_at || barber?.subscription_expires_at || null,
    activated_at: subscription?.activated_at || null,
    features: {
      rankingWeight: tierConfig.rankingWeight,
      analyticsLevel: tierConfig.analyticsLevel,
      homepageFeatured: tierConfig.homepageFeatured,
      searchPriority: tierConfig.searchPriority,
      topBarberBadge: tierConfig.topBarberBadge,
      promotionsEnabled: tierConfig.promotionsEnabled,
      marketingPushEnabled: tierConfig.marketingPushEnabled,
      profileCustomizationLevel: tierConfig.profileCustomizationLevel,
    },
  };
}

export async function getMySubscription(req, res, next) {
  try {
    const barber = await getOwnedBarber(req.user.id);
    if (!barber) {
      throw httpError(404, "Barber profile not found.");
    }

    const subscription = await getLatestSubscription(barber.id);

    res.status(200).json({
      success: true,
      subscription: mapSubscription(subscription, barber),
      tiers: Object.values({
        FREE: getSubscriptionTierConfig("FREE"),
        STANDARD: getSubscriptionTierConfig("STANDARD"),
        PREMIUM: getSubscriptionTierConfig("PREMIUM"),
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function startSubscriptionUpgrade(req, res, next) {
  try {
    const requestedTier = String(req.body.tier || "").trim().toUpperCase();
    const provider = String(req.body.provider || "mtn_mobile_money").trim().toLowerCase();
    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);

    if (!["STANDARD", "PREMIUM"].includes(requestedTier)) {
      throw httpError(400, "Choose STANDARD or PREMIUM.");
    }

    const tierConfig = getSubscriptionTierConfig(requestedTier);

    const result = await transaction(async (client) => {
      const barber = await getOwnedBarber(req.user.id, client);
      if (!barber) {
        throw httpError(404, "Barber profile not found.");
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

      const phoneNumber = normalizePhoneNumber(req.body.payment_phone || barber.phone || "");
      if (!phoneNumber) {
        throw httpError(400, "Add a valid barber phone number before upgrading.");
      }

      const paymentReference = createReference("subscription", barber.id);
      const collection = await getMobileMoneyService(provider).initiateCollection({
        provider,
        amount: tierConfig.price,
        phoneNumber,
        reference: paymentReference,
        description: `${tierConfig.name} plan upgrade`,
      });

      const insertResult = await client.run(
        `INSERT INTO barber_subscriptions
         (barber_id, tier, price, status, payment_reference, provider, expires_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
        [barber.id, tierConfig.code, tierConfig.price, paymentReference, provider, addDays(30)]
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
          phoneNumber,
          tierConfig.price,
          collection.status || "pending",
          JSON.stringify(collection.rawResponse || {}),
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
      message: `Approve the ${getMobileMoneyProviderLabel(result.payment.provider)} prompt to activate ${requestedTier}.`,
      subscription: mapSubscription(result.subscription, result.barber),
      payment: {
        reference: result.payment.internal_reference,
        status: result.payment.status,
        provider: result.payment.provider,
        amount: Number(result.payment.gross_amount || 0),
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

      const verification = await getMobileMoneyService(payment.provider).verifyTransaction({
        providerReference: payment.provider_reference,
        reference,
        amount: payment.gross_amount,
        provider: payment.provider,
      });

      if (!verification.success) {
        throw httpError(402, "Subscription payment has not completed yet.");
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
         SET status = 'active',
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
             featured_until = CASE WHEN ? = 'PREMIUM' THEN ? ELSE featured_until END
         WHERE id = ?`,
        [
          subscription.tier,
          subscription.expires_at,
          subscription.tier,
          subscription.expires_at,
          barber.id,
        ]
      );

      return {
        barber: await getOwnedBarber(req.user.id, client),
        subscription,
      };
    });

    res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully.",
      subscription: mapSubscription(result.subscription, result.barber),
    });
  } catch (error) {
    next(error);
  }
}
