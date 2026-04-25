import { useEffect, useState } from "react";
import { readStored } from "../utils/storage.js";

export default function useReviewedBookings(username) {
  const [reviewedBookings, setReviewedBookings] = useState(() =>
    readStored("reviewedBookings", "guest", {})
  );

  useEffect(() => {
    if (!username) return;
    setReviewedBookings(readStored("reviewedBookings", username, {}));
  }, [username]);

  return [reviewedBookings, setReviewedBookings];
}
