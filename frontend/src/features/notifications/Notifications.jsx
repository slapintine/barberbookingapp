import { useRef, useState } from "react";
import {
  FiArrowLeft,
  FiBell,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiCreditCard,
  FiInbox,
  FiMessageSquare,
  FiPackage,
  FiStar,
  FiTag,
  FiVolume2,
  FiX,
  FiZap,
} from "react-icons/fi";
import quelessIcon from "../../assets/queless-logo-icon.png";

/* ── Type → Icon mapping ───────────────────────────────────────── */
const TYPE_ICON_MAP = {
  message:      FiMessageSquare,
  chat:         FiMessageSquare,
  booking:      FiCalendar,
  payment:      FiCreditCard,
  wallet:       FiPackage,
  review:       FiStar,
  verification: FiCheckCircle,
  promo:        FiTag,
  promotion:    FiTag,
  subscription: FiZap,
  announcement: FiVolume2,
  system:       FiVolume2,
  info:         FiVolume2,
};

function getNotifIcon(type, title) {
  const t  = String(type  || "").toLowerCase();
  const ti = String(title || "").toLowerCase();
  for (const [key, Icon] of Object.entries(TYPE_ICON_MAP)) {
    if (t.includes(key) || ti.includes(key)) return Icon;
  }
  return FiBell;
}

function formatNotifTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month:  "numeric",
      day:    "numeric",
      year:   "numeric",
      hour:   "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ── Single notification card ──────────────────────────────────── */
function NotifCard({ item, onOpen }) {
  const Icon    = getNotifIcon(item.type, item.title);
  const isUnread = !item.read;

  return (
    <button
      type="button"
      className={`notif-card ${isUnread ? "notif-card--unread" : "notif-card--read"}`}
      onClick={() => onOpen?.(item)}
    >
      {isUnread && <span className="notif-unread-dot" aria-hidden="true" />}
      <span className="notif-icon-tile" aria-hidden="true">
        <Icon />
      </span>
      <div className="notif-body">
        <strong className="notif-card-title">{item.title || "Notification"}</strong>
        <p className="notif-card-preview">
          {item.description || item.message || ""}
        </p>
        <time className="notif-card-time" dateTime={item.createdAt}>
          {formatNotifTime(item.createdAt)}
        </time>
      </div>
      <FiChevronRight className="notif-chevron" aria-hidden="true" />
    </button>
  );
}

/* ── Skeleton placeholder card ─────────────────────────────────── */
function NotifSkeleton() {
  return (
    <div className="notif-card notif-card--skeleton" aria-hidden="true">
      <span className="notif-icon-tile notif-skel-tile" />
      <div className="notif-body">
        <div className="notif-skel notif-skel--title" />
        <div className="notif-skel notif-skel--preview" />
        <div className="notif-skel notif-skel--time" />
      </div>
    </div>
  );
}

/* ── Main notification screen ──────────────────────────────────── */
export function NotificationSheet({
  show,
  notifications,
  onClose,
  onOpenNotification,
  onMarkAllRead,
  loading = false,
}) {
  if (!show) return null;

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div
      className="notif-screen"
      role="dialog"
      aria-label="Notifications"
      aria-modal="true"
    >
      <div className="notif-page">
        {/* ── Header ─────────────────────────────────────── */}
        <header className="notif-header">
          <button
            type="button"
            className="notif-back-btn"
            onClick={onClose}
            aria-label="Go back"
          >
            <FiArrowLeft />
          </button>

          <h1 className="notif-page-title">Notifications</h1>

          <button
            type="button"
            className={`notif-mark-all-btn${!hasUnread ? " notif-mark-all-btn--done" : ""}`}
            onClick={onMarkAllRead}
            disabled={!hasUnread}
            aria-label="Mark all notifications as read"
          >
            <FiCheck className="notif-mark-all-icon" aria-hidden="true" />
            <span>Mark all as read</span>
          </button>
        </header>

        {/* ── List ───────────────────────────────────────── */}
        <div className="notif-list-wrap">
          {loading ? (
            <>
              <NotifSkeleton />
              <NotifSkeleton />
              <NotifSkeleton />
            </>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-icon">
                <FiInbox />
              </span>
              <strong>No notifications yet</strong>
              <p>
                Booking updates, messages, and payment alerts will appear
                here.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <NotifCard
                key={item.id}
                item={item}
                onOpen={onOpenNotification}
              />
            ))
          )}
        </div>

        {/* ── Bottom decoration ──────────────────────────── */}
        <div className="notif-foot-deco" aria-hidden="true">
          <span className="notif-foot-line" />
          <img src={quelessIcon} alt="" className="notif-foot-q" />
          <span className="notif-foot-line" />
        </div>
      </div>
    </div>
  );
}

/* ── Toast (keep existing design) ─────────────────────────────── */
export function NotificationToast({ toast, onOpen, onClose }) {
  const [dragX, setDragging]   = useState(0);
  const [isDragging, setIsDrag] = useState(false);
  const startXRef               = useRef(0);

  if (!toast) return null;

  const handlePointerDown = (e) => {
    startXRef.current = e.clientX || 0;
    setIsDrag(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    setDragging((e.clientX || 0) - startXRef.current);
  };

  const endDrag = () => {
    if (!isDragging) return;
    setIsDrag(false);
    if (Math.abs(dragX) > 90) onClose();
    setDragging(0);
  };

  return (
    <div
      className={`notification-toast-v5 toast-type-${toast.type || "system"} ${isDragging ? "dragging" : ""}`}
      role="status"
      aria-live="polite"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        transform: `translateX(calc(-50% + ${dragX}px))`,
        opacity:   Math.max(0.3, 1 - Math.abs(dragX) / 180),
      }}
    >
      <button type="button" className="notification-toast-main-v5" onClick={onOpen}>
        <div className="notification-toast-icon-v5">
          <FiBell />
        </div>
        <div className="notification-toast-copy-v5">
          <strong>{toast.title}</strong>
          <span>{toast.message || "Tap to open"}</span>
        </div>
      </button>

      <button
        type="button"
        className="notification-toast-close-v5"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Dismiss notification"
      >
        <FiX />
      </button>
    </div>
  );
}
