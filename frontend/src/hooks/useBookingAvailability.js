import { useEffect, useState } from "react";
import { getBookingAvailability } from "../api/bookingsApi.js";

export default function useBookingAvailability({ barberId, bookingDate, teamMemberId, enabled }) {
  const [availability, setAvailability] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !barberId || !bookingDate) {
      setAvailability(null);
      return undefined;
    }

    getBookingAvailability({ barberId, bookingDate, teamMemberId })
      .then((data) => {
        if (!cancelled) setAvailability(data?.availability || null);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });

    return () => {
      cancelled = true;
    };
  }, [barberId, bookingDate, teamMemberId, enabled]);

  return availability;
}
