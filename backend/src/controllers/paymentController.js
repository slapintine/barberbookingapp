import { transaction } from "../db/query.js";
import { env } from "../config/env.js";
import { createReference, normalizePhoneNumber } from "../services/paymentService.js";
import { getMobileMoneyService } from "../services/mobileMoneyService.js";
import {
  createPaymentRecord,
  getPaymentRecordByBookingId,
  getPaymentRecordByReference,
  normalizeLifecycleStatus,
  updatePaymentRecord,
} from "../services/paymentDataService.js";
import { createWalletTransaction, ensureBarberWallet } from "../services/ledgerService.js";
import { getMyWallet, requestWithdrawal } from "./walletController.js";
import { handleBookingPaymentWebhook, verifyBookingPayment } from "./bookingController.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getBookingById(bookingId, client = { get }) {
  return client.get(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
}

async function getBarberById(barberId, client = { get }) {
  return client.get(
    `SELECT b.id, b.owner_user_id, b.business_name, p.phone
     FROM barbers b
     LEFT JOIN profiles p ON p.user_id = b.owner_user_id
     WHERE b.id = ?`,
    [barberId]
  );
}

async function getCustomerPhone(userId, client = { get }) {
  const profile = await client.get(`SELECT phone FROM profiles WHERE user_id = ?`, [userId]);
  return normalizePhoneNumber(profile?.phone || "");
}

function readWebhookToken(req) {
  const bearerToken = String(req.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  return String(
    req.get("x-webhook-token") ||
    req.get("x-callback-token") ||
    bearerToken ||
    req.body?.token ||
    req.query?.token ||
    ""
  ).trim();
}

function normalizeMomoStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["successful", "success", "completed", "paid"].includes(normalized)) return "successful";
  if (["failed", "rejected", "expired", "cancelled", "canceled"].includes(normalized)) return "failed";
  return "pending";
}

function toAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function processPayoutWebhook({ client, providerReference, reference, status, payload }) {
  const payoutRequest = await client.get(
    `SELECT *
     FROM payout_requests
     WHERE reference = ?
        OR provider_reference = ?
     ORDER BY id DESC
     LIMIT 1`,
    [reference, providerReference]
  );

  if (!payoutRequest) {
    return null;
  }

  const payoutMirror = await client.get(
    `SELECT *
     FROM payouts
     WHERE internal_reference = ?
        OR provider_reference = ?
     ORDER BY id DESC
     LIMIT 1`,
    [reference || payoutRequest.reference, providerReference]
  );

  const normalizedStatus = normalizeMomoStatus(status);
  const normalizedAmount = toAmount(payoutRequest.amount);
  const resolvedProviderReference = providerReference || payoutRequest.provider_reference || "";
  const wallet = await ensureBarberWallet(payoutRequest.barber_id, client);

  if (normalizedStatus === "successful") {
    if (payoutRequest.status !== "paid") {
      await client.run(
        `UPDATE barber_wallets
         SET locked_balance = CASE
               WHEN locked_balance >= ? THEN locked_balance - ?
               ELSE 0
             END,
             withdrawn_total = withdrawn_total + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalizedAmount, normalizedAmount, normalizedAmount, wallet.id]
      );

      await createWalletTransaction({
        client,
        walletId: wallet.id,
        payoutRequestId: payoutRequest.id,
        payoutId: payoutMirror?.id || null,
        ownerId: payoutRequest.barber_id,
        balanceBucket: "locked",
        transactionType: "withdrawal_paid",
        entryType: "debit_locked",
        amount: normalizedAmount,
        reference: payoutRequest.reference,
        providerReference: resolvedProviderReference,
        note: `Withdrawal request #${payoutRequest.id} paid out successfully`,
        metadata: payload,
      });
    }

    await client.run(
      `UPDATE payout_requests
       SET status = 'paid',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resolvedProviderReference, payoutRequest.id]
    );

    await client.run(
      `UPDATE payouts
       SET status = 'paid',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP,
           metadata = ?
       WHERE id = ?`,
      [resolvedProviderReference, JSON.stringify(payload || {}), payoutMirror?.id || 0]
    );

    return {
      flow: "payout",
      status: "paid",
      payoutRequestId: payoutRequest.id,
    };
  }

  if (normalizedStatus === "failed") {
    if (!["failed", "paid"].includes(String(payoutRequest.status || "").toLowerCase())) {
      await client.run(
        `UPDATE barber_wallets
         SET locked_balance = CASE
               WHEN locked_balance >= ? THEN locked_balance - ?
               ELSE 0
             END,
             available_balance = available_balance + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalizedAmount, normalizedAmount, normalizedAmount, wallet.id]
      );

      await createWalletTransaction({
        client,
        walletId: wallet.id,
        payoutRequestId: payoutRequest.id,
        payoutId: payoutMirror?.id || null,
        ownerId: payoutRequest.barber_id,
        balanceBucket: "available",
        transactionType: "withdrawal_failed_release",
        entryType: "unlock_to_available",
        amount: normalizedAmount,
        reference: payoutRequest.reference,
        providerReference: resolvedProviderReference,
        note: `Withdrawal request #${payoutRequest.id} failed and funds returned to available balance`,
        metadata: payload,
      });
    }

    await client.run(
      `UPDATE payout_requests
       SET status = 'failed',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resolvedProviderReference, payoutRequest.id]
    );

    await client.run(
      `UPDATE payouts
       SET status = 'failed',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP,
           metadata = ?
       WHERE id = ?`,
      [resolvedProviderReference, JSON.stringify(payload || {}), payoutMirror?.id || 0]
    );

    return {
      flow: "payout",
      status: "failed",
      payoutRequestId: payoutRequest.id,
    };
  }

  await client.run(
    `UPDATE payout_requests
     SET status = 'processing',
         provider_reference = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [resolvedProviderReference, payoutRequest.id]
  );

  await client.run(
    `UPDATE payouts
     SET status = 'pending',
         provider_reference = ?,
         updated_at = CURRENT_TIMESTAMP,
         metadata = ?
     WHERE id = ?`,
    [resolvedProviderReference, JSON.stringify(payload || {}), payoutMirror?.id || 0]
  );

  return {
    flow: "payout",
    status: "processing",
    payoutRequestId: payoutRequest.id,
  };
}

