import {
  FiAlertCircle,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiRefreshCw,
  FiXCircle,
} from "react-icons/fi";

const BOOKING_STATUS_META = {
  pending: {
    label: "Waiting for confirmation",
    tone: "pending",
    Icon: FiClock,
    description: "Waiting for confirmation",
  },
  confirmed: {
    label: "Confirmed",
    tone: "confirmed",
    Icon: FiCheckCircle,
    description: "Your booking is confirmed",
  },
  completed: {
    label: "Completed",
    tone: "completed",
    Icon: FiCheck,
    description: "Booking completed",
  },
  cancelled: {
    label: "Cancelled",
    tone: "cancelled",
    Icon: FiXCircle,
    description: "Booking cancelled",
  },
  canceled: {
    label: "Cancelled",
    tone: "cancelled",
    Icon: FiXCircle,
    description: "Booking cancelled",
  },
  declined: {
    label: "Not accepted",
    tone: "declined",
    Icon: FiAlertCircle,
    description: "Booking not accepted",
  },
  rejected: {
    label: "Not accepted",
    tone: "declined",
    Icon: FiAlertCircle,
    description: "Booking not accepted",
  },
  rescheduled: {
    label: "Rescheduled",
    tone: "rescheduled",
    Icon: FiRefreshCw,
    description: "Booking rescheduled",
  },
};

function getBookingStatusMeta(status) {
  const key = String(status || "pending").toLowerCase().replaceAll("_", "-");
  return BOOKING_STATUS_META[key] || {
    label: String(status || "Pending").replaceAll("_", " "),
    tone: "neutral",
    Icon: FiCalendar,
    description: "Booking status",
  };
}

export default function BookingStatusChip({ status, className = "", size = "sm" }) {
  const meta = getBookingStatusMeta(status);
  const Icon = meta.Icon;

  return (
    <span
      className={`booking-status-chip-v1 ${meta.tone} ${size} ${className}`.trim()}
      aria-label={meta.description}
      title={meta.description}
      data-status={meta.tone}
    >
      <Icon aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
