const CONFIRMED_STATUS = "confirmed";

export const LIVE_DELAY_OPTIONS = Object.freeze([
  { value: 0, label: "On time" },
  { value: 10, label: "10 minutes late" },
  { value: 15, label: "15 minutes late" },
  { value: 30, label: "30 minutes late" },
  { value: "custom", label: "Custom delay" },
]);

export function normalizeLiveStatus(value) {
  return String(value || "expected").trim().toLowerCase();
}

export function getProviderLiveStatusActions(booking = {}) {
  if (String(booking.status || "").toLowerCase() !== CONFIRMED_STATUS) return [];

  const liveStatus = normalizeLiveStatus(booking.liveStatus);
  if (liveStatus === "arrived") {
    return [
      { value: "ready", label: "Mark ready" },
      { value: "running_late", label: "Running late" },
    ];
  }
  if (liveStatus === "ready") {
    return [{ value: "service_started", label: "Start service" }];
  }
  if (liveStatus === "service_started") {
    return [{ value: "service_completed", label: "Complete service" }];
  }
  if (["service_completed", "no_show", "booking_cancelled"].includes(liveStatus)) return [];

  return [
    { value: "arrived", label: "Mark arrived" },
    { value: "running_late", label: "Running late" },
  ];
}
