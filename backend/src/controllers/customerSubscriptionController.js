import { env } from "../config/env.js";
import crypto from "node:crypto";
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
  getFutureDateSqlPredicate,
  getLatestCustomerSubscription,
  getPendingCustomerPremiumPayment,
  isActiveCustomerPremium,
  mapCustomerSubscription,
} from "../services/customerSubscriptionService.js";

function httpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
    error.publicMessage = message;
  }
  return error;
}

function normalizeProvider(value) {
  const provider = String(value || "mtn_mobile_money").trim().toLowerCase();
  return ["mtn_mobile_money", "airtel_money"].includes(provider) ? provider : "";
}

const MTN_LOCAL_PREFIXES = ["76", "77", "78", "39"];
const AIRTEL_LOCAL_PREFIXES = ["70", "74", "75", "20"];

// Detect the network from a normalized +256 number, defending against a number
// that doesn't match the selected provider.
function detectMobileMoneyProvider(normalizedPhone) {
  const match = String(normalizedPhone || "").match(/^\+256(\d{2})/);
  if (!match) return "";
  const prefix = match[1];
  if (MTN_LOCAL_PREFIXES.includes(prefix)) return "mtn_mobile_money";
  if (AIRTEL_LOCAL_PREFIXES.includes(prefix)) return "airtel_money";
  return "";
}

function isFutureDate(value) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

function normalizePromoCode(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}

function hashPromoCode(value) {
  return crypto.createHash("sha256").update(normalizePromoCode(value)).digest("hex");
}

