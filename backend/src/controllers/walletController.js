import { get, transaction } from "../db/query.js";
import { env } from "../config/env.js";
import { createReference, getMobileMoneyProviderLabel, normalizeMoneyAmount, normalizeUgandaPhoneNumber } from "../services/paymentService.js";
import { getMobileMoneyService } from "../services/mobileMoneyService.js";
import { mtnService } from "../services/mtn.service.js";
import { getBarberWalletSnapshot, createPayoutRequest, processPayoutRequest } from "../services/ledgerService.js";
import { sendPaymentNotification } from "../services/notificationService.js";
import { sendPaymentSmsFallback } from "../services/lifecycleSmsService.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toMoneyAmount(value, fieldName = "amount", minimum = 1000) {
  try {
    return normalizeMoneyAmount(value, fieldName, { minimum });
  } catch (error) {
    throw httpError(error.statusCode || 400, error.message);
  }
}

function toTopUpAmount(value) {
  return normalizeMoneyAmount(value, "Top-up amount", { minimum: 1000, maximum: 5000000 });
}

function mapTopupStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["successful", "success", "completed", "paid"].includes(normalized)) return "successful";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (normalized === "expired") return "expired";
  if (["failed", "rejected", "error"].includes(normalized)) return "failed";
  if (["initiated", "processing", "queued"].includes(normalized)) return "pending";
  if (["unknown", "not_found", "unreachable"].includes(normalized)) return "unknown";
  return "pending";
}

function isTerminalFailure(status) {
  return ["failed", "cancelled", "expired"].includes(String(status || "").toLowerCase());
}

async function verifyTopupCallbackStatus({ topup, providerReference = "", reference = "", expected = "successful" }) {
  const provider = String(topup?.provider || "mtn_mobile_money").trim().toLowerCase();
  const verification = await getMobileMoneyService(provider).verifyTransaction({
    provider,
    providerReference: providerReference || topup.provider_reference || topup.mtn_reference,
    reference: reference || topup.reference,
    amount: topup.amount,
  });
  const status = mapTopupStatus(verification.status);
  const accepted =
    expected === "successful"
      ? Boolean(verification.success) || status === "successful"
      : isTerminalFailure(status);

  return {
    accepted,
    status,
    providerReference: verification.providerReference || providerReference || topup.provider_reference || topup.mtn_reference || "",
    rawResponse: verification.rawResponse || {},
  };
}

function isWalletCredited(topup) {
  return topup?.wallet_credited === true || Number(topup?.wallet_credited || 0) === 1;
}

function topupStatusMessage(status) {
  if (status === "successful") return "Top-up successful. Your wallet balance has been updated.";
  if (status === "pending") return "Payment is still pending. Please approve the MTN prompt on your phone.";
  if (["failed", "cancelled", "expired"].includes(status)) return "Payment was not completed. Please try again.";
  return "We could not confirm this payment yet. Please check again shortly.";
}

function serializeTopup(topup) {
  const walletCredited = isWalletCredited(topup);
  const rawStatus = mapTopupStatus(topup?.status);
  const paymentStatus = rawStatus === "successful" && !walletCredited ? "unknown" : rawStatus;
  return {
    ...topup,
    paymentStatus,
    walletCredited,
    mtnReference: topup?.mtn_reference || topup?.provider_reference || "",
    externalTransactionId: topup?.external_transaction_id || topup?.reference || "",
  };
}

function buildTopupResponse(topup, message) {
  const serialized = serializeTopup(topup);
  return {
    transactionId: serialized.reference,
    paymentStatus: serialized.paymentStatus,
    walletCredited: serialized.walletCredited,
    message: message || topupStatusMessage(serialized.paymentStatus),
    topup: serialized,
  };
}

async function ensureCustomerWallet(userId, client) {
  let wallet = await client.get(`SELECT id, user_id, balance, created_at, updated_at FROM wallets WHERE user_id = ?`, [userId]);
  if (!wallet) {
    await client.run(
      `INSERT INTO wallets (user_id, balance) VALUES (?, 0) ON CONFLICT(user_id) DO NOTHING`,
      [userId]
    );
    wallet = await client.get(`SELECT id, user_id, balance, created_at, updated_at FROM wallets WHERE user_id = ?`, [userId]);
  }
  return wallet;
}

