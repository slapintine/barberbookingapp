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

const FALLBACK_SERVICES = [
  { id: "classic", name: "Classic Cut", extra: 0, duration: "35 mins" },
  { id: "fade", name: "Fade / Blend", extra: 5000, duration: "45 mins" },
  { id: "beard", name: "Cut + Beard", extra: 10000, duration: "50 mins" },
];

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
    return FALLBACK_SERVICES.map((item, idx) => ({
      id: item.id || `fallback-${idx}`,
      service_name: item.name,
      price_extra: Number(item.extra || 0),
      duration_minutes: parseInt(item.duration, 10) || 30,
    }));
  }

  return barber.services.map((item, idx) => ({
    id: item.id || `fallback-${idx}`,
    service_name: item.service_name || item.name || "Service",
    price_extra: Number(item.price_extra || item.extra || 0),
    duration_minutes: Number(item.duration_minutes || 30),
  }));
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
  const total = Number(barber.price_from || 0) + Number(serviceObj?.price_extra || 0);
  const teamMembers = Array.isArray(barber.team_members || barber.teamMembers)
    ? (barber.team_members || barber.teamMembers).filter((item) => Number(item?.is_active ?? item?.isActive ?? 1) === 1)
    : [];
  const isShopStand = String(barber.stand_type || barber.standType || "individual") === "shop";
  const requiresTeamMember = isShopStand && teamMembers.length > 0;
  const selectedTeamMember = teamMembers.find((item) => String(item.id) === String(selectedTeamMemberId));
  const paymentAllowed = ["cash", "mtn_mobile_money", "airtel_money"].includes(selectedPaymentMethod);
  const paymentLabel = selectedPaymentMethod === "airtel_money" ? "Airtel Money" : "MTN Mobile Money";
  const selectedTimeLabel =
    timeSlots.find((item) => item.value === selectedTime)?.label ||
    (selectedTime ? formatTimeLabel(selectedTime) : "Pick a time");
  const isBlocked =
    creatingBooking ||
    bookingCooldownInfo?.blocked ||
    !selectedTime ||
    !paymentAllowed ||
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
                      <span>Barber payout</span>
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
                <div className="booking-note-v5">The platform keeps 10% and automatically sends 90% to the barber after confirmation.</div>
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
                  <div className="booking-header-title-v5">Book appointment</div>
                  <div className="booking-header-subtitle-v5">Fast, clean and confirmed in a few taps</div>
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
                  <div className="booking-hero-badge-v5">From {formatMoney(barber.price_from)}</div>
                </div>
              </div>

              {isShopStand ? (
                <div className="booking-section-v5">
                  <div className="booking-section-row-v5">
                    <div className="booking-section-title-v5"><FiUsers /> Choose barber</div>
                    <div className="booking-section-hint-v5">{teamMembers.length || 1} on stand</div>
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
                              <div className="booking-card-service-meta-v5">{member.title || "Barber"}</div>
                            </div>
                            {active ? <span className="booking-card-service-check-v5"><FiCheck /></span> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="auth-error">This shop stand has no team barbers yet.</div>
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
                    const price = Number(barber.price_from || 0) + Number(item.price_extra || 0);
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
                          <div className="booking-card-service-price-v5">{formatMoney(price)}</div>
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
                  {[
                    ["cash", "Cash"],
                    ["mtn_mobile_money", "MTN Mobile Money"],
                    ["airtel_money", "Airtel Money"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={
                        selectedPaymentMethod === value
                          ? "booking-payment-option-v5 booking-payment-option-v5-early active"
                          : "booking-payment-option-v5 booking-payment-option-v5-early"
                      }
                      onClick={() => value === "cash" && setSelectedPaymentMethod(value)}
                      disabled={value !== "cash"}
                    >
                      <span className="booking-payment-icon-v5"><FiSmartphone /></span>
                      <span className="booking-payment-copy-v5">
                        <span className="booking-payment-title-v5">{label}</span>
                        <span className="booking-payment-meta-v5">
                          {value === "cash" ? "Pay at the appointment. The barber confirms payment after the cut." : "Mobile money checkout will be enabled after payment setup is complete."}
                        </span>
                      </span>
                      <span className="booking-payment-pill-v5">{value === "cash" ? "Pay later" : "Coming soon"}</span>
                    </button>
                  ))}
                </div>
                <div className="booking-note-v5">Online payments are coming later. Cash bookings can still be approved and completed now.</div>
              </div>

              <div className="booking-summary-v5">
                <div className="booking-summary-top-v5">
                  <div>
                    <div className="booking-summary-title-v5">Your booking</div>
                    <div className="booking-summary-subtitle-v5">Review before you confirm</div>
                  </div>
                  <div className="booking-summary-total-v5">{formatMoney(total)}</div>
                </div>
                <div className="booking-summary-grid-v5">
                  <div className="booking-summary-row-v5">
                    <span>Service</span>
                    <strong>{serviceObj?.service_name || "Service"}</strong>
                  </div>
                  {isShopStand ? (
                    <div className="booking-summary-row-v5">
                      <span>Barber</span>
                      <strong>{selectedTeamMember?.name || "Choose barber"}</strong>
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
                    <strong>{paymentAllowed ? paymentLabel : "Choose payment"}</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Platform commission</span>
                    <strong>{formatMoney(total * 0.1)}</strong>
                  </div>
                  <div className="booking-summary-row-v5">
                    <span>Barber receives</span>
                    <strong>{formatMoney(total * 0.9)}</strong>
                  </div>
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
                  ? "Choose barber"
                  : !paymentAllowed
                  ? "Choose payment"
                  : "Continue to payment"}
              </button>
              <div className="booking-note-v5">The booking becomes confirmed only after successful mobile money payment.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
