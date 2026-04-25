import { useRef, useState } from "react";
import { FiArrowLeft, FiBell, FiCheck, FiX } from "react-icons/fi";

export function NotificationSheet({
  show,
  notifications,
  onClose,
  onOpenNotification,
  onMarkAllRead,
}) {
  if (!show) return null;

  return (
    <>
      <div className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"} onClick={onClose} />
      <div className={show ? "booking-modal-v4 open notification-sheet-v4" : "booking-modal-v4 notification-sheet-v4"}>
        <div
          className="booking-modal-card-v4 notification-card-v4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="barber-profile-topbar-v4">
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiArrowLeft />
            </button>
            <div className="profile-top-title-v4">Notifications history</div>
            <button type="button" className="profile-back-btn-v4" onClick={onMarkAllRead}>
              <FiCheck />
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="empty-box-v4">No notifications yet.</div>
          ) : (
            <div className="notification-list-v4">
              {notifications.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.read ? "notification-item-v4 as-card read" : "notification-item-v4 as-card unread"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenNotification(item);
                  }}
                >
                  <div className="notification-copy-v4">
                    <div className="notification-title-v4">
                      <FiBell /> {item.title || "Notification"}
                    </div>
                    <div className="profile-sub-v4">{item.description || item.message || ""}</div>
                    <div className="tiny-meta-v4">{new Date(item.createdAt).toLocaleString()}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button className="secondary-btn-v4" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}

export function NotificationToast({ toast, onOpen, onClose }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  if (!toast) return null;

  const handlePointerDown = (e) => {
    startXRef.current = e.clientX || 0;
    setDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    const currentX = e.clientX || 0;
    setDragX(currentX - startXRef.current);
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > 90) onClose();
    setDragX(0);
  };

  return (
    <div
      className={`notification-toast-v5 toast-type-${toast.type || "system"} ${dragging ? "dragging" : ""}`}
      role="status"
      aria-live="polite"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        transform: `translateX(calc(-50% + ${dragX}px))`,
        opacity: Math.max(0.3, 1 - Math.abs(dragX) / 180),
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
