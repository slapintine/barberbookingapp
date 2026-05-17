import { all, get, run, transaction } from "../db/query.js";
import { sendPushToUser } from "./pushController.js";
import { requireClockTime, requireIsoDate, toPositiveInteger } from "../utils/validation.js";
import { bookingConfirmationEmail, sendEmail } from "../services/emailService.js";
import { env } from "../config/env.js";
import {
  calculateCommissionBreakdown,
  createReference,
  getMobileMoneyProviderLabel,
  normalizePhoneNumber,
} from "../services/paymentService.js";
import { getMobileMoneyService } from "../services/mobileMoneyService.js";
import {
  creditPendingBarberShare,
  reversePendingBarberShare,
  settlePendingBarberShare,
} from "../services/ledgerService.js";
import {
  createPaymentRecord,
  getPaymentRecordByBookingId,
  markWebhookEventProcessed,
  recordWebhookEvent,
  updatePaymentRecord,
  normalizeLifecycleStatus,
} from "../services/paymentDataService.js";

/* ================= HELPERS ================= */

function getBarberById(barberId, client = { get }) {
  return client.get(
    `SELECT
       id,
       owner_user_id,
       business_name,
       location,
       price_from,
       availability_start,
       availability_end,
       accepts_wallet,
       accepts_cash,
       stand_type,
       subscription_tier,
       subscription_status,
       subscription_expires_at
     FROM barbers
     WHERE id = ?`,
    [barberId]
  );
}

function getMyOwnedBarber(reqUserId, client = { get }) {
  return client.get(
    `SELECT id, owner_user_id, business_name
     FROM barbers
     WHERE owner_user_id = ?`,
    [reqUserId]
  );
}

function getUsernameByUserId(userId, client = { get }) {
  return client.get(`SELECT username FROM users WHERE id = ?`, [userId]);
}

function getCustomerProfileByUserId(userId, client = { get }) {
  return client.get(
    `SELECT full_name, email, phone FROM profiles WHERE user_id = ?`,
    [userId]
  );
}

function getProfileByUserId(userId, client = { get }) {
  return client.get(
    `SELECT full_name, email, phone FROM profiles WHERE user_id = ?`,
    [userId]
  );
}

function getBarberServiceById(serviceId, barberId, client = { get }) {
  return client.get(
    `SELECT id, barber_id, service_name, price_extra, duration_minutes
     FROM barber_services
     WHERE id = ? AND barber_id = ?`,
    [serviceId, barberId]
  );
}

function getTeamMemberById(teamMemberId, barberId, client = { get }) {
  return client.get(
    `SELECT id, barber_id, name, title, bio, image, specialties, is_active
     FROM barber_team_members
     WHERE id = ? AND barber_id = ? AND is_active = 1`,
    [teamMemberId, barberId]
  );
}

function getActiveTeamMemberCount(barberId, client = { get }) {
  return client.get(
    `SELECT COUNT(*) AS count
     FROM barber_team_members
     WHERE barber_id = ? AND is_active = 1`,
    [barberId]
  );
}

