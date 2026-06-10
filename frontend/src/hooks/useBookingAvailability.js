import { useEffect, useState } from "react";
import { getBookingAvailability } from "../api/bookingsApi.js";

export default function useBookingAvailability({ barberId, bookingDate, teamMemberId, enabled }) {
  const requestKey = enabled && barberId && bookingDate ? `${barberId}|${bookingDate}|${teamMemberId || ""}` : "";
  const [availabilityEntry, setAvailabilityEntry] = useState({ key: "", value: null });
  const [loadingEntry, setLoadingEntry] = useState({ key: "", value: false });
  const [errorEntry, setErrorEntry] = useState({ key: "", value: "" });
  const availability = requestKey && availabilityEntry.key === requestKey ? availabilityEntry.value : null;
  const loading = requestKey && loadingEntry.key === requestKey ? loadingEntry.value : false;
  const error = requestKey && errorEntry.key === requestKey ? errorEntry.value : "";

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !barberId || !bookingDate) {
      return undefined;
    }

    setLoadingEntry({ key: requestKey, value: true });
    setErrorEntry({ key: requestKey, value: "" });
    getBookingAvailability({ barberId, bookingDate, teamMemberId })
      .then((data) => {
        if (!cancelled) {
          setAvailabilityEntry({ key: requestKey, value: data?.availability || null });
          setErrorEntry({ key: requestKey, value: "" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailabilityEntry({ key: requestKey, value: null });
          setErrorEntry({ key: requestKey, value: "Availability could not be loaded. Try another day." });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEntry({ key: requestKey, value: false });
      });

    return () => {
      cancelled = true;
    };
  }, [barberId, bookingDate, teamMemberId, enabled, requestKey]);

  return { availability, loading, error };
}
