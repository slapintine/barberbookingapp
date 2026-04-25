import { createReference, normalizePhoneNumber } from "./paymentService.js";
import { getMobileMoneyService } from "./mobileMoneyService.js";

function toAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toLegacyDirection(entryType) {
  const normalized = String(entryType || "").toLowerCase();
  if (normalized.includes("debit") || normalized.includes("lock")) return "debit";
  return "credit";
}

async function createLedgerMirrorEntry({
  client,
  ownerType,
  ownerId = null,
  walletId = null,
  bookingId = null,
  paymentId = null,
  payoutId = null,
  direction,
  balanceBucket,
  amount,
  reference = "",
  providerReference = "",
  description = "",
  metadata = {},
}) {
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, wallet_id, booking_id, payment_id, payout_id, direction, balance_bucket, amount, reference, provider_reference, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerType,
      ownerId,
      walletId,
      bookingId,
      paymentId,
      payoutId,
      direction,
      balanceBucket,
      toAmount(amount),
      reference,
      providerReference,
      description,
      JSON.stringify(metadata || {}),
    ]
  );
}

export async function ensureBarberWallet(barberId, client) {
  let wallet = await client.get(
    `SELECT *
     FROM barber_wallets
     WHERE barber_id = ?`,
    [barberId]
  );

  if (!wallet) {
    await client.run(
      `INSERT INTO barber_wallets
       (barber_id, pending_balance, available_balance, locked_balance, total_earned, withdrawn_total)
       VALUES (?, 0, 0, 0, 0, 0)`,
      [barberId]
    );
    wallet = await client.get(
      `SELECT *
       FROM barber_wallets
       WHERE barber_id = ?`,
      [barberId]
    );
  }

  return wallet;
}

export async function createWalletTransaction({
  client,
  walletId,
  bookingId = null,
  paymentTransactionId = null,
  paymentId = null,
  payoutRequestId = null,
  payoutId = null,
  ownerType = "barber",
  ownerId = null,
  balanceBucket = "available",
  transactionType,
  entryType,
  amount,
  reference = "",
  providerReference = "",
  note = "",
  metadata = {},
}) {
  await client.run(
    `INSERT INTO wallet_transactions
     (wallet_id, booking_id, payment_transaction_id, payout_request_id, direction, amount, type, transaction_type, entry_type, reference, provider_reference, note, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      walletId,
      bookingId,
      paymentTransactionId,
      payoutRequestId,
      toLegacyDirection(entryType),
      toAmount(amount),
      transactionType,
      transactionType,
      entryType,
      reference,
      providerReference,
      note,
      JSON.stringify(metadata || {}),
    ]
  );

  await createLedgerMirrorEntry({
    client,
    ownerType,
    ownerId,
    walletId,
    bookingId,
    paymentId,
    payoutId,
    direction: entryType,
    balanceBucket,
    amount,
    reference,
    providerReference,
    description: note,
    metadata,
  });
}

export async function creditPendingBarberShare({
  client,
  barberId,
  bookingId,
  paymentTransactionId,
  paymentId = null,
  amount,
  reference,
  providerReference = "",
}) {
  const wallet = await ensureBarberWallet(barberId, client);
  const normalizedAmount = toAmount(amount);

  await client.run(
    `UPDATE barber_wallets
     SET pending_balance = pending_balance + ?,
         total_earned = total_earned + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [normalizedAmount, normalizedAmount, wallet.id]
  );

  await createWalletTransaction({
    client,
    walletId: wallet.id,
    bookingId,
    paymentTransactionId,
    paymentId,
    ownerId: barberId,
    balanceBucket: "pending",
    transactionType: "booking_share_pending",
    entryType: "credit_pending",
    amount: normalizedAmount,
    reference,
    providerReference,
    note: `Booking #${bookingId} barber share moved to pending balance`,
    metadata: { bookingId },
  });
}

export async function settlePendingBarberShare({
  client,
  barberId,
  bookingId,
  amount,
  reference = "",
}) {
  const wallet = await ensureBarberWallet(barberId, client);
  const normalizedAmount = toAmount(amount);

  const updated = await client.run(
    `UPDATE barber_wallets
     SET pending_balance = pending_balance - ?,
         available_balance = available_balance + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND pending_balance >= ?`,
    [normalizedAmount, normalizedAmount, wallet.id, normalizedAmount]
  );

  if (!updated?.changes) {
    return false;
  }

  await createWalletTransaction({
    client,
    walletId: wallet.id,
    bookingId,
    ownerId: barberId,
    balanceBucket: "available",
    transactionType: "booking_share_available",
    entryType: "release_pending",
    amount: normalizedAmount,
    reference: reference || `booking-${bookingId}-available`,
    note: `Booking #${bookingId} barber share released to available balance`,
    metadata: { bookingId },
  });

  return true;
}