export async function checkout(req, res, next) {
  try {
    const bookingId = Number(req.body.bookingId || req.body.booking_id);
    const provider = String(req.body.provider || "").trim().toLowerCase();
    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      throw httpError(400, "bookingId is required.");
    }

    const result = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      if (Number(booking.customer_user_id) !== Number(req.user.id)) {
        throw httpError(403, "Only the customer can start checkout for this booking.");
      }

      const paymentProvider = provider || String(booking.payment_method || "").trim().toLowerCase();
      if (!["mtn_mobile_money", "airtel_money"].includes(paymentProvider)) {
        throw httpError(400, "Checkout only supports MTN or Airtel mobile money bookings.");
      }
      if (paymentProvider !== "mtn_mobile_money") {
        throw httpError(503, "Only MTN Mobile Money is enabled right now.");
      }

      if (booking.payment_status === "paid") {
        const existingPaid = await getPaymentRecordByBookingId(bookingId, client);
        return { booking, payment: existingPaid, alreadyPaid: true };
      }

      const existingPayment = await getPaymentRecordByBookingId(bookingId, client);
      if (existingPayment && ["pending", "initiated", "successful"].includes(String(existingPayment.status || "").toLowerCase())) {
        return { booking, payment: existingPayment, alreadyStarted: true };
      }

      const barber = await getBarberById(booking.barber_id, client);
      const payerPhone = normalizePhoneNumber(req.body.phoneNumber || req.body.phone_number || booking.payment_customer_phone || (await getCustomerPhone(req.user.id, client)));
      if (!payerPhone) {
        throw httpError(400, "A valid customer phone number is required for mobile money checkout.");
      }

      const reference = booking.payment_reference || createReference("booking", booking.id);
      const callbackUrl = env.mobileMoneyCallbackUrl || `${env.appPublicUrl}/api/payments/webhooks/mtn`;
      const providerResult = await getMobileMoneyService(paymentProvider).initiateCollection({
        provider: paymentProvider,
        amount: Number(booking.price || 0),
        phoneNumber: payerPhone,
        reference,
        description: `Booking payment for ${barber?.business_name || "barber booking"}`,
        callbackUrl,
      });
      const paymentStatus = normalizeLifecycleStatus(providerResult.status, "initiated");

      await client.run(
        `UPDATE bookings
         SET payment_reference = ?,
             payment_provider = ?,
             payment_customer_phone = ?,
             payment_status = CASE
               WHEN payment_status = 'paid' THEN payment_status
               ELSE 'pending'
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reference, paymentProvider, payerPhone, booking.id]
      );

      if (existingPayment) {
        await updatePaymentRecord({
          client,
          internalReference: existingPayment.internal_reference,
          providerReference: providerResult.providerReference || existingPayment.provider_reference || "",
          status: paymentStatus,
          metadata: providerResult.rawResponse || {},
        });

        await client.run(
          `UPDATE payment_transactions
           SET provider_reference = ?,
               payer_phone = ?,
               status = ?,
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE internal_reference = ?`,
          [
            providerResult.providerReference || existingPayment.provider_reference || "",
            payerPhone,
            paymentStatus,
            JSON.stringify(providerResult.rawResponse || {}),
            existingPayment.internal_reference,
          ]
        );
      } else {
        await createPaymentRecord({
          client,
          bookingId: booking.id,
          barberId: booking.barber_id,
          userId: booking.customer_user_id,
          flowType: "booking",
          provider: paymentProvider,
          internalReference: reference,
          providerReference: providerResult.providerReference || "",
          callbackUrl,
          idempotencyKey,
          payerPhone,
          payeePhone: barber?.phone || "",
          grossAmount: Number(booking.price || 0),
          commissionAmount: Number(booking.commission_amount || 0),
          barberAmount: Number(booking.barber_amount || 0),
          status: paymentStatus,
          metadata: providerResult.rawResponse || {},
        });

        await client.run(
          `INSERT INTO payment_transactions
           (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, payee_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
           VALUES (?, ?, ?, 'booking_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UGX', ?, ?)`,
          [
            booking.id,
            booking.barber_id,
            booking.customer_user_id,
            paymentProvider,
            reference,
            providerResult.providerReference || "",
            idempotencyKey,
            payerPhone,
            barber?.phone || "",
            Number(booking.price || 0),
            Number(booking.commission_amount || 0),
            Number(booking.barber_amount || 0),
            paymentStatus,
            JSON.stringify(providerResult.rawResponse || {}),
          ]
        );
      }

      return {
        booking: await getBookingById(booking.id, client),
        payment: await getPaymentRecordByReference({ reference }, client),
      };
    });

    res.status(200).json({
      success: true,
      already_paid: Boolean(result.alreadyPaid),
      already_started: Boolean(result.alreadyStarted),
      booking: result.booking,
      payment: result.payment,
    });
  } catch (error) {
    next(error);
  }
}

export async function verify(req, res, next) {
  try {
    const bookingId = Number(req.body.bookingId || req.body.booking_id || req.params.id);
    let resolvedBookingId = bookingId;

    if (!resolvedBookingId) {
      const reference = String(req.body.reference || req.body.payment_reference || "").trim();
      const providerReference = String(req.body.providerReference || req.body.provider_reference || "").trim();
      if (!reference && !providerReference) {
        throw httpError(400, "bookingId or payment reference is required.");
      }

      const payment = await transaction(async (client) =>
        getPaymentRecordByReference({ reference, providerReference }, client)
      );
      if (!payment?.booking_id) {
        throw httpError(404, "Payment not found.");
      }
      resolvedBookingId = Number(payment.booking_id);
    }

    req.params.id = String(resolvedBookingId);
    return verifyBookingPayment(req, res, next);
  } catch (error) {
    next(error);
  }
}

export async function handleMtnWebhook(req, res, next) {
  try {
    const providedToken = readWebhookToken(req);
    if (env.mobileMoneyWebhookToken && providedToken !== env.mobileMoneyWebhookToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook token.",
      });
    }

    const payload = {
      ...(req.body || {}),
      provider: "mtn_mobile_money",
      provider_reference:
        req.body?.provider_reference ||
        req.body?.referenceId ||
        req.get("x-reference-id") ||
        req.get("x-momo-reference") ||
        "",
      reference:
        req.body?.reference ||
        req.body?.externalId ||
        req.query?.reference ||
        "",
      status:
        req.body?.status ||
        req.body?.financialTransactionStatus ||
        req.query?.status ||
        "pending",
    };

    const payoutWebhookResult = await transaction(async (client) =>
      processPayoutWebhook({
        client,
        providerReference: String(payload.provider_reference || "").trim(),
        reference: String(payload.reference || "").trim(),
        status: payload.status,
        payload,
      })
    );

    if (payoutWebhookResult) {
      return res.status(200).json({
        success: true,
        message:
          payoutWebhookResult.status === "paid"
            ? "Payout webhook processed successfully."
            : payoutWebhookResult.status === "failed"
            ? "Payout webhook recorded a failed transfer."
            : "Payout webhook recorded a pending transfer.",
      });
    }

    req.body = payload;
    return handleBookingPaymentWebhook(req, res, next);
  } catch (error) {
    next(error);
  }
}

export async function handleAirtelWebhook(req, res, next) {
  return res.status(503).json({
    success: false,
    message: "Airtel Money webhooks are disabled.",
  });
}

export async function getWalletSummary(req, res, next) {
  return getMyWallet(req, res, next);
}

export async function requestPayout(req, res, next) {
  req.body.provider = "mtn_mobile_money";
  return requestWithdrawal(req, res, next);
}
