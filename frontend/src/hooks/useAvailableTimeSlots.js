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
}) {
  const availableTimeSlots = useMemo(() => {
    const now = new Date();
    const todayValue = now.toISOString().split("T")[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + 30;
    const selectedServiceObj = getServices(selectedBarber || {}).find(
      (item) => String(item.id) === String(selectedService)
    );
    const requestedDuration = Number(selectedServiceObj?.duration_minutes || 30);

    return timeOptions.map((slot) => {
      let disabled = blockingBookings.some((booking) =>
        rangesOverlap(
          slot.value,
          requestedDuration,
          booking.time,
          booking.serviceDurationMinutes || 30
        )
      );

      if (selectedDate === todayValue) {
        const [hours, minutes] = slot.value.split(":").map(Number);
        if (hours * 60 + minutes < currentMinutes) disabled = true;
      }

      return { ...slot, disabled };
    });
  }, [timeOptions, blockingBookings, selectedDate, selectedBarber, selectedService, getServices, rangesOverlap]);

  useEffect(() => {
    const firstAvailable = availableTimeSlots.find((item) => !item.disabled)?.value || "";
    if (!availableTimeSlots.some((item) => item.value === selectedTime && !item.disabled)) {
      setSelectedTime(firstAvailable);
    }
  }, [availableTimeSlots, selectedTime, setSelectedTime]);

  return availableTimeSlots;
}