function getBookingById(bookingId, client = { get }) {
  return client.get(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
}

function getPaymentTransactionByBookingId(bookingId, client = { get }) {
  return client.get(
    `SELECT * FROM payment_transactions
     WHERE booking_id = ?
       AND transaction_type = 'booking_payment'
     ORDER BY id DESC
     LIMIT 1`,
    [bookingId]
  );
}

function addNotification(userId, { title, type, message }) {
  return run(
    `INSERT INTO notifications (user_id, title, type, message, read)
     VALUES (?, ?, ?, ?, 0)`,
    [userId, title, type, message]
  );
}

function logAudit(userId, action) {
  return run(
    `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
    [userId || null, action]
  ).catch(() => {});
}

function addBookingEvent(bookingId, actorUserId, eventType, eventNote = "") {
  return run(
    `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
     VALUES (?, ?, ?, ?)`,
    [bookingId, actorUserId, eventType, eventNote]
  ).catch(() => {});
}

/* ================= TIME ================= */

function normalizeTimeInput(time) {
  const raw = String(time || "").trim().toUpperCase();

  if (!raw) return "";

  if (/^\d{2}:\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return raw;

  let hours = Number(match[1]);
  const minutes = match[2];
  const modifier = match[3].toUpperCase();

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function toMinutes(time) {
  const normalized = normalizeTimeInput(time);
  const [h, m] = String(normalized || "00:00").split(":").map(Number);
  return h * 60 + m;
}

/* ================= DATE ================= */

function getDayOfWeek(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/* ================= SCHEDULE ================= */

function getBarberScheduleForDay(barberId, dayOfWeek, client = { get }) {
  return client.get(
    `SELECT * FROM barber_schedule
     WHERE barber_id = ? AND day_of_week = ?`,
    [barberId, dayOfWeek]
  );
}

function getActiveBookingsForBarberOnDate(barberId, bookingDate, teamMemberId = null, client = { all }) {
  const teamFilter = teamMemberId
    ? "AND team_member_id = ?"
    : "AND team_member_id IS NULL";
  const params = teamMemberId ? [barberId, bookingDate, teamMemberId] : [barberId, bookingDate];

  return client.all(
    `SELECT id, booking_time, service_duration_minutes, team_member_id
     FROM bookings
     WHERE barber_id = ?
       AND booking_date = ?
       ${teamFilter}
       AND status IN ('payment_pending','pending','confirmed')`,
    params
  );
}

function getAvailabilityBookingsForBarberOnDate(barberId, bookingDate, teamMemberId = null, client = { all }) {
  const teamFilter = teamMemberId
    ? "AND team_member_id = ?"
    : "";
  const params = teamMemberId ? [barberId, bookingDate, teamMemberId] : [barberId, bookingDate];

  return client.all(
    `SELECT id, booking_time, service_duration_minutes, status, team_member_id
     FROM bookings
     WHERE barber_id = ?
       AND booking_date = ?
       ${teamFilter}
       AND status IN ('payment_pending','pending','confirmed')`,
    params
  );
}

function resolveWorkingWindow(barber, scheduleRow) {
  const barberStart = normalizeTimeInput(barber?.availability_start || "");
  const barberEnd = normalizeTimeInput(barber?.availability_end || "");

  const hasBarberWindow =
    /^\d{2}:\d{2}$/.test(barberStart) &&
    /^\d{2}:\d{2}$/.test(barberEnd) &&
    toMinutes(barberEnd) > toMinutes(barberStart);

  const scheduleStart = normalizeTimeInput(scheduleRow?.start_time || "");
  const scheduleEnd = normalizeTimeInput(scheduleRow?.end_time || "");

  const hasScheduleWindow =
    /^\d{2}:\d{2}$/.test(scheduleStart) &&
    /^\d{2}:\d{2}$/.test(scheduleEnd) &&
    toMinutes(scheduleEnd) > toMinutes(scheduleStart);

  // ✅ If open schedule exists → use it
  if (scheduleRow && Number(scheduleRow.is_open) === 1 && hasScheduleWindow) {
    return {
      start: scheduleStart,
      end: scheduleEnd,
      source: "schedule"
    };
  }

  // ❗ DO NOT RETURN NULL ANYMORE

  // ✅ fallback to barber profile hours
  if (hasBarberWindow) {
    return {
      start: barberStart,
      end: barberEnd,
      source: "barber"
    };
  }

  // ✅ final fallback
  return {
    start: "08:00",
    end: "20:00",
    source: "default"
  };
}

/* ================= PROTECTION ================= */

function getActiveBookingsForCustomerWithBarber(userId, barberId, client = { all }) {
  return client.all(
    `SELECT id FROM bookings
     WHERE customer_user_id = ?
       AND barber_id = ?
       AND status IN ('payment_pending','pending','confirmed')`,
    [userId, barberId]
  );
}

function getRecentBookingForCustomerWithBarber(userId, barberId, client = { get }) {
  return client.get(
    `SELECT created_at FROM bookings
     WHERE customer_user_id = ?
       AND barber_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [userId, barberId]
  );
}

/* ================= VALIDATION ================= */

function isWithinSchedule(window, bookingTime, durationMinutes) {
  if (!window) return false;

  const requestedStart = toMinutes(normalizeTimeInput(bookingTime));
  const requestedEnd = requestedStart + Number(durationMinutes || 30);

  const start = toMinutes(normalizeTimeInput(window.start));
  const end = toMinutes(normalizeTimeInput(window.end));

  return requestedStart >= start && requestedEnd <= end;
}

function hasOverlap(existingBookings, bookingTime, durationMinutes) {
  const requestedStart = toMinutes(bookingTime);
  const requestedEnd = requestedStart + durationMinutes;

  return existingBookings.some((item) => {
    const existingStart = toMinutes(item.booking_time);
    const existingEnd = existingStart + Number(item.service_duration_minutes || 30);
    return requestedStart < existingEnd && requestedEnd > existingStart;
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePaymentMethod(value, barber) {
  const requested = String(value || "").trim().toLowerCase() || "mtn_mobile_money";
  const acceptsWallet = Number(barber?.accepts_wallet || 0) === 1;
  const acceptsCash = Number(barber?.accepts_cash ?? 1) === 1;

  if (!["cash", "wallet", "mtn_mobile_money", "airtel_money"].includes(requested)) {
    throw httpError(400, "Invalid payment method.");
  }

  if (requested === "wallet" && !acceptsWallet) {
    throw httpError(400, "This barber does not accept wallet payments.");
  }

  if (requested === "cash" && !acceptsCash) {
    throw httpError(400, "This barber does not accept cash payments.");
  }

  if (requested === "airtel_money" && !env.airtelEnabled) {
    throw httpError(503, "Airtel Money is currently disabled.");
  }

  if (["mtn_mobile_money", "airtel_money"].includes(requested) && !barber?.owner_user_id) {
    throw httpError(400, "This barber cannot receive mobile money payouts yet.");
  }

  if (!acceptsWallet && !acceptsCash) {
    if (!barber?.owner_user_id) {
      throw httpError(400, "This barber has no active payment method.");
    }
  }

  return requested;
}

async function ensureWallet(userId, client) {
  let wallet = await client.get(`SELECT id, user_id, balance FROM wallets WHERE user_id = ?`, [userId]);

  if (!wallet) {
    await client.run(
      `INSERT INTO wallets (user_id, balance)
       VALUES (?, 0)
       ON CONFLICT(user_id) DO NOTHING`,
      [userId]
    );
    wallet = await client.get(`SELECT id, user_id, balance FROM wallets WHERE user_id = ?`, [userId]);
  }

  return wallet;
}

async function transferWalletPayment({ fromUserId, toUserId, bookingId, amount, client }) {
  if (!toUserId) {
    throw httpError(400, "This barber cannot receive wallet payments yet.");
  }

  const customerWallet = await ensureWallet(fromUserId, client);
  const barberWallet = await ensureWallet(toUserId, client);

  const debit = await client.run(
    `UPDATE wallets
     SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND balance >= ?`,
    [amount, customerWallet.id, amount]
  );

  if (!debit?.changes) {
    throw httpError(402, "Insufficient wallet balance.");
  }
  await client.run(
    `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [amount, barberWallet.id]
  );
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, direction, balance_bucket, amount, reference, description, metadata)
     VALUES ('customer', ?, ?, 'debit', 'available', ?, ?, ?, ?)`,
    [
      fromUserId,
      bookingId,
      amount,
      `wallet-booking-${bookingId}-customer`,
      `Booking #${bookingId} wallet payment`,
      JSON.stringify({ walletId: customerWallet.id }),
    ]
  );
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, direction, balance_bucket, amount, reference, description, metadata)
     VALUES ('barber_user', ?, ?, 'credit', 'available', ?, ?, ?, ?)`,
    [
      toUserId,
      bookingId,
      amount,
      `wallet-booking-${bookingId}-barber`,
      `Booking #${bookingId} wallet earning`,
      JSON.stringify({ walletId: barberWallet.id }),
    ]
  );
}

async function refundWalletPayment({ fromUserId, toUserId, bookingId, amount, client }) {
  if (!fromUserId || !toUserId || !amount) return false;

  const customerWallet = await ensureWallet(fromUserId, client);
  const barberWallet = await ensureWallet(toUserId, client);

  const debit = await client.run(
    `UPDATE wallets
     SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND balance >= ?`,
    [amount, barberWallet.id, amount]
  );

  if (!debit?.changes) {
    throw httpError(409, "Cannot refund this wallet booking because the barber wallet balance is insufficient.");
  }

  await client.run(
    `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [amount, customerWallet.id]
  );
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, direction, balance_bucket, amount, reference, description, metadata)
     VALUES ('customer', ?, ?, 'credit', 'available', ?, ?, ?, ?)`,
    [
      fromUserId,
      bookingId,
      amount,
      `wallet-refund-${bookingId}-customer`,
      `Booking #${bookingId} refund`,
      JSON.stringify({ walletId: customerWallet.id }),
    ]
  );
  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, direction, balance_bucket, amount, reference, description, metadata)
     VALUES ('barber_user', ?, ?, 'debit', 'available', ?, ?, ?, ?)`,
    [
      toUserId,
      bookingId,
      amount,
      `wallet-refund-${bookingId}-barber`,
      `Booking #${bookingId} refund`,
      JSON.stringify({ walletId: barberWallet.id }),
    ]
  );

  return true;
}

