import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import {
  FiArrowLeft,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiCreditCard,
  FiMapPin,
  FiMessageCircle,
  FiNavigation,
  FiScissors,
  FiSmartphone,
  FiStar,
  FiUsers,
  FiX,
} from "react-icons/fi";
import {
  getBookingPaymentOptions,
  getPaymentMethodLabel,
  isOnlinePaymentMethod,
} from "../../utils/paymentLabels.js";
import { formatServicePrice, getAvailableServices, getServiceBookingAmount, normalizeServiceForBooking } from "../../utils/serviceCatalog.js";

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString()}`;
}

function formatTo24Hour(timeStr) {
  const raw = String(timeStr || "").trim();
  if (!raw) return "";

  if (/^\d{2}:\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return raw;

  let hours = Number(match[1]);
  const minutes = match[2];
  const modifier = match[3].toUpperCase();

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function formatTimeLabel(timeStr) {
  const raw24 = formatTo24Hour(timeStr);
  if (!/^\d{2}:\d{2}$/.test(raw24)) return String(timeStr || "");

  const [hours, minutes] = raw24.split(":").map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBarberServices(barber) {
  if (!barber?.services?.length) {
    return [];
  }

  const available = getAvailableServices(barber.services);
  return available.length ? available : barber.services.map(normalizeServiceForBooking);
}

function isValidUgandaPhone(value) {
  return /^(\+?256|0)?[37]\d{8}$/.test(String(value || "").replace(/\s+/g, ""));
}

function getServiceLocationOptions(service, barber) {
  const serviceType = String(service?.location_type || service?.locationType || "provider_location").toLowerCase();
  const homeEnabled = Number(barber?.home_service_enabled || barber?.homeServiceEnabled || 0) === 1;
  const options = [{ value: "provider_location", label: "At Provider", meta: barber?.location || "Provider address" }];
  if (homeEnabled || serviceType === "customer_location") {
    options.push({ value: "customer_location", label: "At Your Location", meta: "Provider comes to you" });
  }
  return serviceType === "customer_location" && !homeEnabled ? options.slice(1) : options;
}

function getServicePriceState(service) {
  const label = formatServicePrice(service);
  const pricingType = String(service?.pricing_type || service?.pricingType || "fixed").toLowerCase();
  const hasDirectPrice = getServiceBookingAmount(service) > 0 || ["range", "starting_from"].includes(pricingType);
  return {
    label,
    quoteOnly: pricingType === "quote" || label === "Price unavailable" || (!hasDirectPrice && label !== "Price on consultation"),
  };
}

function getPriceCardParts(service) {
  const pricingType = String(service?.pricing_type || service?.pricingType || "fixed").toLowerCase();
  const state = getServicePriceState(service);
  if (pricingType === "quote" || state.quoteOnly) {
    return { top: "Quote", bottom: "required", quote: true };
  }
  if (pricingType === "range") {
    return { top: "UGX", bottom: formatServicePrice(service).replace(/UGX\s?/g, ""), small: true };
  }
  if (pricingType === "starting_from") {
    return { top: "From", bottom: formatServicePrice(service).replace(/From\s?/i, ""), small: true };
  }
  const amount = getServiceBookingAmount(service);
  return { top: "UGX", bottom: Number(amount || 0).toLocaleString() };
}

function getProviderCoords(barber) {
  const lat = Number(barber?.latitude);
  const lng = Number(barber?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function buildDirectionsUrl(barber) {
  const coords = getProviderCoords(barber);
  if (coords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
  }
  const query = encodeURIComponent(String(barber?.location || barber?.business_name || "").trim());
  return query ? `https://www.google.com/maps/search/?api=1&query=${query}` : "";
}

function getPortfolioImages(barber) {
  const raw = Array.isArray(barber?.portfolio) ? barber.portfolio : [];
  const urls = raw
    .map((item) => (typeof item === "string" ? item : item?.url || item?.image || item?.src || ""))
    .filter(Boolean);
  if (urls.length) return urls;
  return Array.isArray(barber?.gallery) ? barber.gallery.filter(Boolean) : [];
}

