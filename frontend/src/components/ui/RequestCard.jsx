import { FiCalendar, FiClock, FiDollarSign, FiFileText, FiMapPin, FiMessageCircle, FiUser } from "react-icons/fi";

// Maps a raw quote/availability request status to friendly customer-facing copy
// and a tone used for the status pill colour.
const STATUS_META = {
  pending: { label: "Waiting for provider response", tone: "wait" },
  open: { label: "Waiting for provider response", tone: "wait" },
  quoted: { label: "Quote received", tone: "info" },
  responded: { label: "Quote received", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  confirmed: { label: "Accepted", tone: "success" },
  declined: { label: "Declined by provider", tone: "muted" },
  rejected: { label: "Declined by provider", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

function getStatusMeta(status) {
  const key = String(status || "pending").toLowerCase();
  return STATUS_META[key] || { label: status || "Pending", tone: "wait" };
}

function formatRequestedDate(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function formatPreferredDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * Presentational card for a quote / availability request. Works for both the
 * customer view (shows the provider) and the provider view (shows the customer).
 */
export default function RequestCard({ request, isProvider = false, onOpenConversation, onViewStand }) {
  if (!request) return null;

  const statusMeta = getStatusMeta(request.status);
  const counterpartyName = isProvider
    ? request.customerName || request.counterpartyName || "Customer"
    : request.providerName || request.counterpartyName || "Provider";
  const preferredLabel = formatPreferredDate(request.preferredDate);
  const budgetLabel =
    request.budget != null && Number(request.budget) > 0
      ? `UGX ${Number(request.budget).toLocaleString()}`
      : "";

  return (
    <article className="request-card-v6" id={`request-${request.id}`}>
      <header className="request-card-head-v6">
        <span className="request-card-kind-v6">{request.kind === "availability" ? "Availability request" : "Quote request"}</span>
        <span className={`status-pill-v6 tone-${statusMeta.tone}`}>{statusMeta.label}</span>
      </header>

      <div className="request-card-title-v6">
        <span className="request-card-avatar-v6" aria-hidden="true">
          {request.providerImage && !isProvider ? (
            <img
              src={request.providerImage}
              alt=""
              loading="lazy"
              onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
            />
          ) : (
            <FiUser />
          )}
        </span>
        <div className="request-card-title-copy-v6">
          <strong title={counterpartyName}>{counterpartyName}</strong>
          <span title={request.serviceName || "Service"}>{request.serviceName || "Service"}</span>
        </div>
      </div>

      <ul className="request-card-meta-v6">
        {preferredLabel ? (
          <li><FiCalendar aria-hidden="true" /><span>Preferred: {preferredLabel}</span></li>
        ) : null}
        {request.location ? (
          <li><FiMapPin aria-hidden="true" /><span>{request.location}</span></li>
        ) : null}
        {budgetLabel ? (
          <li><FiDollarSign aria-hidden="true" /><span>Budget: {budgetLabel}</span></li>
        ) : null}
        <li><FiClock aria-hidden="true" /><span>Sent {formatRequestedDate(request.createdAt)}</span></li>
      </ul>

      {request.description ? (
        <p className="request-card-notes-v6">
          <FiFileText aria-hidden="true" />
          <span>{request.description}</span>
        </p>
      ) : null}

      <footer className="request-card-actions-v6">
        <button type="button" className="request-card-btn-v6 primary" onClick={() => onOpenConversation?.(request)}>
          <FiMessageCircle aria-hidden="true" /> Open conversation
        </button>
        {!isProvider && onViewStand ? (
          <button type="button" className="request-card-btn-v6" onClick={() => onViewStand?.(request)}>
            View stand
          </button>
        ) : null}
      </footer>
    </article>
  );
}