function canTransitionBooking({ booking, status, isBarberOwner, isCustomer }) {
  const current = String(booking?.status || "").toLowerCase();

  if (isCustomer) {
    return ["payment_pending", "pending", "confirmed"].includes(current) && status === "cancelled";
  }

  if (!isBarberOwner) return false;

  if (current === "pending") {
    return ["confirmed", "rejected", "cancelled"].includes(status);
  }
  if (current === "confirmed") {
    return ["completed", "cancelled"].includes(status);
  }

  return false;
}

/* ================= MAP BOOKING ================= */

async function mapBookingRow(row) {
  const barber = await getBarberById(row.barber_id);
  const teamMember = row.team_member_id
    ? await getTeamMemberById(row.team_member_id, row.barber_id).catch(() => null)
    : null;
  const customerUser = await getUsernameByUserId(row.customer_user_id);
  const customerProfile = await getCustomerProfileByUserId(row.customer_user_id);
  const barberOwner = barber?.owner_user_id ? await getUsernameByUserId(barber.owner_user_id) : null;

  return {
    ...row,
    business_name: barber?.business_name || "",
    location: barber?.location || "",
    barber_owner_username: barberOwner?.username || "",
    barber_username: barberOwner?.username || "",
    team_member_id: row.team_member_id || null,
    team_member_name: teamMember?.name || "",
    team_member_title: teamMember?.title || "",
    customer_username: customerUser?.username || "",
    customer_full_name: customerProfile?.full_name || customerUser?.username || "",
    payment_provider: row.payment_provider || row.payment_method || "",
    payment_reference: row.payment_reference || "",
    payment_customer_phone: row.payment_customer_phone || "",
    commission_amount: Number(row.commission_amount || 0),
    barber_amount: Number(row.barber_amount || 0),
  };
}

async function sendBookingConfirmationEmails(booking) {
  const barber = await getBarberById(booking.barber_id);
  const customerProfile = await getProfileByUserId(booking.customer_user_id);
  const customerUser = await getUsernameByUserId(booking.customer_user_id);
  const barberProfile = barber?.owner_user_id ? await getProfileByUserId(barber.owner_user_id) : null;
  const teamMember = booking.team_member_id
    ? await getTeamMemberById(booking.team_member_id, booking.barber_id).catch(() => null)
    : null;

  const base = {
    barberName: barber?.business_name || "Lineup barber",
    customerName: customerProfile?.full_name || customerUser?.username || "Customer",
    serviceName: booking.service_name,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    paymentMethod: booking.payment_method,
    price: booking.price,
    teamMemberName: teamMember?.name || "",
  };

  await Promise.allSettled([
    sendEmail({
      to: customerProfile?.email,
      ...bookingConfirmationEmail({
        ...base,
        recipientName: customerProfile?.full_name || customerUser?.username,
      }),
    }),
    sendEmail({
      to: barberProfile?.email,
      ...bookingConfirmationEmail({
        ...base,
        recipientName: barberProfile?.full_name || barber?.business_name,
      }),
    }),
  ]);
}

