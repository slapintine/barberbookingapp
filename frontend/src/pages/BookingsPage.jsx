import { useState } from "react";
import { FiCalendar, FiMapPin, FiScissors } from "react-icons/fi";
import { FaStar } from "react-icons/fa";
import { getPaymentMethodLabel } from "../utils/paymentLabels.js";

function EmptyState({ title, text }) {
  return (
    <div className="empty-state-v7">
      <FiCalendar />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export default function BookingsPage({
  role,
  bookings,
  completeBooking,
  approveBooking,
  rejectBooking,
  cancelBooking,
  confirmCashPayment,
  myBarberProfile,
  submitReview,
  editReview,
  deleteReview,
  reviewedBookings = {},
  barberMatchesBooking,
  formatTimeLabel,
  focusBookingId = "",
  onReportBooking,
}) {
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [ratings, setRatings] = useState({});
  const [reviewErrors, setReviewErrors] = useState({});

  const isBarberView = role === "barber" && myBarberProfile;
  const visibleBookings = isBarberView
    ? bookings.filter((item) => barberMatchesBooking(item, myBarberProfile))
    : bookings;

  const submitBookingReview = async (booking) => {
    const text = String(reviewDrafts[booking.id] || "").trim();
    if (!ratings[booking.id]) {
      setReviewErrors((prev) => ({ ...prev, [booking.id]: "Choose a star rating first." }));
      return;
    }
    if (text.length < 8) {
      setReviewErrors((prev) => ({ ...prev, [booking.id]: "Write at least 8 characters before submitting." }));
      return;
    }
    setReviewErrors((prev) => ({ ...prev, [booking.id]: "" }));
    await submitReview(
      booking,
      Number(ratings[booking.id] || 5),
      text
    );
    setReviewDrafts((prev) => ({ ...prev, [booking.id]: "" }));
  };

  return (
    <div className="content-v4 app-page-v4">
      <div className="panel-title-v4">{isBarberView ? "Incoming bookings" : "My bookings"}</div>
      <div className="booking-list-v4 space-top">
        {visibleBookings.length === 0 ? (
          <EmptyState
            title={isBarberView ? "No incoming bookings yet" : "No bookings yet"}
            text={isBarberView ? "New customer bookings will land here for approval." : "Book a provider and your booking details will appear here."}
          />
        ) : (
          visibleBookings.map((booking) => (
            <div
              key={booking.id}
              id={`booking-${booking.id}`}
              className={String(focusBookingId || "") === String(booking.id) ? "simple-card-v4 booking-focused-v5" : "simple-card-v4"}
            >
              <div className="booking-name-v4">{isBarberView ? (booking.customerName || booking.customerUsername) : booking.barberName}</div>
              {booking.teamMemberName ? (
                <div className="booking-meta-v4">
                  <FiScissors /> Provider: {booking.teamMemberName}
                </div>
              ) : null}
              <div className="booking-meta-v4">
                <FiCalendar /> {booking.date} · {booking.timeLabel || formatTimeLabel(booking.time)}
              </div>
              <div className="booking-meta-v4">
                <FiScissors /> {booking.service || "Selected service"}
              </div>
              <div className="booking-meta-v4">
                <FiMapPin /> {booking.location || "Location unavailable"}
              </div>
              <div className="booking-meta-v4">
                Payment: {getPaymentMethodLabel(booking.paymentMethod)} · {booking.paymentStatus || "unpaid"}
              </div>
              <div className="inline-actions-v4">
                <span className={`booking-badge-v4 status-${booking.status || "pending"}`}>{booking.status}</span>
                {isBarberView && booking.status === "pending" && (
                  <>
                    <button className="mini-action-btn-v4 success" onClick={() => approveBooking(booking.id)}>Approve</button>
                    <button className="mini-action-btn-v4 danger" onClick={() => rejectBooking(booking.id)}>Reject</button>
                  </>
                )}
                {isBarberView && booking.status === "confirmed" && (
                  <button className="mini-action-btn-v4 success" onClick={() => completeBooking(booking.id)}>Mark done</button>
                )}
                {isBarberView && booking.paymentMethod === "cash" && booking.paymentStatus !== "paid" && (
                  <button className="mini-action-btn-v4 success" onClick={() => confirmCashPayment(booking.id)}>Confirm cash</button>
                )}
                {!isBarberView && (booking.status === "pending" || booking.status === "confirmed") && (
                  <button className="mini-action-btn-v4 danger" onClick={() => cancelBooking(booking.id)}>Cancel</button>
                )}
                <button className="mini-action-btn-v4" onClick={() => onReportBooking?.(booking, isBarberView ? "Report customer" : "Report provider")}>
                  {isBarberView ? "Report customer" : "Report provider"}
                </button>
              </div>

              {!isBarberView && booking.status === "completed" && (
                <div className="booking-summary-v4">
                  {reviewedBookings?.[String(booking.id)] ? (
                    <>
                      <div className="panel-title-v4 small-title-v4">Review submitted</div>
                      <div className="profile-sub-v4">Thanks for rating this booking. Each booking can only be reviewed once.</div>
                      <div className="star-input-v4 readonly" aria-label={`Your rating was ${reviewedBookings[String(booking.id)]?.rating || 0} stars`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className={Number(reviewedBookings[String(booking.id)]?.rating || 0) >= n ? "star-hit-v4 active" : "star-hit-v4"}
                          >
                            <FaStar />
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="panel-title-v4 small-title-v4">Rate {booking.barberName}</div>
                      <div className="profile-sub-v4">Tap the stars to choose your rating.</div>
                      <div className="star-input-v4">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            type="button"
                            key={n}
                            className={Number(ratings[booking.id] || 0) >= n ? "star-hit-v4 active" : "star-hit-v4"}
                            onClick={() => setRatings((prev) => ({ ...prev, [booking.id]: n }))}
                          >
                            <FaStar />
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="textarea-v4"
                        placeholder="How was your experience?"
                        value={reviewDrafts[booking.id] || ""}
                        onChange={(e) =>
                          setReviewDrafts((prev) => ({ ...prev, [booking.id]: e.target.value }))
                        }
                      />
                      <button
                        className="secondary-btn-v4"
                        onClick={() => submitBookingReview(booking)}
                      >
                        Submit review
                      </button>
                      {reviewErrors[booking.id] ? <div className="auth-error">{reviewErrors[booking.id]}</div> : null}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}



