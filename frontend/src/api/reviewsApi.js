import { apiFetch } from "../config/api.js";

export function getBarberReviews(barberId) {
  return apiFetch(`/api/reviews/barber/${barberId}`);
}

export function createReview(payload) {
  const body = {
    booking_id: payload.booking_id ?? payload.bookingId,
    rating: payload.rating,
    review_text: payload.review_text ?? payload.text ?? "",
  };

  return apiFetch("/api/reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateReview(reviewId, payload) {
  const body = {
    rating: payload.rating,
    review_text: payload.review_text ?? payload.text ?? "",
  };

  return apiFetch(`/api/reviews/${reviewId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteReview(reviewId) {
  return apiFetch(`/api/reviews/${reviewId}`, {
    method: "DELETE",
  });
}

export function getMyReviews() {
  return apiFetch("/api/reviews/me");
}
