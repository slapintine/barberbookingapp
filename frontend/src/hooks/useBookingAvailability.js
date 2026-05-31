import { useEffect, useState } from "react";
import { getBookingAvailability } from "../api/bookingsApi.js";

export default function useBookingAvailability({ barberId, bookingDate, teamMemberId, enabled }) {
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !barberId || !bookingDate) {
      setAvailability(null);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    setError("");
    getBookingAvailability({ barberId, bookingDate, teamMemberId })
      .then((data) => {
        if (!cancelled) {
          setAvailability(data?.availability || null);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability(null);
          setError("Availability could not be loaded. Try another day.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [barberId, bookingDate, teamMemberId, enabled]);

  return { availability, loading, error };
}
