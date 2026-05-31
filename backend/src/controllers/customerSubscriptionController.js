import { env } from "../config/env.js";
import { transaction } from "../db/query.js";
import { getMobileMoneyService } from "../services/mobileMoneyService.js";
import {
  createReference,
  getMobileMoneyProviderLabel,
  normalizeBillingCycle,
  normalizeUgandaPhoneNumber,
} from "../services/paymentService.js";
import {
  getCustomerPremiumPlan,
  getCustomerPremiumPrice,
  getActiveCustomerPremiumSubscription,
  getCustomerSubscriptionEndDate,
  getLatestCustomerSubscription,
  getPendingCustomerPremiumPayment,
  isActiveCustomerPremium,
  mapCustomerSubscription,
} from "../services/customerSubscriptionService.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeProvider(value) {
  const provider = String(value || "mtn_mobile_money").trim().toLowerCase();
  return ["mtn_mobile_money", "airtel_money"].includes(provider) ? provider : "";
}

function isFutureDate(value) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

export async function getMyCustomerSubscription(req, res, next) {
  try {
    const activeSubscription = await getActiveCustomerPremiumSubscription(req.user.id);
    const latestSubscription = activeSubscription || await getLatestCustomerSubscription(req.user.id);
    const pendingPayment = await getPendingCustomerPremiumPayment(req.user.id);
    res.json({
      success: true,
      plan: getCustomerPremiumPlan(),
      subscription: mapCustomerSubscription(latestSubscription),
      pendingPayment: pendingPayment ? {
        reference: pendingPayment.internal_reference,
        status: pendingPayment.status,
        provider: pendingPayment.provider,
        amount: Number(pendingPayment.gross_amount || pendingPayment.price || 0),
        currency: pendingPayment.currency || "UGX",
        billingCycle: pendingPayment.billing_cycle || "monthly",
      } : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function startCustomerSubscriptionUpgrade(req, res, next) {
  try {
    const billingCycle = normalizeBillingCycle(req.body.billingCycle || req.body.billing_cycle || "monthly") || "monthly";
    const provider = normalizeProvider(req.body.provider || req.body.method);
    const price = getCustomerPremiumPrice(billingCycle);
    const plan = getCustomerPremiumPlan();

    if (!provider) throw httpError(400, "Choose MTN Mobile Money or Airtel Money.");
    if (provider === "airtel_money" && !env.airtelEnabled) throw httpError(503, "Airtel Money for Customer Premium is coming soon.");
    if (!price || price <= 0) throw httpError(400, "Customer Premium price is not configured.");

    const phoneNumber = normalizeUgandaPhoneNumber(req.body.payment_phone || req.body.phoneNumber || "");
    if (!phoneNumber) {
      throw httpError(400, "Enter a valid Uganda phone number before upgrading to Premium.");
    }

    const idempotencyKey = String(req.get("Idempotency-Key") || req.body.idempotencyKey || "").trim();
    const result = await transaction(async (client) => {
      const activeSubscription = await getActiveCustomerPremiumSubscription(req.user.id, client);
      if (activeSubscription) {
        return { payment: null, subscription: activeSubscription, active: true };
      }

      if (idempotencyKey) {
        const existing = await client.get(
          `SELECT * FROM payment_transactions
           WHERE user_id = ?
             AND transaction_type = 'customer_subscription_payment'
             AND idempotency_key = ?
           ORDER BY id DESC
           LIMIT 1`,
          [req.user.id, idempotencyKey]
        );
        if (existing) {
          const existingSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [existing.customer_subscription_id]);
          return { payment: existing, subscription: existingSubscription, duplicate: true };
        }
      }

      const pendingPayment = await getPendingCustomerPremiumPayment(req.user.id, client);
      if (pendingPayment) {
        const pendingSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [pendingPayment.customer_subscription_id]);
        return { payment: pendingPayment, subscription: pendingSubscription, duplicate: true, pending: true };
      }

      const reference = createReference("customer-premium", req.user.id);
      const collection = await getMobileMoneyService(provider).initiateCollection({
        provider,
        amount: price,
        phoneNumber,
        reference,
        description: `${plan.name} ${billingCycle} plan`,
      });

      const startedAt = new Date();
      const expiresAt = getCustomerSubscriptionEndDate(startedAt, billingCycle);
      const insertResult = await client.run(
        `INSERT INTO customer_subscriptions
         (user_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, payment_reference, provider, expires_at)
         VALUES (?, 'PREMIUM', ?, 'pending', ?, ?, ?, 'pending', ?, ?, ?)`,
        [req.user.id, price, billingCycle, price, plan.currency || env.customerPremiumCurrency || "UGX", reference, provider, expiresAt]
      );

      await client.run(
        `INSERT INTO payment_transactions
         (user_id, customer_subscription_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, currency, status, metadata)
         VALUES (?, ?, 'customer_subscription_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          insertResult.lastID,
          provider,
          reference,
          collection.providerReference || "",
          idempotencyKey,
          phoneNumber || "",
          price,
          plan.currency || "UGX",
          collection.status || "pending",
          JSON.stringify(collection.rawResponse || {}),
        ]
      );

      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE customer_subscription_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [insertResult.lastID]
      );
      const subscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [insertResult.lastID]);
      return { payment, subscription };
    });

    res.status(result.duplicate || result.active ? 200 : 201).json({
      success: true,
      message: result.active
        ? "Customer Premium is already active. Smart Match is unlocked."
        : result.pending
        ? `You already have a pending Customer Premium payment. Approve the ${getMobileMoneyProviderLabel(result.payment.provider)} prompt or verify it from your profile.`
        : `Approve the ${getMobileMoneyProviderLabel(result.payment.provider)} prompt to activate Customer Premium.`,
      subscription: mapCustomerSubscription(result.subscription),
      payment: result.payment ? {
        reference: result.payment.internal_reference,
        status: result.payment.status,
        provider: result.payment.provider,
        amount: Number(result.payment.gross_amount || 0),
        billingCycle: result.subscription?.billing_cycle || billingCycle,
      } : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyCustomerSubscriptionUpgrade(req, res, next) {
  try {
    const reference = String(req.body.reference || req.params.reference || "").trim();
    if (!reference) throw httpError(400, "Payment reference is required.");

    const result = await transaction(async (client) => {
      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE user_id = ?
           AND transaction_type = 'customer_subscription_payment'
           AND internal_reference = ?
         ORDER BY id DESC
         LIMIT 1`,
        [req.user.id, reference]
      );
      if (!payment) throw httpError(404, "Customer Premium payment not found.");
      if (payment.status === "successful") {
        const subscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [payment.customer_subscription_id]);
        if (!isActiveCustomerPremium(subscription)) {
          throw httpError(409, "This Customer Premium payment is no longer attached to a valid active Premium period.");
        }
        return { subscription, payment };
      }
      const pendingSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [payment.customer_subscription_id]);
      if (!pendingSubscription) throw httpError(409, "This Customer Premium payment is missing its subscription record.");
      if (String(pendingSubscription.status || "").trim().toLowerCase() !== "pending") {
        throw httpError(409, "This Customer Premium payment can no longer activate the current account state.");
      }
      if (!isFutureDate(pendingSubscription.expires_at)) {
        throw httpError(409, "This Customer Premium payment window has expired. Start a fresh upgrade.");
      }
      const verification = await getMobileMoneyService(payment.provider).verifyTransaction({
        providerReference: payment.provider_reference,
        reference: payment.internal_reference,
        amount: payment.gross_amount,
        provider: payment.provider,
      });
      if (!verification.success) throw httpError(402, "Customer Premium payment has not completed yet.");

      await client.run(
        `UPDATE payment_transactions
         SET status = 'successful', provider_reference = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [verification.providerReference || payment.provider_reference || "", JSON.stringify(verification.rawResponse || {}), payment.id]
      );
      await client.run(
        `UPDATE customer_subscriptions
         SET status = 'expired',
             payment_status = CASE
               WHEN LOWER(COALESCE(payment_status, '')) IN ('paid', 'successful', 'trial', 'trialing', 'free_trial') THEN payment_status
               ELSE 'expired'
             END,
             expires_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND id <> ?
           AND UPPER(tier) = 'PREMIUM'
           AND LOWER(status) IN ('active', 'trialing')
           AND expires_at IS NOT NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [req.user.id, payment.customer_subscription_id]
      );
      await client.run(
        `UPDATE customer_subscriptions
         SET status = 'active', payment_status = 'paid', started_at = CURRENT_TIMESTAMP, activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payment.customer_subscription_id]
      );
      const subscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [payment.customer_subscription_id]);
      return { subscription, payment: { ...payment, status: "successful" } };
    });

    res.json({
      success: true,
      message: "Customer Premium is active. Smart Match is unlocked.",
      subscription: mapCustomerSubscription(result.subscription),
      payment: {
        reference,
        status: result.payment.status,
        provider: result.payment.provider,
      },
    });
  } catch (error) {
    next(error);
  }
}