async function finalizeBookingPayment({ bookingId, actorUserId = null, forceVerify = false, client }) {
  const booking = await getBookingById(bookingId, client);
  if (!booking) {
    throw httpError(404, "Booking not found.");
  }

  const payment = await getPaymentTransactionByBookingId(bookingId, client);
  if (!payment) {
    throw httpError(404, "Payment transaction not found.");
  }

  if (payment.status === "successful" && booking.payment_status === "paid") {
    return {
      booking: await mapBookingRow(booking),
      payment,
      alreadyProcessed: true,
    };
  }

  if (forceVerify) {
    const verification = await getMobileMoneyService(payment.provider).verifyTransaction({
      providerReference: payment.provider_reference,
      reference: payment.internal_reference,
      amount: payment.gross_amount,
      provider: payment.provider,
    });

    if (!verification.success) {
      throw httpError(402, "Payment has not been completed yet.");
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

    await updatePaymentRecord({
      client,
      internalReference: payment.internal_reference,
      providerReference: verification.providerReference || payment.provider_reference || "",
      status: "successful",
      metadata: verification.rawResponse || {},
    });
  }

  const refreshedBooking = await getBookingById(bookingId, client);
  const refreshedPayment = await getPaymentTransactionByBookingId(bookingId, client);
  const canonicalPayment = await getPaymentRecordByBookingId(bookingId, client);
  const barber = await getBarberById(refreshedBooking.barber_id, client);

  await client.run(
    `UPDATE bookings
     SET status = 'confirmed',
         payment_status = 'paid',
         paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [bookingId]
  );

  await creditPendingBarberShare({
    client,
    barberId: refreshedBooking.barber_id,
    bookingId: refreshedBooking.id,
    paymentTransactionId: refreshedPayment.id,
    paymentId: canonicalPayment?.id || null,
    amount: Number(refreshedBooking.barber_amount || 0),
    reference: refreshedPayment.internal_reference,
    providerReference: refreshedPayment.provider_reference || "",
  });

  if (canonicalPayment) {
    await updatePaymentRecord({
      client,
      internalReference: canonicalPayment.internal_reference,
      providerReference: refreshedPayment.provider_reference || canonicalPayment.provider_reference || "",
      status: "successful",
      metadata: {
        source: "finalizeBookingPayment",
        bookingId: refreshedBooking.id,
      },
    });
  }

  await client.run(
    `INSERT INTO wallet_ledger
     (owner_type, owner_id, booking_id, payment_id, direction, balance_bucket, amount, reference, provider_reference, description, metadata)
     VALUES ('platform', NULL, ?, ?, 'credit', 'commission', ?, ?, ?, ?, ?)`,
    [
      refreshedBooking.id,
      canonicalPayment?.id || null,
      Number(refreshedBooking.commission_amount || 0),
      `${refreshedPayment.internal_reference}-commission`,
      refreshedPayment.provider_reference || "",
      `Platform commission captured for booking #${refreshedBooking.id}`,
      JSON.stringify({ bookingId: refreshedBooking.id }),
    ]
  );

  await client.run(
    `INSERT INTO payment_transactions
     (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, payer_phone, payee_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
     VALUES (?, ?, ?, 'commission', 'platform', ?, '', ?, '', ?, ?, ?, 'UGX', 'successful', ?)` ,
    [
      refreshedBooking.id,
      refreshedBooking.barber_id,
      refreshedBooking.customer_user_id,
      `${refreshedPayment.internal_reference}-commission`,
      refreshedBooking.payment_customer_phone || "",
      Number(refreshedBooking.commission_amount || 0),
      Number(refreshedBooking.commission_amount || 0),
      0,
      JSON.stringify({ source_payment_reference: refreshedPayment.internal_reference }),
    ]
  );

  await client.run(
    `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
     VALUES (?, ?, 'payment_confirmed', ?)`,
    [
      bookingId,
      actorUserId,
      `Payment verified. ${getMobileMoneyProviderLabel(refreshedPayment.provider)} collection succeeded.`,
    ]
  );

  await client.run(
    `INSERT INTO notifications (user_id, title, type, message, read)
     VALUES (?, 'Booking confirmed', 'booking', ?, 0)`,
    [
      refreshedBooking.customer_user_id,
      `Your booking payment was confirmed and the appointment is now secured.`,
    ]
  );

  if (barber?.owner_user_id) {
    await client.run(
      `INSERT INTO notifications (user_id, title, type, message, read)
       VALUES (?, 'New paid booking', 'booking', ?, 0)`,
      [
        barber.owner_user_id,
        `A paid booking was confirmed. UGX ${Number(refreshedBooking.barber_amount || 0).toLocaleString()} has been added to pending wallet balance.`,
      ]
    );
  }

  const updatedBooking = await getBookingById(bookingId, client);
  return {
    booking: await mapBookingRow(updatedBooking),
    payment: refreshedPayment,
    disbursement: null,
    alreadyProcessed: false,
  };
}

/* ================= CREATE BOOKING ================= */