async function getCustomerWalletSnapshot(userId, client) {
  const wallet = await ensureCustomerWallet(userId, client);
  const transactions = await client.all(
    `SELECT id, booking_id, direction, balance_bucket, amount, reference, provider_reference, description, metadata, created_at
     FROM wallet_ledger
     WHERE owner_type = 'customer'
       AND owner_id = ?
     ORDER BY id DESC
     LIMIT 30`,
    [userId]
  );
  const topups = await client.all(
    `SELECT id, amount, method, provider, reference, provider_reference, wallet_credited, credited_at, mtn_reference, external_transaction_id, last_status_checked_at, error_message, status, created_at, updated_at
     FROM wallet_topups
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 10`,
    [userId]
  );
  return {
    wallet: {
      ...wallet,
      balance: Number(wallet?.balance || 0),
      currency: "UGX",
    },
    transactions,
    topups,
  };
}

async function creditSuccessfulTopup({ client, topup, providerReference = "", metadata = {} }) {
  if (isWalletCredited(topup)) {
    return false;
  }
  const existingCredit = await client.get(
    `SELECT id FROM wallet_ledger
     WHERE owner_type = 'customer'
       AND owner_id = ?
       AND reference = ?
       AND direction = 'credit'
     LIMIT 1`,
    [topup.user_id, topup.reference]
  );
  if (existingCredit) {
    await client.run(
      `UPDATE wallet_topups
       SET status = 'successful',
           wallet_credited = TRUE,
           credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP),
           provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
           mtn_reference = COALESCE(NULLIF(?, ''), mtn_reference),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [providerReference, providerReference, topup.id]
    );
    return false;
  }
  const wallet = await ensureCustomerWallet(topup.user_id, client);
  await client.run(
    `UPDATE wallets
     SET balance = balance + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [Number(topup.amount || 0), wallet.id]
  );
  await client.run(
    `UPDATE wallet_topups
     SET status = 'successful',
         provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
         mtn_reference = COALESCE(NULLIF(?, ''), mtn_reference),
         wallet_credited = TRUE,
         credited_at = COALESCE(credited_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [providerReference, providerReference, topup.id]
  );
  await client.run(
    `UPDATE payment_transactions
     SET status = 'successful',
         provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
         metadata = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE internal_reference = ?`,
    [providerReference, JSON.stringify(metadata || {}), topup.reference]
  );
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, direction, balance_bucket, amount, reference, provider_reference, description, metadata)
     VALUES ('customer', ?, 'credit', 'available', ?, ?, ?, ?, ?)`,
    [
      topup.user_id,
      Number(topup.amount || 0),
      topup.reference,
      providerReference,
      "Customer wallet top-up",
      JSON.stringify(metadata || {}),
    ]
  );
  return true;
}

export async function getCustomerWallet(req, res, next) {
  try {
    const snapshot = await transaction((client) => getCustomerWalletSnapshot(req.user.id, client));
    res.status(200).json({ success: true, ...snapshot });
  } catch (error) {
    next(error);
  }
}

export async function initiateCustomerWalletTopup(req, res, next) {
  try {
    const amount = toTopUpAmount(req.body.amount);
    const provider = String(req.body.provider || req.body.method || "mtn_mobile_money").trim().toLowerCase();
    const phoneNumber = normalizeUgandaPhoneNumber(req.body.phoneNumber || req.body.phone_number || "");
    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);

    if (!["mtn_mobile_money", "airtel_money"].includes(provider)) {
      throw httpError(400, "Choose MTN Mobile Money or Airtel Money.");
    }
    if (provider === "airtel_money" && !env.airtelEnabled) {
      throw httpError(503, "Airtel Money wallet top-up is coming soon.");
    }
    if (!phoneNumber) {
      throw httpError(400, `Enter a valid Uganda phone number for ${getMobileMoneyProviderLabel(provider)}, for example 0772123456.`);
    }

    const usingDevMockPayments = env.mobileMoneyMode === "mock" && env.enableMockPayments && env.nodeEnv !== "production";
    if (env.mobileMoneyMode === "mock" && !usingDevMockPayments) {
      throw httpError(503, `${getMobileMoneyProviderLabel(provider)} is currently unavailable. Wallet top-up cannot be completed on this deployment.`);
    }

    if (!usingDevMockPayments && provider === "mtn_mobile_money") {
      const health = await mtnService.getHealth();
      if (!health.credentialsLoaded || !health.callbackConfigured || health.authStatus !== "success") {
        throw httpError(503, "MTN Mobile Money is currently unavailable. Wallet top-up cannot be completed on this deployment.");
      }
    }

    const result = await transaction(async (client) => {
      const wallet = await ensureCustomerWallet(req.user.id, client);
      if (idempotencyKey) {
        const existing = await client.get(
          `SELECT * FROM wallet_topups WHERE user_id = ? AND idempotency_key = ? ORDER BY id DESC LIMIT 1`,
          [req.user.id, idempotencyKey]
        );
        if (existing) return { wallet, topup: existing, alreadyStarted: true };
      }

      const reference = createReference("wallet-topup", req.user.id);
      await client.run(
        `INSERT INTO wallet_topups
         (user_id, wallet_id, amount, method, provider, reference, status, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [req.user.id, wallet.id, amount, provider, provider, reference, idempotencyKey]
      );
      await client.run(
        `INSERT INTO payment_transactions
         (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
         VALUES (NULL, NULL, ?, 'wallet_topup', ?, ?, '', ?, ?, ?, 0, ?, 'UGX', 'pending', ?)`,
        [req.user.id, provider, reference, idempotencyKey, phoneNumber, amount, amount, JSON.stringify({ source: "customer_wallet_topup" })]
      );

      const providerResult = await getMobileMoneyService(provider).initiateCollection({
        provider,
        amount,
        phoneNumber,
        reference,
        description: "Queless customer wallet top-up",
        callbackUrl:
          provider === "airtel_money"
            ? env.airtelCallbackUrl || env.airtelWebhookUrl
            : env.mtnCallbackUrl || env.mobileMoneyCallbackUrl,
      });
      const providerStatus = mapTopupStatus(providerResult.status);
      const status = providerStatus === "successful" ? "pending" : providerStatus;
      const providerReference = providerResult.providerReference || "";
      const externalTransactionId = providerResult.rawResponse?.externalId || reference;
      await client.run(
        `UPDATE wallet_topups
         SET status = ?,
             provider_reference = ?,
             mtn_reference = ?,
             external_transaction_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE reference = ?`,
        [status, providerReference, providerReference, externalTransactionId, reference]
      );
      await client.run(
        `UPDATE payment_transactions
         SET status = ?,
             provider_reference = ?,
             metadata = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE internal_reference = ?`,
        [status, providerReference, JSON.stringify(providerResult.rawResponse || {}), reference]
      );
      return {
        wallet,
        topup: await client.get(`SELECT * FROM wallet_topups WHERE reference = ?`, [reference]),
      };
    });

    res.status(201).json({
      success: true,
      already_started: Boolean(result.alreadyStarted),
      ...buildTopupResponse(
        result.topup,
        result.alreadyStarted
          ? `Payment is still pending. Please approve the ${getMobileMoneyProviderLabel(result.topup.provider)} prompt on your phone.`
          : `Payment request sent. Please check your phone and enter your ${getMobileMoneyProviderLabel(result.topup.provider)} PIN to approve.`
      ),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerWalletTopupStatus(req, res, next) {
  try {
    const reference = String(req.params.reference || "").trim();
    if (!reference) throw httpError(400, "Top-up reference is required.");

    const result = await transaction(async (client) => {
      const topup = await client.get(`SELECT * FROM wallet_topups WHERE reference = ? AND user_id = ?`, [reference, req.user.id]);
      if (!topup) throw httpError(404, "Top-up not found.");
      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE internal_reference = ?
           AND user_id = ?
           AND transaction_type = 'wallet_topup'
         LIMIT 1`,
        [topup.reference, req.user.id]
      );
      if (!payment) throw httpError(404, "Top-up payment record not found.");
      if (Number(payment.gross_amount || 0) !== Number(topup.amount || 0)) {
        throw httpError(409, "Top-up payment amount mismatch.");
      }

      const currentStatus = mapTopupStatus(topup.status);
      if (currentStatus === "successful") {
        return { topup, snapshot: isWalletCredited(topup) ? await getCustomerWalletSnapshot(req.user.id, client) : null };
      }
      if (isTerminalFailure(currentStatus)) {
        return { topup, snapshot: null };
      }

      const provider = String(topup.provider || payment.provider || "mtn_mobile_money").trim().toLowerCase();
      const providerReference = String(topup.provider_reference || topup.mtn_reference || payment.provider_reference || "").trim();
      if (!providerReference) {
        await client.run(
          `UPDATE wallet_topups
           SET status = 'unknown',
               last_status_checked_at = CURRENT_TIMESTAMP,
              error_message = 'Missing provider reference',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [topup.id]
        );
        await client.run(
          `UPDATE payment_transactions SET status = 'unknown', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [payment.id]
        );
        return {
          topup: await client.get(`SELECT * FROM wallet_topups WHERE id = ?`, [topup.id]),
          snapshot: null,
          message: "This transaction was not properly initiated with the payment provider.",
        };
      }

      let verification;
      try {
        verification = await getMobileMoneyService(provider).verifyTransaction({
          provider,
          providerReference,
          reference: topup.reference,
          amount: topup.amount,
        });
      } catch (error) {
        await client.run(
          `UPDATE wallet_topups
           SET last_status_checked_at = CURRENT_TIMESTAMP,
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [error.message || "Could not reach MTN status service.", topup.id]
        );
        return {
          topup: await client.get(`SELECT * FROM wallet_topups WHERE id = ?`, [topup.id]),
          snapshot: null,
          message: "We could not confirm this payment yet. Please check again shortly.",
        };
      }

      const status = mapTopupStatus(verification.status);
      const rawResponse = verification.rawResponse || {};
      const isMockSuccess = rawResponse.mock === true || String(verification.providerReference || providerReference).startsWith("mock-");
      const mockPaymentsAllowed = env.enableMockPayments && env.nodeEnv !== "production";
      if ((verification.success || status === "successful") && !(isMockSuccess && !mockPaymentsAllowed)) {
        await creditSuccessfulTopup({
          client,
          topup,
          providerReference: verification.providerReference || providerReference,
          metadata: rawResponse,
        });
      } else if (isTerminalFailure(status)) {
        await client.run(
          `UPDATE wallet_topups
           SET status = ?,
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               mtn_reference = COALESCE(NULLIF(?, ''), mtn_reference),
               last_status_checked_at = CURRENT_TIMESTAMP,
               error_message = '',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [status, verification.providerReference || providerReference, verification.providerReference || providerReference, topup.id]
        );
        await client.run(
          `UPDATE payment_transactions
           SET status = ?,
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [status, verification.providerReference || providerReference, JSON.stringify(rawResponse), payment.id]
        );
      } else {
        const safeStatus = isMockSuccess && !mockPaymentsAllowed ? "unknown" : status;
        await client.run(
          `UPDATE wallet_topups
           SET status = ?,
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               mtn_reference = COALESCE(NULLIF(?, ''), mtn_reference),
               last_status_checked_at = CURRENT_TIMESTAMP,
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            safeStatus,
            verification.providerReference || providerReference,
            verification.providerReference || providerReference,
            isMockSuccess && !mockPaymentsAllowed ? "Mock payment verification is not enabled for wallet top-ups." : "",
            topup.id,
          ]
        );
        await client.run(
          `UPDATE payment_transactions
           SET status = ?,
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [safeStatus, verification.providerReference || providerReference, JSON.stringify(rawResponse), payment.id]
        );
      }
      const refreshedTopup = await client.get(`SELECT * FROM wallet_topups WHERE id = ?`, [topup.id]);
      return {
        topup: refreshedTopup,
        snapshot: mapTopupStatus(refreshedTopup?.status) === "successful" && isWalletCredited(refreshedTopup)
          ? await getCustomerWalletSnapshot(req.user.id, client)
          : null,
      };
    });

    const responsePayload = buildTopupResponse(result.topup, result.message);
    if (responsePayload.paymentStatus === "successful") {
      const pushResult = await sendPaymentNotification({
        userId: req.user.id,
        title: "Top-up successful",
        body: "Your wallet top-up was successful and your balance has been updated.",
        paymentId: result.topup?.id,
        status: "successful",
        type: "wallet",
      }).catch(() => {});
      await sendPaymentSmsFallback({
        userId: req.user.id,
        paymentId: result.topup?.id,
        status: "successful",
        title: "Top-up successful",
        body: "Your wallet top-up was successful and your balance has been updated.",
        type: "wallet",
        pushResult,
      });
    } else if (["failed", "cancelled", "expired"].includes(responsePayload.paymentStatus)) {
      const pushResult = await sendPaymentNotification({
        userId: req.user.id,
        title: "Top-up failed",
        body: "Your wallet top-up was not completed. Please try again.",
        paymentId: result.topup?.id,
        status: responsePayload.paymentStatus,
        type: "wallet",
      }).catch(() => {});
      await sendPaymentSmsFallback({
        userId: req.user.id,
        paymentId: result.topup?.id,
        status: responsePayload.paymentStatus,
        title: "Top-up failed",
        body: "Your wallet top-up was not completed. Please try again.",
        type: "wallet",
        pushResult,
      });
    }

    res.status(200).json({ success: true, ...(result.snapshot || {}), ...responsePayload });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerWalletTransactions(req, res, next) {
  try {
    const snapshot = await transaction((client) => getCustomerWalletSnapshot(req.user.id, client));
    res.status(200).json({ success: true, transactions: snapshot.transactions, topups: snapshot.topups });
  } catch (error) {
    next(error);
  }
}

export async function handleCustomerWalletTopupWebhook({ client, providerReference = "", reference = "", status = "", payload = {} }) {
  const topup = await client.get(
    `SELECT * FROM wallet_topups
     WHERE reference = ?
        OR provider_reference = ?
        OR mtn_reference = ?
     ORDER BY id DESC
     LIMIT 1`,
    [reference, providerReference, providerReference]
  );
  if (!topup) return null;

  const normalizedStatus = mapTopupStatus(status);
  if (normalizedStatus === "successful") {
    const verifiedSuccess = await verifyTopupCallbackStatus({
      topup,
      providerReference,
      reference,
      expected: "successful",
    }).catch(() => ({ accepted: false }));

    if (!verifiedSuccess.accepted) {
      await client.run(
        `UPDATE wallet_topups
         SET status = 'pending',
             last_status_checked_at = CURRENT_TIMESTAMP,
             error_message = 'Unverified successful callback',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND LOWER(COALESCE(status, '')) NOT IN ('successful', 'failed', 'cancelled', 'expired')`,
        [topup.id]
      );
      return { flow: "customer_wallet_topup", status: "pending", topupId: topup.id, userId: topup.user_id };
    }

    await creditSuccessfulTopup({
      client,
      topup,
      providerReference: verifiedSuccess.providerReference || providerReference,
      metadata: { ...payload, verification: verifiedSuccess.rawResponse },
    });
  } else if (isTerminalFailure(normalizedStatus) && String(topup.status || "").toLowerCase() !== "successful") {
    const verifiedFailure = await verifyTopupCallbackStatus({
      topup,
      providerReference,
      reference,
      expected: "failed",
    }).catch(() => ({ accepted: false }));

    if (!verifiedFailure.accepted) {
      await client.run(
        `UPDATE wallet_topups
         SET status = 'pending',
             last_status_checked_at = CURRENT_TIMESTAMP,
             error_message = 'Unverified terminal callback',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND LOWER(COALESCE(status, '')) NOT IN ('successful', 'failed', 'cancelled', 'expired')`,
        [topup.id]
      );
      return { flow: "customer_wallet_topup", status: "pending", topupId: topup.id, userId: topup.user_id };
    }

    await client.run(
      `UPDATE wallet_topups
       SET status = ?,
           provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
           mtn_reference = COALESCE(NULLIF(?, ''), mtn_reference),
           error_message = '',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [verifiedFailure.status || normalizedStatus, verifiedFailure.providerReference || providerReference, verifiedFailure.providerReference || providerReference, topup.id]
    );
    await client.run(
      `UPDATE payment_transactions
       SET status = ?,
           provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
           metadata = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE internal_reference = ?`,
      [verifiedFailure.status || normalizedStatus, verifiedFailure.providerReference || providerReference, JSON.stringify({ ...payload, verification: verifiedFailure.rawResponse }), topup.reference]
    );
  } else if (normalizedStatus !== "successful") {
    await client.run(
      `UPDATE wallet_topups
       SET status = ?,
           provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
           mtn_reference = COALESCE(NULLIF(?, ''), mtn_reference),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND LOWER(COALESCE(status, '')) NOT IN ('successful', 'failed', 'cancelled', 'expired')`,
      [normalizedStatus, providerReference, providerReference, topup.id]
    );
    await client.run(
      `UPDATE payment_transactions
       SET status = ?,
           provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
           metadata = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE internal_reference = ?
         AND LOWER(COALESCE(status, '')) NOT IN ('successful', 'failed', 'cancelled', 'expired')`,
      [normalizedStatus, providerReference, JSON.stringify(payload || {}), topup.reference]
    );
  }
  return { flow: "customer_wallet_topup", status: normalizedStatus, topupId: topup.id, userId: topup.user_id };
}

async function getOwnedBarber(userId, client = { get }) {
  return client.get(
    `SELECT b.id, b.owner_user_id, b.business_name, p.phone
     FROM barbers b
     LEFT JOIN profiles p ON p.user_id = b.owner_user_id
     WHERE b.owner_user_id = ?`,
    [userId]
  );
}

export async function getMyWallet(req, res, next) {
  try {
    const barber = await getOwnedBarber(req.user.id, { get });

    if (!barber) {
      return res.status(200).json({
        success: true,
        wallet: {
          pending_balance: 0,
          available_balance: 0,
          locked_balance: 0,
          total_earned: 0,
          withdrawn_total: 0,
        },
        transactions: [],
        withdrawals: [],
      });
    }

    const snapshot = await transaction(async (client) => getBarberWalletSnapshot(barber.id, client));

    res.status(200).json({
      success: true,
      ...snapshot,
    });
  } catch (error) {
    next(error);
  }
}

export async function topUpMyWallet(req, res, next) {
  next(httpError(400, "Customer wallet top-ups are disabled in the internal ledger flow."));
}

export async function verifyWalletTopUp(req, res, next) {
  next(httpError(400, "Customer wallet top-ups are disabled in the internal ledger flow."));
}

export async function requestWithdrawal(req, res, next) {
  try {
    const amount = toMoneyAmount(req.body.amount);
    const note = String(req.body.note || "Barber withdrawal request").trim();
    const provider = String(req.body.provider || "mtn_mobile_money").trim().toLowerCase();
    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);

    if (!["mtn_mobile_money", "airtel_money"].includes(provider)) {
      throw httpError(400, "Withdrawal provider must be MTN Mobile Money or Airtel Money.");
    }
    if (provider !== "mtn_mobile_money") {
      throw httpError(503, "Only MTN Mobile Money payouts are enabled right now.");
    }

    const result = await transaction(async (client) => {
      const barber = await getOwnedBarber(req.user.id, client);
      if (!barber) {
        throw httpError(403, "Only barber accounts can withdraw from the ledger wallet.");
      }

      if (!barber.phone) {
        throw httpError(400, "Add a barber phone number before requesting a payout.");
      }

      const payoutRequest = await createPayoutRequest({
        client,
        barberId: barber.id,
        amount,
        mobileMoneyNumber: barber.phone,
        provider,
        idempotencyKey,
        note,
      });

      const processedPayout = await processPayoutRequest({
        client,
        payoutRequest,
      });

      const snapshot = await getBarberWalletSnapshot(barber.id, client);
      return {
        payoutRequest: processedPayout,
        snapshot,
      };
    });

    res.status(201).json({
      success: true,
      message:
        result.payoutRequest?.status === "paid"
          ? "Withdrawal completed successfully."
          : result.payoutRequest?.status === "failed"
          ? "Withdrawal failed. Funds were returned to available balance."
          : "Withdrawal is being processed.",
      ...result.snapshot,
    });
  } catch (error) {
    next(error);
  }
}
