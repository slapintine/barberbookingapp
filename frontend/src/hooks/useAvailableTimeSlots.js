import { useEffect, useMemo } from "react";

export default function useAvailableTimeSlots({
  timeOptions,
  blockingBookings,
  selectedDate,
  selectedBarber,
  selectedService,
  selectedTime,
  setSelectedTime,
  getServices,
  rangesOverlap,
  workingWindow,
}) {
  const availableTimeSlots = useMemo(() => {
    const now = new Date();
    const todayValue = now.toISOString().split("T")[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + 30;
    const selectedServiceObj = getServices(selectedBarber || {}).find(
      (item) => String(item.id) === String(selectedService)
    );
    const requestedDuration = Number(selectedServiceObj?.duration_minutes || 30);
    const windowStart = workingWindow?.start || selectedBarber?.availability?.start || selectedBarber?.availability_start || "08:00";
    const windowEnd = workingWindow?.end || selectedBarber?.availability?.end || selectedBarber?.availability_end || "20:00";
    const toMinutes = (value) => {
      const [hours, minutes] = String(value || "00:00").split(":").map(Number);
      return Number(hours || 0) * 60 + Number(minutes || 0);
    };
    const openMinutes = toMinutes(windowStart);
    const closeMinutes = toMinutes(windowEnd);
    const hasWorkingWindow = closeMinutes > openMinutes;

    return timeOptions.map((slot) => {
      const slotStartMinutes = toMinutes(slot.value);
      const slotEndMinutes = slotStartMinutes + requestedDuration;
      let disabledReason = "";
      let disabled = false;

      if (!hasWorkingWindow || slotStartMinutes < openMinutes || slotEndMinutes > closeMinutes) {
        disabled = true;
        disabledReason = "Outside business hours";
      }

      if (!disabled && blockingBookings.some((booking) =>
        rangesOverlap(
          slot.value,
          requestedDuration,
          booking.time,
          booking.serviceDurationMinutes || 30
        )
      )) {
        disabled = true;
        disabledReason = "Already booked";
      }

      if (selectedDate === todayValue) {
        const [hours, minutes] = slot.value.split(":").map(Number);
        if (hours * 60 + minutes < currentMinutes) {
          disabled = true;
          disabledReason = "Time has passed";
        }
      }

      return { ...slot, disabled, disabledReason };
    });
  }, [timeOptions, blockingBookings, selectedDate, selectedBarber, selectedService, getServices, rangesOverlap, workingWindow]);

  useEffect(() => {
    const firstAvailable = availableTimeSlots.find((item) => !item.disabled)?.value || "";
    if (!availableTimeSlots.some((item) => item.value === selectedTime && !item.disabled)) {
      setSelectedTime(firstAvailable);
    }
  }, [availableTimeSlots, selectedTime, setSelectedTime]);

  return availableTimeSlots;
}