export async function createBooking(req, res, next) {
  try {
    const barberId = toPositiveInteger(req.body.barber_id, "barber_id");
    const serviceId = toPositiveInteger(req.body.service_id, "service_id");
    const rawTeamMemberId = req.body.team_member_id ? toPositiveInteger(req.body.team_member_id, "team_member_id") : null;
    const bookingDate = requireIsoDate(req.body.booking_date, "booking_date");
    const normalizedBookingTime = requireClockTime(
      normalizeTimeInput(req.body.booking_time),
      "booking_time"
    );

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    if (bookingDate < today) {
      return res.status(400).json({
        success: false,
        message: "Cannot book a past date."
      });
    }

    if (bookingDate === today) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const reqMinutes = toMinutes(normalizedBookingTime);

      if (reqMinutes <= nowMinutes) {
        return res.status(400).json({
          success: false,
          message: "Selected time has already passed."
        });
      }
    }

    const idempotencyKey = String(req.body.idempotencyKey || req.get("Idempotency-Key") || "").trim().slice(0, 120);

    const { mappedBooking, payment } = await transaction(async (client) => {
      const barber = await getBarberById(barberId, client);
      if (!barber) {
        throw httpError(404, "Barber not found.");
      }
      const paymentMethod = normalizePaymentMethod(req.body.payment_method, barber);
      if (paymentMethod === "wallet" && !barber.owner_user_id) {
        throw httpError(400, "This barber cannot receive wallet payments yet.");
      }
      const teamCountRow = await getActiveTeamMemberCount(barberId, client);
      const requiresTeamMember =
        String(barber.stand_type || "individual").toLowerCase() === "shop" &&
        Number(teamCountRow?.count || 0) > 0;
      const teamMember = rawTeamMemberId
        ? await getTeamMemberById(rawTeamMemberId, barberId, client)
        : null;

      if (rawTeamMemberId && !teamMember) {
        throw httpError(400, "Selected barber is not available on this stand.");
      }

      if (requiresTeamMember && !teamMember) {
        throw httpError(400, "Choose a barber from this stand before booking.");
      }

      const service = await getBarberServiceById(serviceId, barberId, client);
      if (!service) {
        throw httpError(404, "Service not found.");
      }

      const active = await getActiveBookingsForCustomerWithBarber(req.user.id, barberId, client);
      if (active.length) {
        throw httpError(409, "You already have an active booking with this barber.");
      }

      const recent = await getRecentBookingForCustomerWithBarber(req.user.id, barberId, client);
      if (recent?.created_at) {
        const diff = Date.now() - new Date(recent.created_at).getTime();
        if (diff < 30 * 60 * 1000) {
          throw httpError(429, "Please wait before booking again.");
        }
      }

      const day = getDayOfWeek(bookingDate);
      const schedule = await getBarberScheduleForDay(barberId, day, client);
      const workingWindow = resolveWorkingWindow(barber, schedule);

      if (!isWithinSchedule(workingWindow, normalizedBookingTime, service.duration_minutes)) {
        throw httpError(
          400,
          `Outside working hours. Barber works ${workingWindow?.start || "--:--"} to ${workingWindow?.end || "--:--"}.`
        );
      }

      const existing = await getActiveBookingsForBarberOnDate(barberId, bookingDate, teamMember?.id || null, client);
      if (hasOverlap(existing, normalizedBookingTime, service.duration_minutes)) {
        throw httpError(409, "Time slot already booked.");
      }

      const totalPrice =
        Number(barber.price_from || 0) +
        Number(service.price_extra || 0);
      const { commissionAmount, barberAmount } = calculateCommissionBreakdown(totalPrice);
      const customerProfile = await getCustomerProfileByUserId(req.user.id, client);
      const paymentPhone = normalizePhoneNumber(req.body.payment_phone || customerProfile?.phone || "");
      const requiresMobileMoney = ["mtn_mobile_money", "airtel_money"].includes(paymentMethod);

      if (requiresMobileMoney && !paymentPhone) {
        throw httpError(400, "Add a valid phone number before paying with mobile money.");
      }

      if (requiresMobileMoney && idempotencyKey) {
        const duplicate = await client.get(
          `SELECT b.*
           FROM payment_transactions pt
           JOIN bookings b ON b.id = pt.booking_id
           WHERE pt.user_id = ?
             AND pt.idempotency_key = ?
             AND pt.transaction_type = 'booking_payment'
           ORDER BY pt.id DESC
           LIMIT 1`,
          [req.user.id, idempotencyKey]
        );

        if (duplicate) {
          const duplicatePayment = await getPaymentTransactionByBookingId(duplicate.id, client);
          return {
            mappedBooking: await mapBookingRow(duplicate),
            payment: duplicatePayment,
          };
        }
      }

      const result = await client.run(
        `INSERT INTO bookings
         (barber_id, customer_user_id, team_member_id, service_name, booking_date, booking_time, price, service_duration_minutes, status, payment_method, payment_status, paid_at, payment_provider, payment_customer_phone, commission_amount, barber_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          barberId,
          req.user.id,
          teamMember?.id || null,
          service.service_name,
          bookingDate,
          normalizedBookingTime,
          totalPrice,
          service.duration_minutes,
          requiresMobileMoney ? "payment_pending" : "pending",
          paymentMethod,
          paymentMethod === "wallet" ? "paid" : requiresMobileMoney ? "pending" : "unpaid",
          paymentMethod === "wallet" ? new Date().toISOString() : null,
          requiresMobileMoney ? paymentMethod : "",
          paymentPhone,
          commissionAmount,
          barberAmount,
        ]
      );

      const createdBooking = await getBookingById(result.lastID, client);
      let payment = null;

      if (paymentMethod === "wallet") {
        await transferWalletPayment({
          fromUserId: req.user.id,
          toUserId: barber.owner_user_id,
          bookingId: createdBooking.id,
          amount: totalPrice,
          client
        });
      }

      if (requiresMobileMoney) {
        const paymentReference = createReference("booking", createdBooking.id);
        const providerResult = await getMobileMoneyService(paymentMethod).initiateCollection({
          provider: paymentMethod,
          amount: totalPrice,
          phoneNumber: paymentPhone,
          reference: paymentReference,
          description: `Booking payment for ${barber.business_name}`,
          callbackUrl: env.mobileMoneyCallbackUrl || `${env.appPublicUrl}/api/payments/webhooks/mtn`,
        });
        const paymentStatus = normalizeLifecycleStatus(providerResult.status, "initiated");

        await client.run(
          `UPDATE bookings
           SET payment_reference = ?,
               payment_provider = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [paymentReference, paymentMethod, createdBooking.id]
        );

        await client.run(
          `INSERT INTO payment_transactions
           (booking_id, barber_id, user_id, transaction_type, provider, internal_reference, provider_reference, idempotency_key, payer_phone, gross_amount, commission_amount, net_amount, currency, status, metadata)
           VALUES (?, ?, ?, 'booking_payment', ?, ?, ?, ?, ?, ?, ?, ?, 'UGX', ?, ?)`,
          [
            createdBooking.id,
            barberId,
            req.user.id,
            paymentMethod,
            paymentReference,
            providerResult.providerReference || "",
            idempotencyKey,
            paymentPhone,
            totalPrice,
            commissionAmount,
            barberAmount,
            paymentStatus,
            JSON.stringify(providerResult.rawResponse || {}),
          ]
        );

        await createPaymentRecord({
          client,
          bookingId: createdBooking.id,
          barberId,
          userId: req.user.id,
          flowType: "booking",
          provider: paymentMethod,
          internalReference: paymentReference,
          providerReference: providerResult.providerReference || "",
          callbackUrl: env.mobileMoneyCallbackUrl || `${env.appPublicUrl}/api/payments/webhooks/mtn`,
          idempotencyKey,
          payerPhone: paymentPhone,
          grossAmount: totalPrice,
          commissionAmount,
          barberAmount,
          status: paymentStatus,
          metadata: providerResult.rawResponse || {},
        });

        payment = await getPaymentTransactionByBookingId(createdBooking.id, client);
      }

      await client.run(
        `INSERT INTO notifications (user_id, title, type, message, read)
         VALUES (?, ?, ?, ?, 0)`,
        [
          barber.owner_user_id,
          requiresMobileMoney ? "Booking awaiting payment" : "New booking",
          "booking",
          requiresMobileMoney
            ? `A customer started payment for ${normalizedBookingTime}. The slot will be confirmed after payment succeeds.`
            : `New booking at ${normalizedBookingTime}`,
        ]
      );

      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, ?, ?)`,
        [createdBooking.id, req.user.id, "created", "Booking created"]
      );

      await client.run(
        `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
        [req.user.id, `Created booking #${createdBooking.id}`]
      );

      return {
        booking: createdBooking,
        mappedBooking: await mapBookingRow(await getBookingById(createdBooking.id, client)),
        payment,
      };
    });

    if (mappedBooking.payment_status === "paid") {
      try {
        await sendBookingConfirmationEmails(mappedBooking);
        await sendPushToUser(mappedBooking.barber_owner_username, {
          title: "New booking",
          body: `${mappedBooking.customer_full_name} booked ${mappedBooking.service_name} at ${normalizedBookingTime}`
        });
      } catch {}
    }

    return res.status(201).json({
      success: true,
      booking: mappedBooking,
      payment: payment
        ? {
            reference: payment.internal_reference,
            provider: payment.provider,
            status: payment.status,
            gross_amount: Number(payment.gross_amount || 0),
            commission_amount: Number(payment.commission_amount || 0),
            barber_amount: Number(payment.net_amount || 0),
            payer_phone: payment.payer_phone || "",
            instructions: `Approve the ${getMobileMoneyProviderLabel(payment.provider)} prompt on your phone to confirm the booking.`,
          }
        : null,
    });
  } catch (error) {
    if (error?.code === "SQLITE_CONSTRAINT" && String(error.message || "").includes("bookings")) {
      return res.status(409).json({
        success: false,
        message: "Time slot already booked."
      });
    }

    next(error);
  }
}

