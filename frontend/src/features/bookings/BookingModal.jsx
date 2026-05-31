import { useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiCalendar,
  FiCheck,
  FiClock,
  FiMapPin,
  FiNavigation,
  FiScissors,
  FiSmartphone,
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
  const options = [{ value: "provider_location", label: "Provider location", meta: barber?.location || "Provider address" }];
  if (homeEnabled || serviceType === "customer_location") {
    options.push({ value: "customer_location", label: "Customer location", meta: "Home service or on-site visit" });
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
  const [step, setStep] = useState(0);
  const [tutorDetails, setTutorDetails] = useState({
    subject: "",
    studentLevel: "",
    lessonMode: "",
    duration: "",
    notes: "",
  });
  useEffect(() => {
    if (show) setStep(0);
  }, [show, barber?.id]);
  if (!show || !barber) return null;

  const services = getBarberServices(barber);
  const serviceObj =
    services.find((item) => String(item.id) === String(selectedService)) || services[0];
  if (!services.length) {
    return (
      <>
        <div className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"} onClick={onClose} />
        <div className={show ? "booking-modal-v4 open" : "booking-modal-v4"}>
          <div className="booking-modal-card-v4 booking-modal-clean-v5">
            <div className="booking-modal-shell-v5">
              <div className="booking-header-v5">
                <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                  <FiArrowLeft />
                </button>
                <div className="booking-header-copy-v5">
                  <div className="booking-header-title-v5">No bookable services</div>
                  <div className="booking-header-subtitle-v5">This provider has not added services yet.</div>
                </div>
                <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                  <FiX />
                </button>
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
  const totalLabel = isQuoteService ? priceState.label || "Request quote" : formatMoney(total);
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
  const locationLabel =
    selectedLocationType === "customer_location"
      ? String(bookingAddress || "").trim()
      : barber.location || "Provider location";
  const locationValid =
    Boolean(selectedLocationType) &&
    (selectedLocationType !== "customer_location" || String(bookingAddress || "").trim().length >= 3);
  const selectedTimeLabel =
    timeSlots.find((item) => item.value === selectedTime)?.label ||
    (selectedTime ? formatTimeLabel(selectedTime) : "Pick a time");
  const availabilityTitle = availabilityStatus?.loading
    ? "Checking availability..."
    : availabilityStatus?.error
    ? "Availability unavailable"
    : availabilityStatus?.hasAvailable
    ? availabilityStatus.selectedDateLabel === "Today"
      ? `Available today from ${availabilityStatus.nextAvailableLabel}`
      : `Next available ${availabilityStatus.selectedDateLabel} at ${availabilityStatus.nextAvailableLabel}`
    : availabilityStatus?.isClosed
    ? `${availabilityStatus.selectedDateLabel} is closed`
    : `No slots left ${availabilityStatus?.selectedDateLabel || "for this day"}`;
  const availabilityMeta = availabilityStatus?.loading
    ? "Loading provider schedule and existing bookings."
    : availabilityStatus?.error
    ? availabilityStatus.error
    : availabilityStatus?.hasAvailable
    ? `${availabilityStatus.availableCount} slot${availabilityStatus.availableCount === 1 ? "" : "s"} available.`
    : availabilityStatus?.workingWindow
    ? `Working hours: ${availabilityStatus.workingWindow.start || "--:--"} - ${availabilityStatus.workingWindow.end || "--:--"}`
    : "Pick another day to find an open slot.";
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
        <div className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"} onClick={onClose} />
        <div className={show ? "booking-modal-v4 open" : "booking-modal-v4"}>
          <div className="booking-modal-card-v4 booking-modal-clean-v5">
            <div className="booking-sheet-handle-v5" />
            <div className="booking-modal-shell-v5">
              <div className="booking-modal-scroll-v5">
                <div className="booking-header-v5">
                  <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                    <FiArrowLeft />
                  </button>
                  <div className="booking-header-copy-v5">
                    <div className="booking-header-title-v5">Confirm payment</div>
                    <div className="booking-header-subtitle-v5">Your slot will lock in after mobile money approval</div>
                  </div>
                  <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                    <FiX />
                  </button>
                </div>

                <div className="booking-summary-v5">
                  <div className="booking-summary-top-v5">
                    <div>
                      <div className="booking-summary-title-v5">{barber.business_name}</div>
                      <div className="booking-summary-subtitle-v5">{pendingPayment.instructions || "Approve the prompt on your phone."}</div>
                    </div>
                    <div className="booking-summary-total-v5">{formatMoney(pendingPayment.grossAmount || total)}</div>
                  </div>
                  <div className="booking-summary-grid-v5">
                    <div className="booking-summary-row-v5">
                      <span>Provider</span>
                      <strong>{pendingPayment.provider === "airtel_money" ? "Airtel Money" : "MTN Mobile Money"}</strong>
                    </div>
                    <div className="booking-summary-row-v5">
                      <span>Customer pays</span>
                      <strong>{formatMoney(pendingPayment.grossAmount || total)}</strong>
                    </div>
                    <div className="booking-summary-row-v5">
                      <span>Platform commission</span>
                      <strong>{formatMoney(pendingPayment.commissionAmount || 0)}</strong>
                    </div>
                    <div className="booking-summary-row-v5">
                      <span>Provider payout</span>
                      <strong>{formatMoney(pendingPayment.barberAmount || 0)}</strong>
                    </div>
                    <div className="booking-summary-row-v5">
                      <span>Reference</span>
                      <strong>{pendingPayment.reference}</strong>
                    </div>
                    <div className="booking-summary-row-v5">
                      <span>Phone</span>
                      <strong>{pendingPayment.phoneNumber || "Saved profile phone"}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="booking-footer-v5">
                <button className="primary-btn-v4 booking-cta-v5" onClick={() => onVerifyPayment?.(pendingPayment.bookingId)} disabled={creatingBooking}>
                  {creatingBooking ? "Checking payment..." : "I approved the payment"}
                </button>
                <div className="booking-note-v5">The platform keeps 10% and automatically sends 90% to the provider after confirmation.</div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const steps = [
    { key: "service", label: "Service", ready: Boolean(selectedService) && !isQuoteService },
    { key: "time", label: "Time", ready: Boolean(selectedDate && selectedTime) },
    { key: "location", label: "Location", ready: locationValid },
    { key: "payment", label: "Payment", ready: paymentAllowed && phoneIsValid },
    { key: "summary", label: "Summary", ready: !isBlocked },
  ];
  const canContinue = step === 0
    ? steps[0].ready
    : step === 1
    ? steps[1].ready
    : step === 2
    ? steps[2].ready
    : step === 3
    ? steps[3].ready
    : true;
  const nextStep = () => setStep((value) => Math.min(value + 1, steps.length - 1));
  const previousStep = () => setStep((value) => Math.max(value - 1, 0));

  const footerLabel =
    step < steps.length - 1
      ? "Continue"
      : creatingBooking
      ? "Booking..."
      : isQuoteService
      ? "Request quote"
      : "Confirm Booking";

  return (
    <>
      <div className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"} onClick={onClose} />
      <div className={show ? "booking-modal-v4 open" : "booking-modal-v4"}>
        <div className="booking-modal-card-v4 booking-modal-clean-v5">
          <div className="booking-sheet-handle-v5" />
          <div className="booking-modal-shell-v5">
            <div className="booking-modal-scroll-v5">
              <div className="booking-header-v5">
                <button type="button" className="profile-back-btn-v4" onClick={step > 0 ? previousStep : onClose}>
                  {step > 0 ? <FiArrowLeft /> : <FiX />}
                </button>
                <div className="booking-header-copy-v5">
                  <div className="booking-header-title-v5">Book service</div>
                  <div className="booking-header-subtitle-v5">{steps[step]?.label}: {barber.business_name}</div>
                </div>
                <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                  <FiX />
                </button>
              </div>
              <div className="booking-progress-v6">
                {steps.map((item, index) => (
                  <button
                    type="button"
                    key={item.key}
                    className={index === step ? "booking-step-dot-v6 active" : item.ready ? "booking-step-dot-v6 done" : "booking-step-dot-v6"}
                    onClick={() => index <= step && setStep(index)}
                    aria-label={item.label}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>

              <div className="booking-barber-card-v5">
                <div className="booking-barber-top-v5">
                  <div className="booking-barber-copy-v5">
                    <div className="booking-title-v5">{barber.business_name}</div>
                    <div className="booking-location-row-v5">
                      <FiMapPin />
                      <span>{barber.location}</span>
                    </div>
                    <div className="booking-hours-chip-v5">
                      <FiClock />
                      <span>{barber.availability?.start || "08:00"} - {barber.availability?.end || "20:00"}</span>
                    </div>
                  </div>
                  <div className="booking-hero-badge-v5">{Number(barber.price_from || 0) > 0 ? `From ${formatMoney(barber.price_from)}` : "Book a service"}</div>
                </div>
              </div>

              {isShopStand ? (
                <div className={step === 0 ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                  <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiUsers /> Choose provider</div>
                    <div className="booking-section-hint-v5">{teamMembers.length || 1} available</div>
                  </div>
                  {teamMembers.length ? (
                    <div className="booking-service-list-v5">
                      {teamMembers.map((member) => {
                        const active = String(selectedTeamMemberId) === String(member.id);
                        return (
                          <button
                            type="button"
                            key={member.id}
                            className={active ? "booking-card-service-v5 active" : "booking-card-service-v5"}
                            onClick={() => setSelectedTeamMemberId(String(member.id))}
                          >
                            <div className="booking-card-service-copy-v5">
                              <div className="booking-card-service-title-v5">{member.name}</div>
                              <div className="booking-card-service-meta-v5">{member.title || "Provider"}</div>
                            </div>
                            {active ? <span className="booking-card-service-check-v5"><FiCheck /></span> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="auth-error">This business has no active service agents yet.</div>
                  )}
                </div>
              ) : null}

              <div className={step === 0 ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiScissors /> Choose service</div>
                  <div className="booking-section-hint-v5">{services.length} options</div>
                </div>
                <div className="booking-service-list-v5">
                  {services.map((item) => {
                    const active = String(selectedService) === String(item.id);
                    const itemPrice = getServicePriceState(item);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={active ? "booking-card-service-v5 active" : "booking-card-service-v5"}
                        onClick={() => setSelectedService(item.id)}
                      >
                        <div className="booking-card-service-copy-v5">
                          <div className="booking-card-service-title-v5">{item.service_name}</div>
                          {item.description ? <div className="booking-card-service-description-v6">{item.description}</div> : null}
                          <div className="booking-card-service-meta-v5">
                            {item.duration_minutes} mins - {String(item.location_type || "").toLowerCase() === "customer_location" ? "Home service" : "Provider location"}
                          </div>
                        </div>
                        <div className="booking-card-service-side-v5">
                          <div className="booking-card-service-price-v5">{itemPrice.label}</div>
                          {active ? <span className="booking-card-service-check-v5"><FiCheck /></span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {isQuoteService ? (
                  <div className="booking-warning-v6">
                    This service needs a quote before booking. Ask the provider for a price and scope first.
                  </div>
                ) : null}
                <button type="button" className="secondary-btn-v4 compact-btn-v4" onClick={() => onOpenSmartMatch?.()}>
                  {smartMatchPremiumActive ? "Not sure? Find My Best Match" : "Not sure? Unlock Smart Match"}
                </button>
              </div>

              <div className={step === 0 && isTutorService ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5">Tutor lesson details</div>
                  <div className="booking-section-hint-v5">Optional</div>
                </div>
                <div className="booking-tutor-grid-v7">
                  <label>
                    <span>Subject</span>
                    <input value={tutorDetails.subject} onChange={(event) => setTutorDetails((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Mathematics" />
                  </label>
                  <label>
                    <span>Student level</span>
                    <select value={tutorDetails.studentLevel} onChange={(event) => setTutorDetails((prev) => ({ ...prev, studentLevel: event.target.value }))}>
                      <option value="">Choose level</option>
                      {["Nursery", "Primary", "Lower Secondary", "Upper Secondary", "Cambridge", "University", "Adult learning"].map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Lesson mode</span>
                    <select value={tutorDetails.lessonMode} onChange={(event) => setTutorDetails((prev) => ({ ...prev, lessonMode: event.target.value }))}>
                      <option value="">Choose mode</option>
                      {["In-person", "Online", "Home visit", "Student comes to tutor", "Hybrid"].map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Duration</span>
                    <input value={tutorDetails.duration} onChange={(event) => setTutorDetails((prev) => ({ ...prev, duration: event.target.value }))} placeholder="1 hour" />
                  </label>
                  <label className="booking-tutor-notes-v7">
                    <span>Notes for tutor</span>
                    <textarea value={tutorDetails.notes} onChange={(event) => setTutorDetails((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Needs help with algebra." />
                  </label>
                </div>
              </div>

              <div className={step === 1 ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiCalendar /> Pick date</div>
                  <div className="booking-section-hint-v5">{availabilityStatus?.hasAvailable ? `${availabilityStatus.availableCount} open` : `${dateOptions.length} days`}</div>
                </div>
                <div className={
                  availabilityStatus?.hasAvailable
                    ? "booking-availability-banner-v6"
                    : "booking-availability-banner-v6 is-empty"
                }>
                  <strong>{availabilityTitle}</strong>
                  <span>{availabilityMeta}</span>
                </div>
                <div className="booking-date-list-v5">
                  {dateOptions.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={selectedDate === item.value ? "booking-date-chip-v5 active" : "booking-date-chip-v5"}
                      onClick={() => setSelectedDate(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={step === 1 ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiClock /> Pick time</div>
                  <div className="booking-section-hint-v5">{availabilityStatus?.loading ? "Checking..." : "Live slots"}</div>
                </div>
                <div className="booking-time-grid-v5">
                  {timeSlots.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={
                        selectedTime === item.value
                          ? "booking-time-btn-v5 active"
                          : item.disabled
                          ? "booking-time-btn-v5 is-disabled"
                          : "booking-time-btn-v5"
                      }
                      onClick={() => !item.disabled && setSelectedTime(item.value)}
                      disabled={item.disabled}
                    >
                      <span>{item.label}</span>
                      {item.disabled && item.disabledReason ? <small>{item.disabledReason}</small> : null}
                    </button>
                  ))}
                </div>
                {!timeSlots.some((item) => !item.disabled) ? (
                  <div className="auth-error">
                    {availabilityStatus?.isClosed
                      ? "This provider is closed on the selected day. Pick another date."
                      : "No open times left for this date. Pick another day."}
                  </div>
                ) : null}
              </div>

              <div className={step === 2 ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiMapPin /> Booking location</div>
                  <div className="booking-section-hint-v5">{locationOptions.length} option{locationOptions.length === 1 ? "" : "s"}</div>
                </div>
                <div className="booking-payment-list-v5">
                  {locationOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={selectedLocationType === option.value ? "booking-payment-option-v5 active" : "booking-payment-option-v5"}
                      onClick={() => setBookingLocationType?.(option.value)}
                    >
                      <span className="booking-payment-icon-v5"><FiMapPin /></span>
                      <span className="booking-payment-copy-v5">
                        <span className="booking-payment-title-v5">{option.label}</span>
                        <span className="booking-payment-meta-v5">{option.meta}</span>
                      </span>
                      {selectedLocationType === option.value ? <span className="booking-payment-pill-v5">Selected</span> : null}
                    </button>
                  ))}
                </div>
                {selectedLocationType === "customer_location" ? (
                  <label className="booking-phone-field-v5">
                    <span>Customer address</span>
                    <div className="booking-address-row-v6">
                      <input
                        type="text"
                        value={bookingAddress || ""}
                        onChange={(event) => setBookingAddress?.(event.target.value)}
                        placeholder="Gayaza, Nakwero"
                        autoComplete="street-address"
                      />
                      <button type="button" onClick={onUseCurrentLocation} disabled={locationDetecting}>
                        <FiNavigation /> {locationDetecting ? "Finding..." : "Use location"}
                      </button>
                    </div>
                    <small>Add a readable area and any details the provider needs.</small>
                  </label>
                ) : null}
              </div>

              <div className={step === 3 ? "booking-section-v5" : "booking-section-v5 booking-section-hidden-v6"}>
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiSmartphone /> Payment</div>
                  <div className="booking-section-hint-v5">Required to confirm booking</div>
                </div>
                <div className="booking-payment-list-v5">
                  {paymentOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={
                        selectedPaymentMethod === option.value
                          ? "booking-payment-option-v5 booking-payment-option-v5-early active"
                          : "booking-payment-option-v5 booking-payment-option-v5-early"
                      }
                      disabled={option.disabled}
                      onClick={() => setSelectedPaymentMethod(option.value)}
                    >
                      <span className="booking-payment-icon-v5"><FiSmartphone /></span>
                      <span className="booking-payment-copy-v5">
                        <span className="booking-payment-title-v5">{option.label}</span>
                        <span className="booking-payment-meta-v5">{option.meta}</span>
                      </span>
                      <span className="booking-payment-pill-v5">{option.pill}</span>
                    </button>
                  ))}
                </div>
                <div className="booking-note-v5">
                  Bookings are confirmed only after backend-confirmed mobile money or wallet payment.
                </div>
                {!onlinePaymentsReady && paymentReadinessMessage ? (
                  <div className="booking-warning-v6">{paymentReadinessMessage}</div>
                ) : null}
                {requiresPhone ? (
                  <label className="booking-phone-field-v5">
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
                        ? "Payment request sent. Please approve the prompt on your phone."
                        : "Use a Uganda number such as 0772123456 or +256772123456."}
                    </small>
                  </label>
                ) : null}
              </div>

              <div className={step === 4 ? "booking-summary-v5" : "booking-summary-v5 booking-section-hidden-v6"}>
                <div className="booking-summary-top-v5">
                  <div>
                    <div className="booking-summary-title-v5">Your booking</div>
                    <div className="booking-summary-subtitle-v5">Review before you confirm</div>
                  </div>
                  <div className="booking-summary-total-v5">{totalLabel}</div>
                </div>
                <div className="booking-summary-grid-v5">
                  <div className="booking-summary-row-v5">
                    <span>Provider</span>
                    <strong>{barber.business_name}</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Service</span>
                    <strong>{serviceObj?.service_name || "Service"}</strong>
                  </div>
                  {isShopStand ? (
                    <div className="booking-summary-row-v5">
                      <span>Provider</span>
                      <strong>{selectedTeamMember?.name || "Choose provider"}</strong>
                    </div>
                  ) : null}
                  <div className="booking-summary-row-v5">
                    <span>Duration</span>
                    <strong>{serviceObj?.duration_minutes || 30} mins</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Date</span>
                    <strong>{selectedDate || "Choose a date"}</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Time</span>
                    <strong>{selectedTimeLabel}</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Location</span>
                    <strong>{locationLabel || "Choose location"}</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Payment</span>
                    <strong>{paymentAllowed ? selectedPaymentLabel : "Choose payment"}</strong>
                  </div>
                  {showsPlatformSplit ? (
                    <>
                      <div className="booking-summary-row-v5">
                        <span>Platform commission</span>
                        <strong>{formatMoney(total * 0.1)}</strong>
                      </div>
                      <div className="booking-summary-row-v5">
                        <span>Provider receives</span>
                        <strong>{formatMoney(total * 0.9)}</strong>
                      </div>
                    </>
                  ) : null}
                  {isTutorService && Object.values(tutorDetails).some(Boolean) ? (
                    <div className="booking-summary-row-v5">
                      <span>Lesson details</span>
                      <strong>{[tutorDetails.subject, tutorDetails.studentLevel, tutorDetails.lessonMode, tutorDetails.duration].filter(Boolean).join(" • ") || "Added"}</strong>
                    </div>
                  ) : null}
                </div>
              </div>

              {bookingCooldownInfo?.blocked ? (
                <div className="auth-error">{bookingCooldownInfo.reason}</div>
              ) : null}
            </div>

            <div className="booking-footer-v5">
              <button
                className={
                  isBlocked
                    ? "primary-btn-v4 booking-cta-v5 booking-cta-disabled-v5"
                    : "primary-btn-v4 booking-cta-v5"
                }
                onClick={() => {
                  if (step < steps.length - 1) {
                    nextStep();
                    return;
                  }
                  if (isQuoteService) {
                    onRequestQuote?.();
                    return;
                  }
                  onConfirm?.({
                    bookingDetails: isTutorService ? { type: "tutor_lesson", ...tutorDetails } : null,
                  });
                }}
                disabled={step < steps.length - 1 ? !canContinue : isBlocked}
              >
                {footerLabel}
              </button>
              <div className="booking-note-v5">
                {isQuoteService
                  ? "A quote is required before this service can be booked directly."
                  : step < steps.length - 1
                  ? "Complete each step to review and confirm with confidence."
                  : "The booking becomes confirmed only after successful mobile money or wallet payment."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
