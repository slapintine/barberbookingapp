import { useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiCalendar,
  FiClock,
  FiPhone,
  FiScissors,
  FiX,
} from "react-icons/fi";

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

function timeToMinutes(timeStr) {
  const normalized = formatTo24Hour(timeStr);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return 0;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateValueToDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function buildMonthCalendar(monthDate = new Date()) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  const startOffset = (monthStart.getDay() + 6) % 7;
  calendarStart.setDate(monthStart.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return {
      value: formatDateValue(day),
      day: day.getDate(),
      isCurrentMonth: day.getMonth() === monthDate.getMonth(),
      isToday: formatDateValue(day) === formatDateValue(new Date()),
    };
  });
}

function getBookingStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled" || normalized === "rejected") return "cancelled";
  return "pending";
}

function groupBookingsByDate(bookings) {
  return bookings.reduce((map, booking) => {
    const key = booking.dateValue || booking.date;
    if (!key) return map;
    if (!map[key]) map[key] = [];
    map[key].push(booking);
    return map;
  }, {});
}

export default function ScheduleWorkspace({
  barber,
  bookings,
  pendingCount,
  confirmedCount,
  completedCount,
  onApproveBooking,
  onRejectBooking,
  onCompleteBooking,
  onOpenConversation,
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(() => formatDateValue(new Date()));
  const [scheduleMonthDate, setScheduleMonthDate] = useState(() => new Date());

  const bookingsByDateMap = useMemo(() => groupBookingsByDate(bookings), [bookings]);
  const monthDays = useMemo(() => buildMonthCalendar(scheduleMonthDate), [scheduleMonthDate]);
  const monthTitle = scheduleMonthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedDayBookings = useMemo(
    () =>
      [...(bookingsByDateMap[selectedScheduleDate] || [])].sort(
        (a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)
      ),
    [bookingsByDateMap, selectedScheduleDate]
  );
  const selectedPending = selectedDayBookings.filter((item) => item.status === "pending").length;
  const selectedConfirmed = selectedDayBookings.filter((item) => item.status === "confirmed").length;
  const selectedCompleted = selectedDayBookings.filter((item) => item.status === "completed").length;
  const selectedDateObj = dateValueToDate(selectedScheduleDate);
  const selectedDayTitle = selectedDateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const today = new Date();
  const todayValue = formatDateValue(today);
  const barberEndMinutes = timeToMinutes(barber?.availability?.end || "20:00");
  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const todayIsOver = currentMinutes >= barberEndMinutes;
  const thisWeekCount = bookings
    .filter((booking) => {
      const value = booking.dateValue || booking.date;
      if (!value) return false;
      const diff = dateValueToDate(value).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const dayDiff = diff / (24 * 60 * 60 * 1000);
      return dayDiff >= 0 && dayDiff < 7;
    })
    .length;
  const nextBooking = [...bookings]
    .filter((item) => ["pending", "confirmed"].includes(String(item.status || "").toLowerCase()))
    .sort((a, b) => {
      const aTime = `${a.dateValue || a.date}T${formatTo24Hour(a.time || "00:00")}`;
      const bTime = `${b.dateValue || b.date}T${formatTo24Hour(b.time || "00:00")}`;
      return new Date(aTime) - new Date(bTime);
    })[0];

  const changeScheduleMonth = (direction) => {
    setScheduleMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  return (
    <>
      <div className="simple-card-v4 schedule-calendar-v5">
        <div className="schedule-preview-v6">
          <div className="schedule-preview-copy-v6">
            <div className="panel-title-v4">Schedule workspace</div>
            <div className="profile-sub-v4">
              {nextBooking
                ? `Next: ${nextBooking.customerName || nextBooking.customerUsername} at ${nextBooking.timeLabel || formatTimeLabel(nextBooking.time)}`
                : "No upcoming bookings yet."}
            </div>
            <div className="schedule-preview-stats-v6">
              <span>{thisWeekCount} this week</span>
              <span>{pendingCount} pending</span>
              <span>{confirmedCount} confirmed</span>
            </div>
          </div>
          <button className="primary-btn-v4 schedule-open-btn-v6" onClick={() => setShowSchedule(true)}>
            <FiCalendar /> Open schedule
          </button>
        </div>
      </div>

      {showSchedule ? (
        <>
          <div className="booking-overlay-v4 open" onClick={() => setShowSchedule(false)} />
          <div className="barber-schedule-sheet-v6 open">
            <div className="barber-schedule-card-v6" onClick={(e) => e.stopPropagation()}>
              <div className="barber-profile-topbar-v4">
                <button type="button" className="profile-back-btn-v4" onClick={() => setShowSchedule(false)}>
                  <FiArrowLeft />
                </button>
                <div className="profile-top-title-v4">Schedule</div>
                <button type="button" className="profile-back-btn-v4" onClick={() => setShowSchedule(false)}>
                  <FiX />
                </button>
              </div>

              <div className="schedule-pro-shell-v7">
                <section className="schedule-calendar-panel-v7">
                  <div className="schedule-calendar-toolbar-v7">
                    <button type="button" className="schedule-nav-btn-v7" onClick={() => changeScheduleMonth(-1)}>
                      <FiArrowLeft />
                    </button>
                    <div>
                      <div className="schedule-month-title-v7">{monthTitle}</div>
                      <div className="profile-sub-v4">{barber.business_name}</div>
                    </div>
                    <button type="button" className="schedule-nav-btn-v7" onClick={() => changeScheduleMonth(1)}>
                      <FiArrowLeft className="schedule-next-icon-v7" />
                    </button>
                  </div>

                  <div className="schedule-weekdays-v7">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>

                  <div className="schedule-month-grid-v7">
                    {monthDays.map((day) => {
                      const dayBookings = bookingsByDateMap[day.value] || [];
                      const isSelected = day.value === selectedScheduleDate;
                      const isPastDay = day.value < todayValue || (day.value === todayValue && todayIsOver);
                      const toneSet = [...new Set(dayBookings.slice(0, 3).map((item) => getBookingStatusTone(item.status)))];

                      return (
                        <button
                          type="button"
                          key={day.value}
                          className={[
                            "schedule-date-cell-v7",
                            isSelected ? "active" : "",
                            dayBookings.length ? "has-bookings" : "",
                            isPastDay ? "is-past" : "",
                            day.isToday ? "today" : "",
                            day.isCurrentMonth ? "" : "muted",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            setSelectedScheduleDate(day.value);
                            setScheduleMonthDate(dateValueToDate(day.value));
                          }}
                        >
                          <span>{day.day}</span>
                          {dayBookings.length ? (
                            <div className="schedule-date-dots-v7">
                              {toneSet.map((tone) => (
                                <i key={tone} className={`tone-${tone}`} />
                              ))}
                            </div>
                          ) : null}
                          {dayBookings.length > 2 ? <em>{dayBookings.length}</em> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="schedule-agenda-panel-v7">
                  <div className="schedule-agenda-head-v7">
                    <div>
                      <div className="schedule-sheet-title-v6">{selectedDayTitle}</div>
                      <div className="profile-sub-v4">
                        {selectedDayBookings.length
                          ? `${selectedDayBookings.length} booking${selectedDayBookings.length === 1 ? "" : "s"} scheduled`
                          : "No bookings scheduled"}
                      </div>
                    </div>
                    <div className="schedule-sheet-count-v6 compact">
                      <strong>{selectedDayBookings.length}</strong>
                      <span>Booked</span>
                    </div>
                  </div>

                  <div className="schedule-agenda-summary-v7">
                    <span>{selectedPending} pending</span>
                    <span>{selectedConfirmed} confirmed</span>
                    <span>{selectedCompleted} completed</span>
                  </div>

                  {selectedDayBookings.length === 0 ? (
                    <div className="schedule-empty-pro-v7">
                      <FiCalendar />
                      <strong>Free day</strong>
                      <span>No appointments are booked on this date.</span>
                    </div>
                  ) : (
                    <div className="schedule-record-list-v9">
                      {selectedDayBookings.map((item) => (
                        <div key={item.id} className={`schedule-record-row-v9 tone-${getBookingStatusTone(item.status)}`}>
                          <div className="schedule-record-time-v9">
                            <strong>{item.timeLabel || formatTimeLabel(item.time)}</strong>
                            <span>{item.serviceDurationMinutes || 30} min</span>
                          </div>
                          <div className="schedule-record-main-v9">
                            <div className="schedule-record-name-v9">{item.customerName || item.customerUsername}</div>
                            <div className="schedule-record-meta-v9">
                              <span>
                                <FiScissors /> {item.service}
                              </span>
                              <span>
                                <FiPhone /> {item.customerUsername}
                              </span>
                            </div>
                          </div>
                          <div className="schedule-record-side-v9">
                            <span className={`schedule-status-pill-v9 tone-${getBookingStatusTone(item.status)}`}>{item.status}</span>
                            <button className="mini-action-btn-v4" onClick={() => onOpenConversation(item)}>
                              Message
                            </button>
                            {item.status === "pending" ? (
                              <div className="schedule-record-actions-v9">
                                <button className="mini-action-btn-v4 success" onClick={() => onApproveBooking(item.id)}>
                                  Approve
                                </button>
                                <button className="mini-action-btn-v4 danger" onClick={() => onRejectBooking(item.id)}>
                                  Reject
                                </button>
                              </div>
                            ) : null}
                            {item.status === "confirmed" ? (
                              <button className="mini-action-btn-v4 success" onClick={() => onCompleteBooking(item.id)}>
                                Mark done
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