/* ================= GET MY BOOKINGS ================= */

export async function getMyBookings(req, res, next) {
  try {
    const myBarber = await getMyOwnedBarber(req.user.id);

    let rows = [];

    if (myBarber) {
      rows = await all(
        `SELECT * FROM bookings
         WHERE barber_id = ?
         ORDER BY booking_date DESC, booking_time DESC, id DESC`,
        [myBarber.id]
      );
    } else {
      rows = await all(
        `SELECT * FROM bookings
         WHERE customer_user_id = ?
         ORDER BY booking_date DESC, booking_time DESC, id DESC`,
        [req.user.id]
      );
    }

    const bookings = [];
    for (const row of rows) {
      bookings.push(await mapBookingRow(row));
    }

    return res.status(200).json({
      success: true,
      bookings
    });
  } catch (error) {
    next(error);
  }
}

/* ================= GET BARBER DAY AVAILABILITY ================= */

export async function getBarberDayAvailability(req, res, next) {
  try {
    const { barber_id, booking_date, team_member_id } = req.query;

    if (!barber_id || !booking_date) {
      return res.status(400).json({
        success: false,
        message: "barber_id and booking_date are required."
      });
    }

    const barber = await getBarberById(barber_id);
    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Barber not found."
      });
    }

    const normalizedTeamMemberId = team_member_id ? toPositiveInteger(team_member_id, "team_member_id") : null;
    if (normalizedTeamMemberId) {
      const teamMember = await getTeamMemberById(normalizedTeamMemberId, barber_id);
      if (!teamMember) {
        return res.status(400).json({
          success: false,
          message: "Selected barber is not available on this stand."
        });
      }
    }

    const day = getDayOfWeek(booking_date);
    const schedule = await getBarberScheduleForDay(barber_id, day);
    const workingWindow = resolveWorkingWindow(barber, schedule);
    const bookings = await getAvailabilityBookingsForBarberOnDate(barber_id, booking_date, normalizedTeamMemberId);

    return res.status(200).json({
      success: true,
      availability: {
        barber_id: Number(barber_id),
        booking_date,
        workingWindow,
        bookings: bookings.map((item) => ({
          id: item.id,
          booking_time: normalizeTimeInput(item.booking_time),
          service_duration_minutes: Number(item.service_duration_minutes || 30),
          status: item.status,
          team_member_id: item.team_member_id || null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ================= UPDATE BOOKING STATUS ================= */

export async function updateBookingStatus(req, res, next) {
  try {
    const bookingId = req.params.id;
    const status = String(req.body.status || "").toLowerCase();

    const allowed = ["pending", "confirmed", "completed", "cancelled", "rejected"];
    if (!allowed.includes(String(status))) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking status."
      });
    }

    const { booking, mappedBooking, refunded, releasedToAvailable } = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      const myBarber = await getMyOwnedBarber(req.user.id, client);
      const isBarberOwner = myBarber && Number(myBarber.id) === Number(booking.barber_id);
      const isCustomer = Number(booking.customer_user_id) === Number(req.user.id);

      if (!isBarberOwner && !isCustomer) {
        throw httpError(403, "Not allowed to update this booking.");
      }

      if (!canTransitionBooking({ booking, status, isBarberOwner, isCustomer })) {
        throw httpError(400, "This booking cannot move to that status.");
      }

      let refunded = false;
      let releasedToAvailable = false;
      if (
        ["cancelled", "rejected"].includes(status) &&
        booking.payment_method === "wallet" &&
        booking.payment_status === "paid"
      ) {
        const barber = await getBarberById(booking.barber_id, client);
        refunded = await refundWalletPayment({
          fromUserId: booking.customer_user_id,
          toUserId: barber?.owner_user_id,
          bookingId: booking.id,
          amount: Number(booking.price || 0),
          client,
        });
      }

      if (
        ["cancelled", "rejected"].includes(status) &&
        ["mtn_mobile_money", "airtel_money"].includes(String(booking.payment_method || "")) &&
        booking.payment_status === "paid" &&
        booking.status !== "completed"
      ) {
        await reversePendingBarberShare({
          client,
          barberId: booking.barber_id,
          bookingId: booking.id,
          amount: Number(booking.barber_amount || 0),
          reference: booking.payment_reference || `booking-${booking.id}-cancelled`,
        }).catch(() => false);
      }

      if (
        status === "completed" &&
        ["mtn_mobile_money", "airtel_money"].includes(String(booking.payment_method || "")) &&
        booking.payment_status === "paid" &&
        booking.status !== "completed"
      ) {
        releasedToAvailable = await settlePendingBarberShare({
          client,
          barberId: booking.barber_id,
          bookingId: booking.id,
          amount: Number(booking.barber_amount || 0),
          reference: booking.payment_reference || `booking-${booking.id}-completed`,
        });
      }

      await client.run(
        `UPDATE bookings
         SET status = ?,
             payment_status = CASE
               WHEN ? = 1 THEN 'refunded'
               ELSE payment_status
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, refunded ? 1 : 0, bookingId]
      );

      const updated = await getBookingById(bookingId, client);
      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, ?, ?)`,
        [
          bookingId,
          req.user.id,
          refunded ? "wallet_refunded" : "status_changed",
          refunded ? `Changed to ${status} and refunded wallet payment` : `Changed to ${status}`,
        ]
      );

      return {
        booking,
        mappedBooking: await mapBookingRow(updated),
        refunded,
        releasedToAvailable,
      };
    });

    const myBarber = await getMyOwnedBarber(req.user.id);
    const isBarberOwner = myBarber && Number(myBarber.id) === Number(booking.barber_id);
    const barberForNotify = isBarberOwner ? null : await getBarberById(booking.barber_id);
    const notifyUserId = isBarberOwner ? booking.customer_user_id : barberForNotify?.owner_user_id || null;
    if (notifyUserId) {
      await addNotification(notifyUserId, {
        title: "Booking updated",
        type: "booking",
        message: refunded
          ? `Booking status changed to ${status}. Wallet payment was refunded.`
          : releasedToAvailable
          ? `Booking completed. Barber earnings are now available for withdrawal.`
          : `Booking status changed to ${status}`
      }).catch(() => {});
    }

    await logAudit(req.user.id, `Updated booking #${bookingId} to ${status}`);

    return res.status(200).json({
      success: true,
      booking: mappedBooking
    });
  } catch (error) {
    next(error);
  }
}

/* ================= CONFIRM CASH PAYMENT ================= */

export async function confirmCashPayment(req, res, next) {
  try {
    const bookingId = toPositiveInteger(req.params.id, "booking_id");

    const { mappedBooking } = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      const myBarber = await getMyOwnedBarber(req.user.id, client);
      const isBarberOwner = myBarber && Number(myBarber.id) === Number(booking.barber_id);
      if (!isBarberOwner) {
        throw httpError(403, "Only the barber can confirm cash payment.");
      }

      if (booking.payment_method !== "cash") {
        throw httpError(400, "Only cash bookings can be manually confirmed.");
      }

      if (booking.payment_status === "paid") {
        return {
          mappedBooking: await mapBookingRow(booking)
        };
      }

      await client.run(
        `UPDATE bookings
         SET payment_status = 'paid',
             paid_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bookingId]
      );

      await client.run(
        `INSERT INTO booking_events (booking_id, actor_user_id, event_type, event_note)
         VALUES (?, ?, 'cash_payment_confirmed', 'Cash payment confirmed by barber')`,
        [bookingId, req.user.id]
      );

      await client.run(
        `INSERT INTO notifications (user_id, title, type, message, read)
         VALUES (?, ?, ?, ?, 0)`,
        [booking.customer_user_id, "Payment confirmed", "booking", "Your cash payment was confirmed."]
      );

      const updated = await getBookingById(bookingId, client);
      return {
        mappedBooking: await mapBookingRow(updated)
      };
    });

    await logAudit(req.user.id, `Confirmed cash payment for booking #${bookingId}`);

    res.status(200).json({
      success: true,
      message: "Cash payment confirmed.",
      booking: mappedBooking
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyBookingPayment(req, res, next) {
  try {
    const bookingId = toPositiveInteger(req.params.id, "booking_id");

    const result = await transaction(async (client) => {
      const booking = await getBookingById(bookingId, client);
      if (!booking) {
        throw httpError(404, "Booking not found.");
      }

      if (Number(booking.customer_user_id) !== Number(req.user.id)) {
        throw httpError(403, "Only the customer can verify this payment.");
      }

      if (!["mtn_mobile_money", "airtel_money"].includes(String(booking.payment_method || ""))) {
        throw httpError(400, "This booking does not use mobile money.");
      }

      return finalizeBookingPayment({
        bookingId,
        actorUserId: req.user.id,
        forceVerify: true,
        client,
      });
    });

    try {
      await sendBookingConfirmationEmails(result.booking);
    } catch {}

    res.status(200).json({
      success: true,
      message: result.alreadyProcessed ? "Payment was already confirmed." : "Payment confirmed and booking secured.",
      booking: result.booking,
      disbursement: result.disbursement || null,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleBookingPaymentWebhook(req, res, next) {
  try {
    const bearerToken = String(req.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const providedToken = String(
      req.get("x-webhook-token") ||
      req.get("x-callback-token") ||
      bearerToken ||
      req.body.token ||
      req.query.token ||
      ""
    ).trim();
    if (env.mobileMoneyWebhookToken && providedToken !== env.mobileMoneyWebhookToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook token.",
      });
    }

    const reference = String(
      req.body.reference ||
      req.body.payment_reference ||
      req.body.externalId ||
      req.query.reference ||
      ""
    ).trim();
    const providerReference = String(
      req.body.provider_reference ||
      req.body.providerReference ||
      req.body.referenceId ||
      req.get("x-reference-id") ||
      req.query.provider_reference ||
      ""
    ).trim();
    const status = String(req.body.status || req.body.financialTransactionStatus || req.query.status || "pending").trim().toLowerCase();
    const provider = String(req.body.provider || req.query.provider || "").trim().toLowerCase() || "unknown";
    const payload = req.body || req.query || {};

    if (!reference && !providerReference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    const result = await transaction(async (client) => {
      const webhookEvent = await recordWebhookEvent({
        client,
        provider,
        reference,
        providerReference,
        signature: String(req.get("x-signature") || ""),
        payload,
        processingStatus: "received",
      });

      const payment = await client.get(
        `SELECT * FROM payment_transactions
         WHERE transaction_type = 'booking_payment'
           AND (internal_reference = ? OR provider_reference = ?)
         ORDER BY id DESC
         LIMIT 1`,
        [reference, providerReference]
      );

      if (!payment) {
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "ignored",
        });
        return null;
      }

      if (["failed", "rejected", "expired", "cancelled", "canceled"].includes(status)) {
        await client.run(
          `UPDATE payment_transactions
           SET status = 'failed',
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(payload), payment.id]
        );
        await client.run(
          `UPDATE bookings
           SET payment_status = 'failed',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payment.booking_id]
        );
        await updatePaymentRecord({
          client,
          internalReference: payment.internal_reference,
          providerReference,
          status: "failed",
          metadata: payload,
        });
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "processed_failed",
        });
        return { failed: true };
      }

      if (!["successful", "success", "completed", "paid"].includes(status)) {
        await client.run(
          `UPDATE payment_transactions
           SET status = 'pending',
               provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
               metadata = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            providerReference,
            JSON.stringify(payload),
            payment.id,
          ]
        );

        await client.run(
          `UPDATE bookings
           SET payment_status = 'pending',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payment.booking_id]
        );

        await updatePaymentRecord({
          client,
          internalReference: payment.internal_reference,
          providerReference,
          status: "pending",
          metadata: payload,
        });
        await markWebhookEventProcessed({
          client,
          eventId: webhookEvent.id,
          processingStatus: "processed_pending",
        });
        return { pending: true };
      }

      await client.run(
        `UPDATE payment_transactions
         SET status = 'successful',
             provider_reference = COALESCE(NULLIF(?, ''), provider_reference),
             metadata = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          providerReference,
          JSON.stringify(payload),
          payment.id,
        ]
      );

      await updatePaymentRecord({
        client,
        internalReference: payment.internal_reference,
        providerReference,
        status: "successful",
        metadata: payload,
      });

      await markWebhookEventProcessed({
        client,
        eventId: webhookEvent.id,
        processingStatus: "processed_successful",
      });

      return finalizeBookingPayment({
        bookingId: payment.booking_id,
        actorUserId: null,
        forceVerify: false,
        client,
      });
    });

    if (result?.booking) {
      try {
        await sendBookingConfirmationEmails(result.booking);
      } catch {}
    }

    res.status(200).json({
      success: true,
      message: result?.failed
        ? "Webhook recorded failed payment."
        : result?.pending
        ? "Webhook recorded pending payment."
        : "Webhook processed.",
    });
  } catch (error) {
    next(error);
  }
}
