import { useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiInbox, FiMapPin, FiNavigation, FiScissors, FiXCircle } from "react-icons/fi";
import { FaStar } from "react-icons/fa";
import { getPaymentMethodLabel } from "../utils/paymentLabels.js";
import { LIVE_DELAY_OPTIONS, getProviderLiveStatusActions } from "../utils/bookingLiveStatusUi.js";
import RequestCard from "../components/ui/RequestCard.jsx";

const ACTIVE_STATUSES = new Set(["pending", "confirmed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "rejected", "declined", "no_show"]);

function formatShortTime(value, fallback = "") {
  const [hoursRaw, minutesRaw] = String(value || "").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback || String(value || "");
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatEstimatedStart(booking, formatTimeLabel) {
  const timeLabel = formatShortTime(booking.estimatedStartTime, booking.timeLabel || formatTimeLabel(booking.time));
  if (booking.estimatedStartDate && booking.dateValue && booking.estimatedStartDate !== booking.dateValue) {
    return `${booking.estimatedStartDate} ${timeLabel}`;
  }
  return timeLabel;
}

function liveStatusMessage(booking) {
  const liveStatus = String(booking.liveStatus || "expected");
  if (liveStatus === "ready") return "Your provider is ready for you.";
  if (liveStatus === "running_late") return `The provider is running approximately ${booking.delayMinutes || 0} minutes late.`;
  if (liveStatus === "arrived") return "The provider has marked you as arrived.";
  if (liveStatus === "service_started") return "Service has started.";
  if (liveStatus === "service_completed") return "Service completed.";
  if (liveStatus === "no_show") return "This booking was marked as customer did not arrive.";
  return booking.liveStatusLabel || "Customer expected";
}

function leaveNowMessage(booking) {
  if (String(booking.status || "").toLowerCase() !== "confirmed") return "";
  if (!booking.location) return "";
  if (String(booking.liveStatus || "") === "ready") return "It may be a good time to leave now.";
  return "";
}

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
  approveBooking,
  rejectBooking,
  updateLiveBookingStatus,
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
  onCreateEarlierSlotAlert,
}) {
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [ratings, setRatings] = useState({});
  const [reviewErrors, setReviewErrors] = useState({});
  const [rescheduleId, setRescheduleId] = useState("");
  const [rescheduleDraft, setRescheduleDraft] = useState({ date: "", time: "" });
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [liveDrafts, setLiveDrafts] = useState({});
  const [liveUpdatingId, setLiveUpdatingId] = useState("");
  const [slotAlertMessage, setSlotAlertMessage] = useState({});
  const [slotAlertSubmittingId, setSlotAlertSubmittingId] = useState("");

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

  const createEarlierAlert = async (booking) => {
    if (!onCreateEarlierSlotAlert || slotAlertSubmittingId) return;
    setSlotAlertSubmittingId(String(booking.id));
    setSlotAlertMessage((prev) => ({ ...prev, [booking.id]: "" }));
    try {
      await onCreateEarlierSlotAlert(booking);
      setSlotAlertMessage((prev) => ({
        ...prev,
        [booking.id]: "Earlier-slot alert saved. Queless will show in-app alerts only when a real opening is found.",
      }));
    } catch (error) {
      setSlotAlertMessage((prev) => ({
        ...prev,
        [booking.id]: error?.userMessage || error?.message || "We could not save that alert right now.",
      }));
    } finally {
      setSlotAlertSubmittingId("");
    }
  };

  const getLiveDraft = (booking) => liveDrafts[booking.id] || {
    liveStatus: booking.liveStatus || "expected",
    delay: Number(booking.delayMinutes || 0),
    customDelay: Number(booking.delayMinutes || 0) || 5,
  };

  const setLiveDraftValue = (booking, patch) => {
    setLiveDrafts((current) => ({
      ...current,
      [booking.id]: {
        ...getLiveDraft(booking),
        ...patch,
      },
    }));
  };

  const submitLiveUpdate = async (booking, nextStatus) => {
    const draft = getLiveDraft(booking);
    const liveStatus = nextStatus || draft.liveStatus || "expected";
    const delay = draft.delay === "custom" ? draft.customDelay : draft.delay;
    const effectiveDelay = liveStatus === "running_late" ? Number(delay || 0) : 0;
    setLiveUpdatingId(String(booking.id));
    try {
      await updateLiveBookingStatus?.(booking.id, {
        live_status: liveStatus,
        delay_minutes: effectiveDelay,
        idempotencyKey: `${booking.id}-${liveStatus}-${effectiveDelay}-${Date.now()}`,
      });
    } finally {
      setLiveUpdatingId("");
    }
  };

  const renderLiveStatusPanel = (booking) => {
    if (!["confirmed", "completed", "no_show"].includes(String(booking.status || "").toLowerCase())) return null;
    const draft = getLiveDraft(booking);
    const queueValue = Number.isInteger(Number(booking.customersAhead)) ? Number(booking.customersAhead) : null;
    const startLabel = formatEstimatedStart(booking, formatTimeLabel);
    const leaveNow = leaveNowMessage(booking);
    const providerActions = isBarberView ? getProviderLiveStatusActions(booking) : [];
    const canUpdateDelay = providerActions.some((action) => action.value === "running_late");

    return (
      <div className="booking-live-panel-v1">
        <div className="booking-live-grid-v1">
          <div><span>Confirmed time</span><strong>{booking.timeLabel || formatTimeLabel(booking.time)}</strong></div>
          <div><span>Current status</span><strong>{booking.liveStatusLabel || "Customer expected"}</strong></div>
          <div><span>Estimated start</span><strong>{startLabel}</strong></div>
          <div><span>Approximate delay</span><strong>{Number(booking.delayMinutes || 0) > 0 ? `${booking.delayMinutes} minutes` : "On time"}</strong></div>
        </div>
        {queueValue !== null ? (
          <div className="booking-live-note-v1">
            {queueValue === 1 ? "One customer is currently ahead of you." : `${queueValue} customers are currently ahead of you.`}
          </div>
        ) : null}
        {!isBarberView ? (
          <>
            <div className="booking-live-note-v1">{liveStatusMessage(booking)}</div>
            {leaveNow ? <div className="booking-live-note-v1 ready"><FiNavigation /> {leaveNow}</div> : null}
            {booking.location ? <div className="booking-live-note-v1"><FiMapPin /> {booking.location}</div> : null}
          </>
        ) : null}

        {isBarberView && String(booking.status || "").toLowerCase() === "confirmed" ? (
          <div className="booking-live-provider-v1">
            {providerActions.length ? (
              <div className="booking-live-actions-v1">
                {providerActions
                  .filter((action) => action.value !== "running_late")
                  .map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      className="mini-action-btn-v4 success"
                      disabled={liveUpdatingId === String(booking.id)}
                      onClick={() => submitLiveUpdate(booking, action.value)}
                    >
                      {liveUpdatingId === String(booking.id) ? "Updating..." : action.label}
                    </button>
                  ))}
              </div>
            ) : null}
            {canUpdateDelay ? (
              <>
                <label>
                  Delay
                  <select
                    className="input-v4"
                    value={draft.delay}
                    onChange={(event) => setLiveDraftValue(booking, { delay: event.target.value === "custom" ? "custom" : Number(event.target.value) })}
                  >
                    {LIVE_DELAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {draft.delay === "custom" ? (
                  <label>
                    Minutes
                    <input
                      className="input-v4"
                      type="number"
                      min="0"
                      max="240"
                      value={draft.customDelay}
                      onChange={(event) => setLiveDraftValue(booking, { customDelay: event.target.value })}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  className="mini-action-btn-v4"
                  disabled={liveUpdatingId === String(booking.id)}
                  onClick={() => submitLiveUpdate(booking, "running_late")}
                >
                  {liveUpdatingId === String(booking.id) ? "Updating..." : "Running late"}
                </button>
              </>
            ) : null}
            {!providerActions.length ? (
              <div className="booking-live-note-v1">No further live status actions are available for this booking.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
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
      {renderLiveStatusPanel(booking)}
      <div className="inline-actions-v4">
        <span className={`booking-badge-v4 status-${booking.status || "pending"}`}>{booking.status}</span>
        {isBarberView && booking.status === "pending" && (
          <>
            <button type="button" className="mini-action-btn-v4 success" onClick={() => approveBooking(booking.id)}>Approve</button>
            <button type="button" className="mini-action-btn-v4 danger" onClick={() => rejectBooking(booking.id)}>Reject</button>
          </>
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

      {!isBarberView && String(booking.status || "").toLowerCase() === "confirmed" && onCreateEarlierSlotAlert ? (
        <div className="inline-actions-v4">
          <button
            type="button"
            className="mini-action-btn-v4"
            disabled={slotAlertSubmittingId === String(booking.id)}
            onClick={() => createEarlierAlert(booking)}
          >
            <FiCalendar /> {slotAlertSubmittingId === String(booking.id) ? "Saving alert..." : "Earlier slot alert"}
          </button>
          {slotAlertMessage[booking.id] ? <span className="profile-sub-v4">{slotAlertMessage[booking.id]}</span> : null}
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