async function resolveCustomerPremiumPromo({ client, userId, rawCode, price }) {
  const code = normalizePromoCode(rawCode);
  if (!code) return { finalAmount: price, discountAmount: 0, promo: null };

  const expiresAt = env.customerPremiumPromoExpiresAt ? new Date(env.customerPremiumPromoExpiresAt) : null;
  if (env.customerPremiumPromoExpiresAt && (!expiresAt || !Number.isFinite(expiresAt.getTime()))) {
    throw httpError(400, "This promo code has expired.", "PROMO_CODE_EXPIRED");
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw httpError(400, "This promo code has expired.", "PROMO_CODE_EXPIRED");
  }

  const options = [
    env.customerPremiumPromoFreeCode ? { type: "free_customer_premium", code: normalizePromoCode(env.customerPremiumPromoFreeCode), discountPercent: 100 } : null,
    env.customerPremiumPromoPercentCode ? { type: "customer_premium_twenty_percent_off", code: normalizePromoCode(env.customerPremiumPromoPercentCode), discountPercent: 20 } : null,
  ].filter(Boolean);

  const matched = options.find((item) => item.code && item.code === code);
  if (!matched) {
    const providerCodes = [
      normalizePromoCode(env.providerPromoFreeCode),
      normalizePromoCode(env.providerPromoPercentCode),
    ].filter(Boolean);
    throw httpError(
      400,
      providerCodes.includes(code) ? "This promo code is not valid for this plan." : "Invalid promo code.",
      providerCodes.includes(code) ? "PROMO_PLAN_MISMATCH" : "INVALID_PROMO_CODE"
    );
  }

  const promoHash = hashPromoCode(code);
  const priorUse = await client.get(
    `SELECT id FROM customer_subscriptions
     WHERE user_id = ?
       AND CAST(metadata AS TEXT) LIKE ?
     LIMIT 1`,
    [userId, `%"promoHash":"${promoHash}"%`]
  ).catch(() => null);
  if (priorUse) throw httpError(409, "This promo code has already been used.", "PROMO_ALREADY_USED");

  const discountAmount = Math.min(price, Math.round((price * matched.discountPercent) / 100));
  return {
    finalAmount: Math.max(0, price - discountAmount),
    discountAmount,
    promo: {
      type: matched.type,
      discountPercent: matched.discountPercent,
      promoHash,
    },
  };
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
    if (req.user?.role && String(req.user.role).trim().toLowerCase() !== "customer") {
      throw httpError(403, "Customer Premium is only available for customer accounts. Please switch to a customer account to continue.");
    }
    const billingCycle = normalizeBillingCycle(req.body.billingCycle || req.body.billing_cycle || "monthly") || "monthly";
    const provider = normalizeProvider(req.body.provider || req.body.method);
    const price = getCustomerPremiumPrice(billingCycle);
    const plan = getCustomerPremiumPlan();
    const rawPromoCode = req.body.promoCode || req.body.promo_code || "";

    if (!price || price <= 0) {
      throw httpError(
        503,
        "Mobile money payments are not fully configured yet.",
        "MISSING_PAYMENT_CONFIG"
      );
    }

    const idempotencyKey = String(req.get("Idempotency-Key") || req.body.idempotencyKey || "").trim();
    const result = await transaction(async (client) => {
      const activeSubscription = await getActiveCustomerPremiumSubscription(req.user.id, client);
      if (activeSubscription) {
        return { payment: null, subscription: activeSubscription, active: true };
      }
      const promoResult = await resolveCustomerPremiumPromo({
        client,
        userId: req.user.id,
        rawCode: rawPromoCode,
        price,
      });
      const payableAmount = promoResult.finalAmount;
      const promoMetadata = {
        ...(promoResult.promo ? { promo: promoResult.promo } : {}),
        originalAmount: price,
        discountAmount: promoResult.discountAmount,
      };

      if (payableAmount === 0) {
        const startedAt = new Date();
        const expiresAt = getCustomerSubscriptionEndDate(startedAt, billingCycle);
        const insertResult = await client.run(
          `INSERT INTO customer_subscriptions
           (user_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, payment_reference, provider, started_at, expires_at, activated_at, metadata)
           VALUES (?, 'PREMIUM', ?, 'active', ?, 0, ?, 'paid', ?, 'promo', ?, ?, ?, ?)`,
          [
            req.user.id,
            price,
            billingCycle,
            plan.currency || env.customerPremiumCurrency || "UGX",
            createReference("customer-premium-promo", req.user.id),
            startedAt.toISOString(),
            expiresAt,
            startedAt.toISOString(),
            JSON.stringify(promoMetadata),
          ]
        );
        const subscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [insertResult.lastID]);
        return { payment: null, subscription, promoActivated: true };
      }

      if (!provider) throw httpError(400, "Choose MTN Mobile Money or Airtel Money.", "INVALID_PHONE_NUMBER");
      if (provider === "airtel_money" && !env.airtelEnabled) {
        throw httpError(503, "Airtel Money is not available yet. Please use MTN Mobile Money.", "PAYMENT_PROVIDER_UNAVAILABLE");
      }

      const phoneNumber = normalizeUgandaPhoneNumber(req.body.payment_phone || req.body.phoneNumber || "");
      if (!phoneNumber) {
        throw httpError(400, "Enter a valid Uganda mobile money number.", "INVALID_PHONE_NUMBER");
      }

      // Defense in depth: reject a number that doesn't match the chosen network.
      const detectedProvider = detectMobileMoneyProvider(phoneNumber);
      if (detectedProvider && detectedProvider !== provider) {
        const looksLike = detectedProvider === "mtn_mobile_money" ? "MTN" : "Airtel";
        const selectedLabel = getMobileMoneyProviderLabel(provider);
        throw httpError(400, `This number looks like ${looksLike}, but ${selectedLabel} is selected.`, "WRONG_PROVIDER_FOR_NUMBER");
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
      let collection;
      try {
        collection = await getMobileMoneyService(provider).initiateCollection({
          provider,
          amount: payableAmount,
          phoneNumber,
          reference,
          description: `${plan.name} ${billingCycle} plan`,
        });
      } catch (providerError) {
        const providerStatusCode = Number(
          providerError?.providerStatusCode || providerError?.statusCode || 0
        );
        const providerCode = String(
          providerError?.safeProviderCode || providerError?.code || ""
        )
          .replace(/[^A-Za-z0-9_.-]/g, "")
          .slice(0, 80);
        const providerMessage = String(providerError?.safeProviderMessage || "")
          .replace(/[\r\n\t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 220);

        // Log only the provider's controlled diagnostics. The original error
        // can contain raw provider payloads and must never be serialized here.
        req.log?.warn?.(
          {
            domain: "mobile_money",
            operation: "collection",
            provider: "mtn",
            reference,
            statusCode: providerStatusCode,
            providerCode,
            providerMessage,
          },
          "Customer Premium mobile money initiation failed"
        );

        if (providerError?.code === "MISSING_PAYMENT_CONFIG") {
          throw httpError(
            503,
            "Mobile money payments are not fully configured yet.",
            "MISSING_PAYMENT_CONFIG"
          );
        }

        throw httpError(
          503,
          "Payment service is temporarily unavailable. Please try again shortly.",
          "PAYMENT_PROVIDER_UNAVAILABLE"
        );
      }

      const startedAt = new Date();
      const expiresAt = getCustomerSubscriptionEndDate(startedAt, billingCycle);
      const insertResult = await client.run(
        `INSERT INTO customer_subscriptions
         (user_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, payment_reference, provider, expires_at, metadata)
         VALUES (?, 'PREMIUM', ?, 'pending', ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [req.user.id, price, billingCycle, payableAmount, plan.currency || env.customerPremiumCurrency || "UGX", reference, provider, expiresAt, JSON.stringify(promoMetadata)]
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
          payableAmount,
          plan.currency || "UGX",
          collection.status || "pending",
          JSON.stringify({ ...(collection.rawResponse || {}), ...promoMetadata }),
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
        : result.promoActivated
        ? "Customer Premium is active. Smart Match is unlocked."
        : result.pending
        ? `You already have a pending Customer Premium payment. Approve the ${getMobileMoneyProviderLabel(result.payment.provider)} prompt or verify it from your profile.`
        : `Approve the ${getMobileMoneyProviderLabel(result.payment.provider)} prompt to activate Customer Premium.`,
      plan,
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
           AND ${getFutureDateSqlPredicate("expires_at")}`,
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
