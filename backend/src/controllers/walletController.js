import { get, transaction } from "../db/query.js";
import { getBarberWalletSnapshot, createPayoutRequest, processPayoutRequest } from "../services/ledgerService.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toMoneyAmount(value, fieldName = "amount", minimum = 1000) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError(400, `${fieldName} must be greater than 0.`);
  }
  if (amount < minimum) {
    throw httpError(400, `${fieldName} must be at least UGX ${minimum.toLocaleString()}.`);
  }
  return Number(amount.toFixed(2));
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

export async function handlePesapalIpn(req, res, next) {
  res.status(200).json({
    success: true,
    message: "No wallet top-up IPN handling is configured for the internal ledger flow.",
  });
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
