import {
  FiArrowLeft,
  FiCalendar,
  FiCheck,
  FiClock,
  FiCreditCard,
  FiMapPin,
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
const BOOKING_ONLINE_PAYMENTS_ENABLED =
  String(import.meta.env.VITE_BOOKING_ONLINE_PAYMENTS_ENABLED || "").toLowerCase() === "true";

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

export default function BookingModal({
  show,
  barber,
  dateOptions,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  timeSlots,
  selectedService,
  setSelectedService,
  selectedTeamMemberId,
  setSelectedTeamMemberId,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  paymentPhone,
  setPaymentPhone,
  pendingPayment,
  onVerifyPayment,
  onClose,
  onConfirm,
  creatingBooking,
  bookingCooldownInfo,
}) {
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
                  <div className="booking-header-subtitle-v5">This provider has not published a service yet.</div>
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
  const isQuoteService = String(serviceObj?.pricing_type || "").toLowerCase() === "quote";
  const totalLabel = isQuoteService ? "Price on consultation" : formatMoney(total);
  const teamMembers = Array.isArray(barber.team_members || barber.teamMembers)
    ? (barber.team_members || barber.teamMembers).filter((item) => Number(item?.is_active ?? item?.isActive ?? 1) === 1)
    : [];
  const isShopStand = String(barber.stand_type || barber.standType || "individual") === "shop";
  const requiresTeamMember = isShopStand && teamMembers.length > 0;
  const selectedTeamMember = teamMembers.find((item) => String(item.id) === String(selectedTeamMemberId));
  const paymentAllowed = ["cash", "mtn_mobile_money", "airtel_money"].includes(selectedPaymentMethod);
  const paymentOptions = getBookingPaymentOptions({
    onlinePaymentsEnabled: BOOKING_ONLINE_PAYMENTS_ENABLED,
  });
  const selectedPaymentLabel = getPaymentMethodLabel(selectedPaymentMethod);
  const showsPlatformSplit = isOnlinePaymentMethod(selectedPaymentMethod);
  const requiresPhone = selectedPaymentMethod === "mtn_mobile_money";
  const phoneIsValid = !requiresPhone || isValidUgandaPhone(paymentPhone);
  const selectedTimeLabel =
    timeSlots.find((item) => item.value === selectedTime)?.label ||
    (selectedTime ? formatTimeLabel(selectedTime) : "Pick a time");
  const isBlocked =
    creatingBooking ||
    bookingCooldownInfo?.blocked ||
    !selectedTime ||
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
                  <div className="booking-header-title-v5">Book service</div>
                  <div className="booking-header-subtitle-v5">Choose a service, date, time, and payment option</div>
                </div>
                <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                  <FiX />
                </button>
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
                <div className="booking-section-v5">
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

              <div className="booking-section-v5">
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiScissors /> Choose service</div>
                  <div className="booking-section-hint-v5">{services.length} options</div>
                </div>
                <div className="booking-service-list-v5">
                  {services.map((item) => {
                    const active = String(selectedService) === String(item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={active ? "booking-card-service-v5 active" : "booking-card-service-v5"}
                        onClick={() => setSelectedService(item.id)}
                      >
                        <div className="booking-card-service-copy-v5">
                          <div className="booking-card-service-title-v5">{item.service_name}</div>
                          <div className="booking-card-service-meta-v5">{item.duration_minutes} mins</div>
                        </div>
                        <div className="booking-card-service-side-v5">
                          <div className="booking-card-service-price-v5">{formatServicePrice(item)}</div>
                          {active ? <span className="booking-card-service-check-v5"><FiCheck /></span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="booking-section-v5">
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiCalendar /> Pick date</div>
                  <div className="booking-section-hint-v5">{dateOptions.length} days</div>
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

              <div className="booking-section-v5">
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiClock /> Pick time</div>
                  <div className="booking-section-hint-v5">Real-time availability</div>
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
                      {item.label}
                    </button>
                  ))}
                </div>
                {!timeSlots.some((item) => !item.disabled) ? (
                  <div className="auth-error">No open times left for this date. Pick another day.</div>
                ) : null}
              </div>

              <div className="booking-section-v5">
                <div className="booking-section-row-v5">
                  <div className="booking-section-title-v5"><FiCreditCard /> Payment</div>
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
                  Cash is always available. Pay cash directly to the service provider after the service.
                </div>
                {requiresPhone ? (
                  <label className="booking-phone-field-v5">
                    <span>MTN phone number</span>
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

              <div className="booking-summary-v5">
                <div className="booking-summary-top-v5">
                  <div>
                    <div className="booking-summary-title-v5">Your booking</div>
                    <div className="booking-summary-subtitle-v5">Review before you confirm</div>
                  </div>
                  <div className="booking-summary-total-v5">{totalLabel}</div>
                </div>
                <div className="booking-summary-grid-v5">
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
                onClick={onConfirm}
                disabled={isBlocked}
              >
                {creatingBooking
                  ? "Booking..."
                  : bookingCooldownInfo?.blocked
                  ? "Blocked"
                  : !selectedTime
                  ? "Pick another time"
                  : requiresTeamMember && !selectedTeamMember
                  ? "Choose provider"
                  : !phoneIsValid
                  ? "Enter MTN phone"
                  : !paymentAllowed
                  ? "Choose payment"
                  : selectedPaymentMethod === "cash"
                  ? "Confirm cash booking"
                  : "Continue to payment"}
              </button>
              <div className="booking-note-v5">
                {selectedPaymentMethod === "cash"
                  ? "The provider approves the booking, then confirms cash after the service."
                  : "The booking becomes confirmed only after successful mobile money payment."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
