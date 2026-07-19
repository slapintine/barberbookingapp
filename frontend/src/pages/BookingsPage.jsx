import { useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiInbox, FiMapPin, FiScissors, FiXCircle } from "react-icons/fi";
import { FaStar } from "react-icons/fa";
import { getPaymentMethodLabel } from "../utils/paymentLabels.js";
import BookingStatusChip from "../components/ui/BookingStatusChip.jsx";
import RequestCard from "../components/ui/RequestCard.jsx";

const ACTIVE_STATUSES = new Set(["pending", "confirmed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "rejected", "declined"]);

function TabEmptyState({ icon, title, text, actionLabel, onAction }) {
  return (
    <div className="bookings-empty-v6">
      <span className="bookings-empty-icon-v6" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
      {actionLabel && onAction ? (
        <button type="button" className="bookings-empty-btn-v6" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function BookingsPage({
  role,
  bookings,
  quoteRequests = [],
  completeBooking,
  approveBooking,
  rejectBooking,
  rescheduleBooking,
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
  onExploreServices,
  onOpenRequestConversation,
  onViewProviderStand,
  onBookAgain,
}) {
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [ratings, setRatings] = useState({});
  const [reviewErrors, setReviewErrors] = useState({});
  const [rescheduleId, setRescheduleId] = useState("");
  const [rescheduleDraft, setRescheduleDraft] = useState({ date: "", time: "" });
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const isBarberView = role === "barber" && myBarberProfile;
  const visibleBookings = isBarberView
    ? bookings.filter((item) => barberMatchesBooking(item, myBarberProfile))
    : bookings;

  // Bucket bookings by lifecycle. Confirmed + pending appointments live under
  // Upcoming; quote/availability requests are tracked separately under Requests.
  const buckets = useMemo(() => {
    const upcoming = [];
    const completed = [];
    const cancelled = [];
    visibleBookings.forEach((booking) => {
      const status = String(booking.status || "pending").toLowerCase();
      if (status === "completed") completed.push(booking);
      else if (CANCELLED_STATUSES.has(status)) cancelled.push(booking);
      else if (ACTIVE_STATUSES.has(status)) upcoming.push(booking);
      else upcoming.push(booking);
    });
    return { upcoming, completed, cancelled, requests: quoteRequests };
  }, [visibleBookings, quoteRequests]);

  // Default to whichever tab holds a freshly-focused booking, else Upcoming.
  const initialTab = useMemo(() => {
    if (!focusBookingId) return "upcoming";
    const focused = visibleBookings.find((item) => String(item.id) === String(focusBookingId));
    const status = String(focused?.status || "").toLowerCase();
    if (status === "completed") return "completed";
    if (CANCELLED_STATUSES.has(status)) return "cancelled";
    return "upcoming";
  }, [focusBookingId, visibleBookings]);
  const [activeTab, setActiveTab] = useState(initialTab);

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { id: "requests", label: "Requests", count: buckets.requests.length },
    { id: "completed", label: "Completed", count: buckets.completed.length },
    { id: "cancelled", label: "Cancelled", count: buckets.cancelled.length },
  ];

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
    await submitReview(booking, Number(ratings[booking.id] || 5), text);
    setReviewDrafts((prev) => ({ ...prev, [booking.id]: "" }));
  };

  const openReschedule = (booking) => {
    setRescheduleId(String(booking.id));
    setRescheduleDraft({ date: booking.date || "", time: String(booking.time || "").slice(0, 5) });
    setRescheduleError("");
  };

  const submitReschedule = async (booking) => {
    if (!rescheduleDraft.date || !rescheduleDraft.time) {
      setRescheduleError("Choose a new date and time.");
      return;
    }
    setRescheduling(true);
    setRescheduleError("");
    try {
      await rescheduleBooking?.(booking.id, rescheduleDraft);
      setRescheduleId("");
    } catch (error) {
      setRescheduleError(error?.message || "Could not reschedule this booking.");
    } finally {
      setRescheduling(false);
    }
  };

  const renderBookingCard = (booking) => (
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
        <BookingStatusChip status={booking.status} className="booking-badge-v4" />
        {isBarberView && booking.status === "pending" && (
          <>
            <button type="button" className="mini-action-btn-v4 success" onClick={() => approveBooking(booking.id)}>Approve</button>
            <button type="button" className="mini-action-btn-v4 danger" onClick={() => rejectBooking(booking.id)}>Reject</button>
          </>
        )}
        {isBarberView && booking.status === "confirmed" && (
          <button type="button" className="mini-action-btn-v4 success" onClick={() => completeBooking(booking.id)}>Mark done</button>
        )}
        {["pending", "confirmed"].includes(booking.status) && (
          <button type="button" className="mini-action-btn-v4" onClick={() => openReschedule(booking)}>Reschedule</button>
        )}
        {isBarberView && booking.paymentMethod === "cash" && booking.paymentStatus !== "paid" && (
          <button type="button" className="mini-action-btn-v4 success" onClick={() => confirmCashPayment(booking.id)}>Confirm cash</button>
        )}
        {!isBarberView && (booking.status === "pending" || booking.status === "confirmed") && (
          <button type="button" className="mini-action-btn-v4 danger" onClick={() => cancelBooking(booking.id)}>Cancel</button>
        )}
        <button type="button" className="mini-action-btn-v4" onClick={() => onReportBooking?.(booking, isBarberView ? "Report customer" : "Report provider")}>
          {isBarberView ? "Report customer" : "Report provider"}
        </button>
      </div>

      {rescheduleId === String(booking.id) ? (
        <div className="booking-summary-v4">
          <div className="panel-title-v4 small-title-v4">Choose a new appointment</div>
          <label>
            Date
            <input
              className="input-v4"
              type="date"
              min={new Date().toISOString().split("T")[0]}
              value={rescheduleDraft.date}
              onChange={(event) => setRescheduleDraft((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label>
            Time
            <input
              className="input-v4"
              type="time"
              value={rescheduleDraft.time}
              onChange={(event) => setRescheduleDraft((current) => ({ ...current, time: event.target.value }))}
            />
          </label>
          <div className="inline-actions-v4">
            <button type="button" className="mini-action-btn-v4 success" disabled={rescheduling} onClick={() => submitReschedule(booking)}>
              {rescheduling ? "Saving..." : "Save new time"}
            </button>
            <button type="button" className="mini-action-btn-v4" disabled={rescheduling} onClick={() => setRescheduleId("")}>Cancel</button>
          </div>
          {rescheduleError ? <div className="auth-error">{rescheduleError}</div> : null}
        </div>
      ) : null}

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
                onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [booking.id]: e.target.value }))}
              />
              <button type="button" className="secondary-btn-v4" onClick={() => submitBookingReview(booking)}>
                Submit review
              </button>
              {reviewErrors[booking.id] ? <div className="auth-error">{reviewErrors[booking.id]}</div> : null}
            </>
          )}
        </div>
      )}

      {!isBarberView && booking.status === "completed" && onBookAgain ? (
        <div className="inline-actions-v4">
          <button type="button" className="mini-action-btn-v4 success" onClick={() => onBookAgain(booking)}>
            <FiCalendar /> Book again
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderActiveTab = () => {
    if (activeTab === "requests") {
      if (!buckets.requests.length) {
        return (
          <TabEmptyState
            icon={<FiInbox />}
            title="No active requests yet"
            text={isBarberView
              ? "Quote and availability requests from customers will appear here so you can respond."
              : "Quote requests and availability requests will appear here. Ask a provider for a quote and track their reply."}
            actionLabel={!isBarberView && onExploreServices ? "Explore services" : ""}
            onAction={onExploreServices}
          />
        );
      }
      return (
        <div className="request-list-v6">
          {buckets.requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              isProvider={isBarberView}
              onOpenConversation={onOpenRequestConversation}
              onViewStand={onViewProviderStand}
            />
          ))}
        </div>
      );
    }

    const list = buckets[activeTab] || [];
    if (!list.length) {
      const emptyByTab = {
        upcoming: {
          icon: <FiCalendar />,
          title: "No bookings yet",
          text: isBarberView
            ? "New customer bookings will land here for approval, so you never miss an appointment."
            : "When you book or request a service, it will appear here so you can track everything easily.",
          actionLabel: !isBarberView && onExploreServices ? "Find a provider" : "",
        },
        completed: {
          icon: <FiCheckCircle />,
          title: "No completed bookings yet",
          text: isBarberView
            ? "Once you mark bookings as done, they move here for your records."
            : "Finished appointments will appear here so you can rebook or leave a review.",
        },
        cancelled: {
          icon: <FiXCircle />,
          title: "Nothing cancelled",
          text: "Cancelled or declined bookings will show here. That's a good thing — your schedule is clear.",
        },
      };
      const config = emptyByTab[activeTab] || emptyByTab.upcoming;
      return (
        <TabEmptyState
          icon={config.icon}
          title={config.title}
          text={config.text}
          actionLabel={config.actionLabel}
          onAction={config.actionLabel ? onExploreServices : undefined}
        />
      );
    }

    return <div className="booking-list-v4 space-top">{list.map(renderBookingCard)}</div>;
  };

  return (
    <div className="content-v4 app-page-v4">
      <div className="panel-title-v4">{isBarberView ? "Incoming bookings" : "My bookings"}</div>

      <div className="bookings-tabs-v6" role="tablist" aria-label="Booking views">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "bookings-tab-v6 active" : "bookings-tab-v6"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 ? <span className="bookings-tab-count-v6">{tab.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="bookings-tab-panel-v6">{renderActiveTab()}</div>
    </div>
  );
}