function getDateParts(value, fallbackLabel) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { weekday: fallbackLabel || "", day: "" };
  }
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    day: date.getDate(),
  };
}

function getMonthLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getLocationChipLabel(service, barber) {
  const type = String(service?.location_type || service?.locationType || "provider_location").toLowerCase();
  if (type === "customer_location") return "Home";
  if (type === "online") return "Online";
  const standType = String(barber?.stand_type || barber?.standType || "").toLowerCase();
  return standType === "shop" ? "At Studio" : "Provider";
}

const miniPinIcon = new L.DivIcon({
  className: "bk-mini-pin-wrap",
  html: `<span class="bk-mini-pin"></span>`,
  iconSize: [30, 38],
  iconAnchor: [15, 36],
});

function MiniMapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function LocationMiniMap({ coords }) {
  if (!coords) {
    return (
      <div className="bk-map-placeholder" aria-hidden="true">
        <FiMapPin />
      </div>
    );
  }
  return (
    <div className="bk-map-frame">
      <MapContainer
        center={[coords.lat, coords.lng]}
        zoom={15}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl={false}
        className="bk-map-leaflet"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[coords.lat, coords.lng]} icon={miniPinIcon} />
        <MiniMapResizer />
      </MapContainer>
    </div>
  );
}

export default function BookingModal({
  show,
  barber,
  dateOptions,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  timeSlots,
  availabilityStatus,
  selectedService,
  setSelectedService,
  selectedTeamMemberId,
  setSelectedTeamMemberId,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  paymentPhone,
  setPaymentPhone,
  bookingLocationType,
  setBookingLocationType,
  bookingAddress,
  setBookingAddress,
  locationDetecting,
  onUseCurrentLocation,
  onRequestQuote,
  onMessageProvider,
  pendingPayment,
  onVerifyPayment,
  onlinePaymentsReady = false,
  paymentReadinessMessage = "",
  onClose,
  onOpenSmartMatch,
  smartMatchPremiumActive = false,
  onConfirm,
  creatingBooking,
  bookingCooldownInfo,
  walletBalance = 0,
}) {
  const modalKey = `${show ? "open" : "closed"}|${barber?.id || ""}`;
  const [stepEntry, setStepEntry] = useState({ key: "", value: 0 });
  const step = stepEntry.key === modalKey ? stepEntry.value : 0;
  const setStep = (updater) => {
    setStepEntry((prev) => {
      const current = prev.key === modalKey ? prev.value : 0;
      return {
        key: modalKey,
        value: typeof updater === "function" ? updater(current) : updater,
      };
    });
  };
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [showAllWork, setShowAllWork] = useState(false);
  const [lightboxImage, setLightboxImage] = useState("");
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [tutorDetails, setTutorDetails] = useState({
    subject: "",
    studentLevel: "",
    lessonMode: "",
    duration: "",
    notes: "",
  });
  if (!show || !barber) return null;

  const services = getBarberServices(barber);
  const serviceObj =
    services.find((item) => String(item.id) === String(selectedService)) || services[0];
  if (!services.length) {
    return (
      <>
        <button
          type="button"
          className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"}
          onClick={onClose}
          aria-label="Close booking modal"
        />
        <div className={show ? "booking-modal-v4 bk-fullpage open" : "booking-modal-v4 bk-fullpage"}>
          <div className="booking-modal-card-v4 booking-modal-clean-v5 bk-shell">
            <div className="booking-modal-shell-v5">
              <div className="booking-modal-scroll-v5 bk-scroll">
                <div className="bk-topbar">
                  <button type="button" className="bk-icon-btn" onClick={onClose} aria-label="Back">
                    <FiArrowLeft />
                  </button>
                  <div className="bk-topbar-copy">
                    <strong>No bookable services</strong>
                    <span>This provider has not added services yet.</span>
                  </div>
                  <span className="bk-icon-btn bk-icon-btn-ghost" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const total = Number(barber.price_from || 0) + getServiceBookingAmount(serviceObj);
  const isTutorService = [serviceObj?.category, barber?.business_type, barber?.category_name]
    .filter(Boolean)
    .some((value) => /tutor|lesson|education|academic/i.test(String(value)));
  const priceState = getServicePriceState(serviceObj);
  const isQuoteService = priceState.quoteOnly || String(serviceObj?.pricing_type || "").toLowerCase() === "quote";
  const totalLabel = isQuoteService ? "Quote required" : formatMoney(total);
  const priceCard = getPriceCardParts(serviceObj);
  const teamMembers = Array.isArray(barber.team_members || barber.teamMembers)
    ? (barber.team_members || barber.teamMembers).filter((item) => Number(item?.is_active ?? item?.isActive ?? 1) === 1)
    : [];
  const isShopStand = String(barber.stand_type || barber.standType || "individual") === "shop";
  const requiresTeamMember = isShopStand && teamMembers.length > 0;
  const selectedTeamMember = teamMembers.find((item) => String(item.id) === String(selectedTeamMemberId));
  const paymentOptions = getBookingPaymentOptions({
    onlinePaymentsEnabled: onlinePaymentsReady,
    walletPaymentsEnabled: true,
    walletBalance,
    bookingAmount: total,
  });
  const paymentAllowed = paymentOptions.some((option) => option.value === selectedPaymentMethod && !option.disabled);
  const selectedPaymentLabel = getPaymentMethodLabel(selectedPaymentMethod);
  const showsPlatformSplit = isOnlinePaymentMethod(selectedPaymentMethod);
  const requiresPhone = isOnlinePaymentMethod(selectedPaymentMethod);
  const phoneIsValid = !requiresPhone || isValidUgandaPhone(paymentPhone);
  const locationOptions = getServiceLocationOptions(serviceObj, barber);
  const selectedLocationType = bookingLocationType || locationOptions[0]?.value || "";
  const isHomeService = selectedLocationType === "customer_location";
  const locationValid =
    Boolean(selectedLocationType) &&
    (!isHomeService || String(bookingAddress || "").trim().length >= 3);
  const selectedTimeLabel =
    timeSlots.find((item) => item.value === selectedTime)?.label ||
    (selectedTime ? formatTimeLabel(selectedTime) : "Pick a time");
  const selectedDateLabel = (() => {
    const opt = dateOptions.find((item) => item.value === selectedDate);
    if (!opt) return "Pick a date";
    const date = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return opt.label;
    return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  })();

  const coords = getProviderCoords(barber);
  const directionsUrl = buildDirectionsUrl(barber);
  const workImages = getPortfolioImages(barber);
  const visibleWork = showAllWork ? workImages : workImages.slice(0, 3);
  const rating = Number(barber.rating || 0);
  const ratingLabel = rating > 0 ? rating.toFixed(1) : "New";
  const reviewCount = Number(barber.reviewCount || 0);
  const isVerified = Boolean(
    barber.is_verified === 1 || barber.is_verified === true || barber.isVerified || String(barber.verified || "").toLowerCase() === "verified"
  );

  const bookReady =
    Boolean(selectedService) &&
    Boolean(selectedDate) &&
    Boolean(selectedTime) &&
    locationValid &&
    (!requiresTeamMember || Boolean(selectedTeamMember));
  const paymentReady = paymentAllowed && phoneIsValid;

  const isBlocked =
    creatingBooking ||
    bookingCooldownInfo?.blocked ||
    !selectedService ||
    isQuoteService ||
    !selectedTime ||
    !selectedDate ||
    !locationValid ||
    !paymentAllowed ||
    !phoneIsValid ||
    (requiresTeamMember && !selectedTeamMember);

  if (pendingPayment?.bookingId) {
    return (
      <>
        <button
          type="button"
          className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"}
          onClick={onClose}
          aria-label="Close booking modal"
        />
        <div className={show ? "booking-modal-v4 bk-fullpage open" : "booking-modal-v4 bk-fullpage"}>
          <div className="booking-modal-card-v4 booking-modal-clean-v5 bk-shell">
            <div className="booking-modal-shell-v5">
              <div className="booking-modal-scroll-v5 bk-scroll">
                <div className="bk-topbar">
                  <button type="button" className="bk-icon-btn" onClick={onClose} aria-label="Back">
                    <FiArrowLeft />
                  </button>
                  <div className="bk-topbar-copy">
                    <strong>Confirm payment</strong>
                    <span>Your slot locks in after approval</span>
                  </div>
                  <button type="button" className="bk-icon-btn" onClick={onClose} aria-label="Close">
                    <FiX />
                  </button>
                </div>

                <div className="bk-summary-card">
                  <div className="bk-summary-head">
                    <div>
                      <strong>{barber.business_name}</strong>
                      <span>{pendingPayment.instructions || "Approve the prompt on your phone."}</span>
                    </div>
                    <div className="bk-summary-total">{formatMoney(pendingPayment.grossAmount || total)}</div>
                  </div>
                  <div className="bk-summary-rows">
                    <div className="bk-summary-row"><span>Provider</span><strong>{pendingPayment.provider === "airtel_money" ? "Airtel Money" : "MTN Mobile Money"}</strong></div>
                    <div className="bk-summary-row"><span>Customer pays</span><strong>{formatMoney(pendingPayment.grossAmount || total)}</strong></div>
                    <div className="bk-summary-row"><span>Platform commission</span><strong>{formatMoney(pendingPayment.commissionAmount || 0)}</strong></div>
                    <div className="bk-summary-row"><span>Provider payout</span><strong>{formatMoney(pendingPayment.barberAmount || 0)}</strong></div>
                    <div className="bk-summary-row"><span>Reference</span><strong>{pendingPayment.reference}</strong></div>
                    <div className="bk-summary-row"><span>Phone</span><strong>{pendingPayment.phoneNumber || "Saved profile phone"}</strong></div>
                  </div>
                </div>
              </div>

              <div className="bk-footer">
                <button type="button" className="bk-cta-primary" onClick={() => onVerifyPayment?.(pendingPayment.bookingId)} disabled={creatingBooking}>
                  {creatingBooking ? "Checking payment..." : "I approved the payment"}
                </button>
                <div className="bk-footer-note">The platform keeps 10% and sends 90% to the provider after confirmation.</div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Fixed-price bookings use a 4-step wizard: 0 Service → 1 Date & time →
  // 2 Location → 3 Review & pay. Quote services keep a single page that hands
  // off to the full-page QuoteRequestModal. Every advance reuses the existing
  // validation, and the final confirm is still gated on !isBlocked, so the
  // wizard cannot let an incomplete booking through.
  const isWizard = !isQuoteService;
  const WIZARD_STEPS = ["Service", "Date & time", "Location", "Review"];
  const onPaymentStep = isWizard && step === 3; // the review + payment step

  const canAdvance = (() => {
    if (!isWizard) return Boolean(selectedService);
    if (step === 0) return Boolean(selectedService) && (!requiresTeamMember || Boolean(selectedTeamMember));
    if (step === 1) return Boolean(selectedDate) && Boolean(selectedTime);
    if (step === 2) return locationValid;
    return !isBlocked; // step 3 → confirm
  })();

  const footerLabel = !isWizard
    ? "Send Quote Request"
    : step === 0 || step === 1
    ? "Continue"
    : step === 2
    ? "Continue to Payment"
    : creatingBooking
    ? "Confirming booking…"
    : "Confirm Booking";
  const footerDisabled = !canAdvance;

  const handlePrimary = () => {
    if (!isWizard) {
      onRequestQuote?.();
      return;
    }
    if (step < 3) {
      if (canAdvance) setStep(step + 1);
      return;
    }
    onConfirm?.({
      bookingDetails: isTutorService ? { type: "tutor_lesson", ...tutorDetails } : null,
    });
  };

  const handleBack = () => {
    if (isWizard && step > 0) setStep(step - 1);
    else onClose?.();
  };

  // which detail sections show for the current wizard step (quote shows all)
  const showStep = (n) => !isWizard || step === n;

  return (
    <>
      <button
        type="button"
        className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"}
        onClick={onClose}
        aria-label="Close booking modal"
      />
      <div className={show ? "booking-modal-v4 bk-fullpage open" : "booking-modal-v4 bk-fullpage"} data-testid="booking-page">
        <div className="booking-modal-card-v4 booking-modal-clean-v5 bk-shell">
          <div className="booking-modal-shell-v5">
            <div className="booking-modal-scroll-v5 bk-scroll">
              <div className="bk-topbar">
                <button type="button" className="bk-icon-btn" onClick={handleBack} aria-label="Back">
                  <FiArrowLeft />
                </button>
                <div className="bk-topbar-copy">
                  <strong>{isQuoteService ? "Request a Quote" : "Book Service"}</strong>
                  <span>{barber.business_name}</span>
                </div>
                <button type="button" className="bk-icon-btn" onClick={onClose} aria-label="Close">
                  <FiX />
                </button>
              </div>

              {isWizard ? (
                <ol className="bk-stepper" aria-label="Booking steps">
                  {WIZARD_STEPS.map((label, index) => (
                    <li
                      key={label}
                      className={
                        index === step
                          ? "bk-step is-current"
                          : index < step
                          ? "bk-step is-done"
                          : "bk-step"
                      }
                      aria-current={index === step ? "step" : undefined}
                    >
                      <span className="bk-step-dot">{index < step ? <FiCheck /> : index + 1}</span>
                      <span className="bk-step-label">{label}</span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {onPaymentStep ? (
                <>
                  <div className="bk-section">
                    <div className="bk-section-head">
                      <h3><FiSmartphone /> Payment method</h3>
                      <span>Required to confirm</span>
                    </div>
                    <div className="bk-payment-list">
                      {paymentOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          className={selectedPaymentMethod === option.value ? "bk-payment-option active" : "bk-payment-option"}
                          disabled={option.disabled}
                          onClick={() => setSelectedPaymentMethod(option.value)}
                        >
                          <span className="bk-payment-icon"><FiSmartphone /></span>
                          <span className="bk-payment-copy">
                            <strong>{option.label}</strong>
                            <small>{option.meta}</small>
                          </span>
                          <span className="bk-payment-pill">{option.pill}</span>
                        </button>
                      ))}
                    </div>
                    {!onlinePaymentsReady && paymentReadinessMessage ? (
                      <div className="bk-warning">{paymentReadinessMessage}</div>
                    ) : null}
                    {requiresPhone ? (
                      <label className="bk-field">
                        <span>{selectedPaymentLabel} number</span>
                        <input
                          type="tel"
                          value={paymentPhone || ""}
                          onChange={(event) => setPaymentPhone?.(event.target.value)}
                          placeholder="0772123456"
                          inputMode="tel"
                          autoComplete="tel"
                        />
                        <small>
                          {phoneIsValid
                            ? "We will send an approval prompt to this number."
                            : "Use a Uganda number such as 0772123456 or +256772123456."}
                        </small>
                      </label>
                    ) : null}
                  </div>

                  <div className="bk-summary-card">
                    <div className="bk-summary-head">
                      <div>
                        <strong>{isQuoteService ? "Quote Request Summary" : "Booking summary"}</strong>
                        <span>{isQuoteService ? "The provider will reply with pricing" : "Review before you confirm"}</span>
                      </div>
                      <div className="bk-summary-total">{totalLabel}</div>
                    </div>
                    <div className="bk-summary-rows">
                      <div className="bk-summary-row"><span>Service</span><strong>{serviceObj?.service_name || "Service"}</strong></div>
                      {isShopStand ? <div className="bk-summary-row"><span>Provider</span><strong>{selectedTeamMember?.name || "Any available"}</strong></div> : null}
                      <div className="bk-summary-row"><span>When</span><strong>{selectedDateLabel} • {selectedTimeLabel}</strong></div>
                      <div className="bk-summary-row"><span>Location</span><strong>{isHomeService ? (bookingAddress || "Your location") : barber.location}</strong></div>
                      <div className="bk-summary-row"><span>Payment</span><strong>{paymentAllowed ? selectedPaymentLabel : "Choose payment"}</strong></div>
                      {showsPlatformSplit ? (
                        <>
                          <div className="bk-summary-row"><span>Platform commission</span><strong>{formatMoney(total * 0.1)}</strong></div>
                          <div className="bk-summary-row"><span>Provider receives</span><strong>{formatMoney(total * 0.9)}</strong></div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {bookingCooldownInfo?.blocked ? <div className="bk-warning">{bookingCooldownInfo.reason}</div> : null}
                </>
              ) : (
                <>
                  {/* Provider / service hero */}
                  <div className="bk-hero">
                    <div className="bk-hero-avatar">
                      <img
                        src={barber.image}
                        alt={barber.business_name}
                        loading="lazy"
                        onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                      />
                      <span className="bk-hero-dot" />
                    </div>
                    <div className="bk-hero-copy">
                      <div className="bk-hero-name-row">
                        <strong className="bk-hero-name">{barber.business_name}</strong>
                        {isVerified ? <span className="bk-verified" title="Verified"><FiCheck /></span> : null}
                      </div>
                      <span className="bk-rating-pill"><FiStar /> {ratingLabel}{reviewCount ? ` (${reviewCount} review${reviewCount === 1 ? "" : "s"})` : ""}</span>
                      <div className="bk-service-line">
                        <h2 className="bk-service-title">{serviceObj?.service_name || "Service"}</h2>
                        {serviceObj?.description ? <p className="bk-service-desc">{serviceObj.description}</p> : null}
                      </div>
                    </div>
                    <div className={priceCard.quote ? "bk-price-card is-quote" : "bk-price-card"}>
                      <span className="bk-price-top">{priceCard.top}</span>
                      <strong className={priceCard.small ? "bk-price-amt bk-price-amt-sm" : "bk-price-amt"}>{priceCard.bottom}</strong>
                    </div>
                  </div>

                  {showStep(0) && services.length > 1 ? (
                    <div className="bk-service-switch">
                      <button type="button" className="bk-service-switch-btn" onClick={() => setShowServicePicker((value) => !value)}>
                        <FiScissors /> {showServicePicker ? "Hide services" : "Change service"} <FiChevronDown className={showServicePicker ? "bk-rot" : ""} />
                      </button>
                      {showServicePicker ? (
                        <div className="bk-service-options">
                          {services.map((item) => {
                            const active = String(selectedService) === String(item.id);
                            const itemPrice = getServicePriceState(item);
                            return (
                              <button
                                type="button"
                                key={item.id}
                                className={active ? "bk-service-option active" : "bk-service-option"}
                                onClick={() => { setSelectedService(item.id); setShowServicePicker(false); }}
                              >
                                <span className="bk-service-option-copy">
                                  <strong>{item.service_name}</strong>
                                  <small>{item.duration_minutes} min</small>
                                </span>
                                <span className="bk-service-option-price">{itemPrice.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Recent work */}
                  {showStep(0) && workImages.length ? (
                    <div className="bk-section bk-section-flat">
                      <div className="bk-section-head">
                        <h3>Recent work</h3>
                        {workImages.length > 3 ? (
                          <button type="button" className="bk-link" onClick={() => setShowAllWork((value) => !value)}>
                            {showAllWork ? "Show less" : "View all"}
                          </button>
                        ) : null}
                      </div>
                      <div className="bk-work-grid">
                        {visibleWork.map((src, index) => (
                          <button type="button" key={`${src}-${index}`} className="bk-work-thumb" onClick={() => setLightboxImage(src)}>
                            <img src={src} alt="Recent work" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Quick info chips */}
                  {showStep(0) && (
                  <div className="bk-chips">
                    <div className="bk-chip">
                      <span className="bk-chip-icon"><FiClock /></span>
                      <div><strong>{serviceObj?.duration_minutes || 30} min</strong><small>Duration</small></div>
                    </div>
                    <div className="bk-chip">
                      <span className="bk-chip-icon"><FiMapPin /></span>
                      <div><strong>{getLocationChipLabel(serviceObj, barber)}</strong><small>Location</small></div>
                    </div>
                    <div className="bk-chip">
                      <span className="bk-chip-icon"><FiStar /></span>
                      <div><strong>{ratingLabel}</strong><small>Rating</small></div>
                    </div>
                    <div className="bk-chip">
                      <span className="bk-chip-icon"><FiUsers /></span>
                      <div><strong>{reviewCount ? `${reviewCount}+` : "New"}</strong><small>Bookings</small></div>
                    </div>
                  </div>
                  )}

                  {/* Team picker */}
                  {showStep(0) && requiresTeamMember ? (
                    <div className="bk-section">
                      <div className="bk-section-head">
                        <h3><FiUsers /> Choose provider</h3>
                        <span>{teamMembers.length} available</span>
                      </div>
                      <div className="bk-team-row">
                        {teamMembers.map((member) => {
                          const active = String(selectedTeamMemberId) === String(member.id);
                          return (
                            <button
                              type="button"
                              key={member.id}
                              className={active ? "bk-team-card active" : "bk-team-card"}
                              onClick={() => setSelectedTeamMemberId(String(member.id))}
                            >
                              <strong>{member.name}</strong>
                              <small>{member.title || "Provider"}</small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Tutor details */}
                  {showStep(2) && isTutorService ? (
                    <div className="bk-section">
                      <div className="bk-section-head">
                        <h3>Lesson details</h3>
                        <span>Optional</span>
                      </div>
                      <div className="booking-tutor-grid-v7">
                        <label><span>Subject</span><input value={tutorDetails.subject} onChange={(event) => setTutorDetails((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Mathematics" /></label>
                        <label><span>Student level</span>
                          <select value={tutorDetails.studentLevel} onChange={(event) => setTutorDetails((prev) => ({ ...prev, studentLevel: event.target.value }))}>
                            <option value="">Choose level</option>
                            {["Nursery", "Primary", "Lower Secondary", "Upper Secondary", "Cambridge", "University", "Adult learning"].map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                        </label>
                        <label><span>Lesson mode</span>
                          <select value={tutorDetails.lessonMode} onChange={(event) => setTutorDetails((prev) => ({ ...prev, lessonMode: event.target.value }))}>
                            <option value="">Choose mode</option>
                            {["In-person", "Online", "Home visit", "Student comes to tutor", "Hybrid"].map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                        </label>
                        <label><span>Duration</span><input value={tutorDetails.duration} onChange={(event) => setTutorDetails((prev) => ({ ...prev, duration: event.target.value }))} placeholder="1 hour" /></label>
                        <label className="booking-tutor-notes-v7"><span>Notes for tutor</span><textarea value={tutorDetails.notes} onChange={(event) => setTutorDetails((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Needs help with algebra." /></label>
                      </div>
                    </div>
                  ) : null}

                  {showStep(1) && (<>
                  {/* Select date */}
                  <div className="bk-section bk-section-flat">
                    <div className="bk-section-head">
                      <h3>Select date</h3>
                      <span className="bk-month">{getMonthLabel(selectedDate || dateOptions[0]?.value)} <FiChevronDown /></span>
                    </div>
                    <div className="bk-date-row">
                      {dateOptions.map((item) => {
                        const parts = getDateParts(item.value, item.label);
                        const active = selectedDate === item.value;
                        return (
                          <button
                            type="button"
                            key={item.value}
                            className={active ? "bk-date-pill active" : "bk-date-pill"}
                            onClick={() => setSelectedDate(item.value)}
                          >
                            <small>{parts.weekday}</small>
                            <strong>{parts.day}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Select time */}
                  <div className="bk-section bk-section-flat">
                    <div className="bk-section-head">
                      <h3>Select time</h3>
                      <span>{availabilityStatus?.loading ? "Checking..." : "Live slots"}</span>
                    </div>
                    {timeSlots.some((item) => !item.disabled) ? (
                      <div className="bk-time-grid">
                        {(showAllTimes ? timeSlots : timeSlots.slice(0, 7)).map((item) => (
                          <button
                            type="button"
                            key={item.value}
                            className={
                              selectedTime === item.value ? "bk-time-btn active" : item.disabled ? "bk-time-btn is-disabled" : "bk-time-btn"
                            }
                            onClick={() => !item.disabled && setSelectedTime(item.value)}
                            disabled={item.disabled}
                          >
                            {item.label}
                          </button>
                        ))}
                        {timeSlots.length > 7 ? (
                          <button type="button" className="bk-time-btn bk-time-more" onClick={() => setShowAllTimes((value) => !value)}>
                            <FiClock /> {showAllTimes ? "Less" : "More times"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="bk-warning">
                        {availabilityStatus?.isClosed
                          ? "This provider is closed on the selected day. Pick another date."
                          : "No open times left for this date. Pick another day."}
                      </div>
                    )}
                  </div>
                  </>)}

                  {/* Location */}
                  {showStep(2) && (
                  <div className="bk-section">
                    <div className="bk-section-head">
                      <h3>Location</h3>
                      {locationOptions.length > 1 ? <span>{locationOptions.length} options</span> : null}
                    </div>

                    {locationOptions.length > 1 ? (
                      <div className="bk-loc-switch">
                        {locationOptions.map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            className={selectedLocationType === option.value ? "bk-loc-tab active" : "bk-loc-tab"}
                            onClick={() => setBookingLocationType?.(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {isHomeService ? (
                      <label className="bk-field">
                        <span>Your address</span>
                        <div className="bk-address-row">
                          <input
                            type="text"
                            value={bookingAddress || ""}
                            onChange={(event) => setBookingAddress?.(event.target.value)}
                            placeholder="Gayaza, Nakwero"
                            autoComplete="street-address"
                          />
                          <button type="button" onClick={onUseCurrentLocation} disabled={locationDetecting}>
                            <FiNavigation /> {locationDetecting ? "..." : "Locate"}
                          </button>
                        </div>
                        <small>The provider will come to this location.</small>
                      </label>
                    ) : (
                      <div className="bk-loc-card">
                        <LocationMiniMap coords={coords} />
                        <div className="bk-loc-info">
                          <strong>At {barber.business_name}</strong>
                          <span>{barber.location || "Provider location"}</span>
                        </div>
                        {directionsUrl ? (
                          <a className="bk-directions" href={directionsUrl} target="_blank" rel="noopener noreferrer">
                            <FiNavigation /> Directions
                          </a>
                        ) : null}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Booking summary */}
                  {showStep(2) && (
                  <div className="bk-summary-card">
                    <div className="bk-summary-head">
                      <div>
                        <strong>Booking summary</strong>
                      </div>
                      {services.length > 1 ? (
                        <button type="button" className="bk-link" onClick={() => setShowServicePicker(true)}>Edit</button>
                      ) : null}
                    </div>
                    <div className="bk-summary-line">
                      <img className="bk-summary-thumb" src={serviceObj?.image || barber.image} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                      <div className="bk-summary-line-copy">
                        <strong>{serviceObj?.service_name || "Service"}</strong>
                        <span>{selectedDateLabel} • {selectedTimeLabel}</span>
                      </div>
                      <div className="bk-summary-amount">{isQuoteService ? "Quote" : formatMoney(total)}</div>
                    </div>
                    <div className="bk-summary-divider" />
                    <div className="bk-summary-total-row">
                      <span>Total</span>
                      <strong>{totalLabel}</strong>
                    </div>
                  </div>
                  )}
                </>
              )}
            </div>

            <div className="bk-footer">
              {onPaymentStep ? (
                <button
                  type="button"
                  className={footerDisabled ? "bk-cta-primary is-disabled" : "bk-cta-primary"}
                  onClick={handlePrimary}
                  disabled={footerDisabled}
                >
                  {footerLabel}
                </button>
              ) : (
                <div className="bk-footer-actions">
                  <button type="button" className="bk-cta-secondary" onClick={() => onMessageProvider?.()}>
                    <FiMessageCircle /> Message
                  </button>
                  <button
                    type="button"
                    className={footerDisabled ? "bk-cta-primary is-disabled" : "bk-cta-primary"}
                    onClick={handlePrimary}
                    disabled={footerDisabled}
                  >
                    {footerLabel}
                  </button>
                </div>
              )}
              {!onPaymentStep && services.length > 1 && !isQuoteService ? (
                <button type="button" className="bk-smartmatch-link" onClick={() => onOpenSmartMatch?.()}>
                  {smartMatchPremiumActive ? "Not sure? Find my best match" : "Not sure? Unlock Smart Match"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {lightboxImage ? (
        <button type="button" className="bk-lightbox" onClick={() => setLightboxImage("")} aria-label="Close image">
          <img src={lightboxImage} alt="Recent work" />
        </button>
      ) : null}
    </>
  );
}
