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

export function updateBookingStatusRequest(bookingId, status) {
  return apiFetch(`/api/bookings/${bookingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function confirmCashPaymentRequest(bookingId) {
  return apiFetch(`/api/bookings/${bookingId}/payment/cash`, {
    method: "PATCH",
  });
}
