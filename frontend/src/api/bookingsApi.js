import { apiFetch } from "../config/api.js";

export function getMyBookings() {
  return apiFetch("/api/bookings/me");
}

export function getBookingAvailability({ barberId, bookingDate, teamMemberId }) {
  const query = new URLSearchParams({
    barber_id: String(barberId),
    booking_date: bookingDate,
  });
  if (teamMemberId) query.set("team_member_id", String(teamMemberId));
  return apiFetch(`/api/bookings/availability?${query.toString()}`);
}

export function createBookingRequest(payload) {
  return apiFetch("/api/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyBookingPaymentRequest(bookingId) {
  return apiFetch(`/api/bookings/${bookingId}/payment/verify`, {
    method: "POST",
  });
}

export function updateBookingStatusRequest(bookingId, status, options = {}) {
  const body = typeof status === "object" && status !== null
    ? status
    : { status, ...options };
  const headers = {};
  const idempotencyKey = body.idempotencyKey || body.idempotency_key;
  if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);
  return apiFetch(`/api/bookings/${bookingId}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

export function rescheduleBookingRequest(bookingId, { date, time }) {
  return apiFetch(`/api/bookings/${bookingId}/reschedule`, {
    method: "PATCH",
    body: JSON.stringify({ booking_date: date, booking_time: time }),
  });
}

export function confirmCashPaymentRequest(bookingId) {
  return apiFetch(`/api/bookings/${bookingId}/payment/cash`, {
    method: "PATCH",
  });
}
