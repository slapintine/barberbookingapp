import {
  FiBell,
  FiCalendar,
  FiChevronRight,
  FiCheck,
  FiClock,
  FiCreditCard,
  FiMapPin,
  FiScissors,
  FiShield,
  FiUser,
} from "react-icons/fi";
import logo from "../../assets/queless-logo-full.png";
import { getPaymentMethodLabel } from "../../utils/paymentLabels.js";

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Price on consultation";
  return `UGX ${amount.toLocaleString()}`;
}

function formatDateLabel(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function SummaryRow({ icon, label, value, description, extra, chevron = false }) {
  return (
    <div className="booking-confirm-row">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value || "Not provided"}</strong>
        {description ? <p>{description}</p> : null}
        {extra ? <em>{extra}</em> : null}
      </div>
      {chevron ? <FiChevronRight className="booking-confirm-chevron" /> : null}
    </div>
  );
}

export default function BookingConfirmationScreen({
  booking,
  provider,
  onViewDetails,
  onBackHome,
}) {
  const serviceName = booking?.service || booking?.serviceName || "Selected service";
  const providerName = booking?.barberName || provider?.business_name || "Queless provider";
  const location = booking?.location || provider?.location || "Location unavailable";
  const matchingService = Array.isArray(provider?.services)
    ? provider.services.find((service) => String(service?.service_name || service?.name || service?.title || "") === String(serviceName))
    : null;
  const serviceDescription =
    booking?.serviceDescription ||
    matchingService?.description ||
    matchingService?.service_description ||
    "";
  const isVerified =
    provider?.subscription?.features?.verifiedBadge ||
    String(provider?.verified || "").toLowerCase().includes("verified");

  return (
    <div className="booking-confirm-page">
      <div className="booking-confirm-brand">
        <img src={logo} alt="Queless" />
      </div>

      <div className="booking-confirm-success">
        <span>
          <FiCheck />
        </span>
        <h1>Booking confirmed!</h1>
        <p>Your service has been booked successfully.<br />We&apos;ll see you soon!</p>
      </div>

      <div className="booking-confirm-card">
        <div className="booking-confirm-card-title">Booking summary</div>

        <div className="booking-confirm-grid">
          <SummaryRow
            icon={<FiScissors />}
            label="Service"
            value={serviceName}
            description={serviceDescription}
            chevron
          />
          <SummaryRow
            icon={<FiUser />}
            label="Provider"
            value={providerName}
            extra={isVerified ? "Verified" : ""}
          />
          <SummaryRow icon={<FiMapPin />} label="Location" value={location} chevron />
          <div className="booking-confirm-split-row">
            <SummaryRow icon={<FiCalendar />} label="Date" value={formatDateLabel(booking?.date || booking?.dateValue)} />
            <SummaryRow icon={<FiClock />} label="Time" value={booking?.timeLabel || booking?.time} />
          </div>
          <div className="booking-confirm-split-row">
            <SummaryRow icon={<FiCreditCard />} label="Price" value={formatMoney(booking?.price)} />
            <SummaryRow icon={<FiShield />} label="Status" value={booking?.status || "pending"} />
          </div>
          <SummaryRow icon={<FiCreditCard />} label="Payment method" value={getPaymentMethodLabel(booking?.paymentMethod)} />
        </div>
      </div>

      <div className="booking-confirm-reminder">
        <span><FiBell /></span>
        <div>
          <strong>We&apos;ll be there!</strong>
          <small>You&apos;ll receive updates and reminders before your service.</small>
        </div>
      </div>

      <div className="booking-confirm-actions">
        <button type="button" className="booking-confirm-primary" onClick={onViewDetails}>
          View booking details
        </button>
        <button type="button" className="booking-confirm-secondary" onClick={onBackHome}>
          Back to home
        </button>
      </div>
    </div>
  );
}