export async function reversePendingBarberShare({
  client,
  barberId,
  bookingId,
  amount,
  reference = "",
}) {
  const wallet = await ensureBarberWallet(barberId, client);
  const normalizedAmount = toAmount(amount);

  const updated = await client.run(
    `UPDATE barber_wallets
     SET pending_balance = pending_balance - ?,
         total_earned = CASE
           WHEN total_earned >= ? THEN total_earned - ?
           ELSE 0
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND pending_balance >= ?`,
    [normalizedAmount, normalizedAmount, normalizedAmount, wallet.id, normalizedAmount]
  );

  if (!updated?.changes) {
    return false;
  }

  await createWalletTransaction({
    client,
    walletId: wallet.id,
    bookingId,
    ownerId: barberId,
    balanceBucket: "pending",
    transactionType: "booking_share_reversal",
    entryType: "debit_pending",
    amount: normalizedAmount,
    reference: reference || `booking-${bookingId}-reversal`,
    note: `Booking #${bookingId} barber share reversed from pending balance`,
    metadata: { bookingId },
  });

  return true;
}

export async function getBarberWalletSnapshot(barberId, client) {
  const wallet = await ensureBarberWallet(barberId, client);
  const transactions = await client.all(
    `SELECT id, wallet_id, booking_id, payment_transaction_id, payout_request_id, transaction_type, entry_type, amount, reference, provider_reference, note, metadata, created_at
     FROM wallet_transactions
     WHERE wallet_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [wallet.id]
  );
  const payouts = await client.all(
    `SELECT id, barber_id, wallet_id, amount, status, mobile_money_number, provider, reference, provider_reference, idempotency_key, note, created_at, updated_at
     FROM payout_requests
     WHERE wallet_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    [wallet.id]
  );

  return {
    wallet: {
      ...wallet,
      pending_balance: toAmount(wallet.pending_balance),
      available_balance: toAmount(wallet.available_balance),
      locked_balance: toAmount(wallet.locked_balance),
      total_earned: toAmount(wallet.total_earned),
      withdrawn_total: toAmount(wallet.withdrawn_total),
    },
    transactions: transactions.map((item) => ({
      ...item,
      amount: toAmount(item.amount),
      metadata: (() => {
        try {
          return item.metadata ? JSON.parse(item.metadata) : {};
        } catch {
          return {};
        }
      })(),
      status: "posted",
    })),
    withdrawals: payouts.map((item) => ({
      ...item,
      amount: toAmount(item.amount),
    })),
  };
}

export async function createPayoutRequest({
  client,
  barberId,
  amount,
  mobileMoneyNumber,
  provider,
  idempotencyKey = "",
  note = "",
}) {
  const wallet = await ensureBarberWallet(barberId, client);
  const normalizedAmount = toAmount(amount);

  if (idempotencyKey) {
    const existing = await client.get(
      `SELECT * FROM payout_requests
       WHERE barber_id = ? AND idempotency_key = ?
       ORDER BY id DESC
       LIMIT 1`,
      [barberId, idempotencyKey]
    );
    if (existing) {
      return existing;
    }
  }

  const lockResult = await client.run(
    `UPDATE barber_wallets
     SET available_balance = available_balance - ?,
         locked_balance = locked_balance + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND available_balance >= ?`,
    [normalizedAmount, normalizedAmount, wallet.id, normalizedAmount]
  );

  if (!lockResult?.changes) {
    throw Object.assign(new Error("Insufficient available balance."), { statusCode: 402 });
  }

  const reference = createReference("payout", barberId);
  const created = await client.run(
    `INSERT INTO payout_requests
     (barber_id, wallet_id, amount, mobile_money_number, provider, reference, status, idempotency_key, note)
     VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
    [
      barberId,
      wallet.id,
      normalizedAmount,
      normalizePhoneNumber(mobileMoneyNumber),
      provider,
      reference,
      idempotencyKey,
      note,
    ]
  );

  await client.run(
    `INSERT INTO payouts
     (barber_id, wallet_id, amount, mobile_money_number, provider, internal_reference, status, idempotency_key, note, metadata)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      barberId,
      wallet.id,
      normalizedAmount,
      normalizePhoneNumber(mobileMoneyNumber),
      provider,
      reference,
      idempotencyKey,
      note,
      JSON.stringify({ source: "ledgerService" }),
    ]
  );

  const payoutMirror = await client.get(`SELECT * FROM payouts WHERE internal_reference = ?`, [reference]);

  await createWalletTransaction({
    client,
    walletId: wallet.id,
    payoutRequestId: created.lastID,
    payoutId: payoutMirror?.id || null,
    ownerId: barberId,
    balanceBucket: "locked",
    transactionType: "withdrawal_lock",
    entryType: "lock_funds",
    amount: normalizedAmount,
    reference,
    note: `Withdrawal request #${created.lastID} locked from available balance`,
  });

  return client.get(`SELECT * FROM payout_requests WHERE id = ?`, [created.lastID]);
}

