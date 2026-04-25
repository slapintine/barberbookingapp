function toAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function normalizeLifecycleStatus(value, fallback = "pending") {
  const normalized = String(value || "").trim().toLowerCase();

  if (["pending", "created"].includes(normalized)) return "pending";
  if (["initiated", "processing", "queued"].includes(normalized)) return "initiated";
  if (["successful", "success", "completed", "paid"].includes(normalized)) return "successful";
  if (["failed", "cancelled", "canceled", "rejected", "expired"].includes(normalized)) return "failed";
  return fallback;
}

export async function getPaymentRecordByBookingId(bookingId, client) {
  return client.get(
    `SELECT *
     FROM payments
     WHERE booking_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [bookingId]
  );
}

export async function getPaymentRecordByReference({ reference = "", providerReference = "" }, client) {
  return client.get(
    `SELECT *
     FROM payments
     WHERE internal_reference = ?
        OR provider_reference = ?
     ORDER BY id DESC
     LIMIT 1`,
    [reference, providerReference]
  );
}

export async function createPaymentRecord({
  client,
  bookingId = null,
  barberId = null,
  userId = null,
  flowType = "booking",
  provider,
  internalReference,
  providerReference = "",
  callbackUrl = "",
  idempotencyKey = "",
  payerPhone = "",
  payeePhone = "",
  grossAmount = 0,
  commissionAmount = 0,
  barberAmount = 0,
  currency = "UGX",
  status = "pending",
  metadata = {},
}) {
  await client.run(
    `INSERT INTO payments
     (booking_id, barber_id, user_id, flow_type, provider, internal_reference, provider_reference, callback_url, idempotency_key, payer_phone, payee_phone, gross_amount, commission_amount, barber_amount, currency, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bookingId,
      barberId,
      userId,
      flowType,
      provider,
      internalReference,
      providerReference,
      callbackUrl,
      idempotencyKey,
      payerPhone,
      payeePhone,
      toAmount(grossAmount),
      toAmount(commissionAmount),
      toAmount(barberAmount),
      currency,
      normalizeLifecycleStatus(status, "pending"),
      JSON.stringify(metadata || {}),
    ]
  );

  return getPaymentRecordByReference({ reference: internalReference }, client);
}

export async function updatePaymentRecord({
  client,
  internalReference,
  providerReference = "",
  status,
  metadata = {},
}) {
  await client.run(
    `UPDATE payments
     SET status = ?,
         provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
         metadata = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE internal_reference = ?`,
    [
      normalizeLifecycleStatus(status),
      providerReference,
      JSON.stringify(metadata || {}),
      internalReference,
    ]
  );

  return getPaymentRecordByReference({ reference: internalReference }, client);
}

export async function recordWebhookEvent({
  client,
  provider,
  eventType = "payment_callback",
  reference = "",
  providerReference = "",
  signature = "",
  payload = {},
  processingStatus = "received",
}) {
  const created = await client.run(
    `INSERT INTO webhook_events
     (provider, event_type, reference, provider_reference, signature, payload, processing_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      provider,
      eventType,
      reference,
      providerReference,
      signature,
      JSON.stringify(payload || {}),
      processingStatus,
    ]
  );

  return client.get(`SELECT * FROM webhook_events WHERE id = ?`, [created.lastID]);
}

export async function markWebhookEventProcessed({ client, eventId, processingStatus }) {
  await client.run(
    `UPDATE webhook_events
     SET processing_status = ?,
         processed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [processingStatus, eventId]
  );
}