export async function processPayoutRequest({
  client,
  payoutRequest,
}) {
  if (!payoutRequest || payoutRequest.status === "paid") {
    return payoutRequest;
  }

  const disbursement = await getMobileMoneyService(payoutRequest.provider).disburseFunds({
    provider: payoutRequest.provider,
    amount: payoutRequest.amount,
    phoneNumber: payoutRequest.mobile_money_number,
    reference: payoutRequest.reference,
  });
  const verification = await getMobileMoneyService(payoutRequest.provider)
    .verifyDisbursement({
      provider: payoutRequest.provider,
      providerReference: disbursement.providerReference,
      reference: payoutRequest.reference,
      amount: payoutRequest.amount,
    })
    .catch(() => null);

  const wallet = await ensureBarberWallet(payoutRequest.barber_id, client);
  const normalizedAmount = toAmount(payoutRequest.amount);
  const finalStatus = String(verification?.status || disbursement.status || "").toLowerCase();
  const finalProviderReference = verification?.providerReference || disbursement.providerReference || "";
  const finalMetadata = verification?.rawResponse || disbursement.rawResponse || {};

  if (finalStatus === "successful") {
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

    await client.run(
      `UPDATE payout_requests
       SET status = 'paid',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [finalProviderReference, payoutRequest.id]
    );

    await client.run(
      `UPDATE payouts
       SET status = 'paid',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP,
           metadata = ?
       WHERE internal_reference = ?`,
      [
        finalProviderReference,
        JSON.stringify(finalMetadata),
        payoutRequest.reference,
      ]
    );

    await createWalletTransaction({
      client,
      walletId: wallet.id,
      payoutRequestId: payoutRequest.id,
      payoutId: (await client.get(`SELECT id FROM payouts WHERE internal_reference = ?`, [payoutRequest.reference]))?.id || null,
      ownerId: payoutRequest.barber_id,
      balanceBucket: "locked",
      transactionType: "withdrawal_paid",
      entryType: "debit_locked",
      amount: normalizedAmount,
      reference: payoutRequest.reference,
      providerReference: finalProviderReference,
      note: `Withdrawal request #${payoutRequest.id} paid out successfully`,
    });
  } else if (finalStatus === "failed") {
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

    await client.run(
      `UPDATE payout_requests
       SET status = 'failed',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [finalProviderReference, payoutRequest.id]
    );

    await client.run(
      `UPDATE payouts
       SET status = 'failed',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP,
           metadata = ?
       WHERE internal_reference = ?`,
      [
        finalProviderReference,
        JSON.stringify(finalMetadata),
        payoutRequest.reference,
      ]
    );

    await createWalletTransaction({
      client,
      walletId: wallet.id,
      payoutRequestId: payoutRequest.id,
      payoutId: (await client.get(`SELECT id FROM payouts WHERE internal_reference = ?`, [payoutRequest.reference]))?.id || null,
      ownerId: payoutRequest.barber_id,
      balanceBucket: "available",
      transactionType: "withdrawal_failed_release",
      entryType: "unlock_to_available",
      amount: normalizedAmount,
      reference: payoutRequest.reference,
      providerReference: finalProviderReference,
      note: `Withdrawal request #${payoutRequest.id} failed and funds returned to available balance`,
    });
  } else {
    await client.run(
      `UPDATE payout_requests
       SET status = 'processing',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [finalProviderReference, payoutRequest.id]
    );

    await client.run(
      `UPDATE payouts
       SET status = 'pending',
           provider_reference = ?,
           updated_at = CURRENT_TIMESTAMP,
           metadata = ?
       WHERE internal_reference = ?`,
      [
        finalProviderReference,
        JSON.stringify(finalMetadata),
        payoutRequest.reference,
      ]
    );
  }

  return client.get(`SELECT * FROM payout_requests WHERE id = ?`, [payoutRequest.id]);
}
