import { toE164Uganda, toUgLocalDigits } from "./ugandaPhone.js";

export const MAX_SERVICE_DURATION_MINUTES = 30 * 24 * 60;

export const SERVICE_DURATION_PRESETS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "Half day" },
  { minutes: 480, label: "Full day" },
  { minutes: 2880, label: "2 days" },
  { minutes: 10080, label: "1 week" },
];

export const SERVICE_DELIVERY_MODES = [
  { value: "provider_location", label: "Customer visits stand", hint: "Customers come to your listed location." },
  { value: "customer_location", label: "Provider travels", hint: "You visit the customer at their address." },
  { value: "pickup_delivery", label: "Pickup & delivery", hint: "Collect and return the customer’s item." },
  { value: "online", label: "Online / remote", hint: "Deliver this service by phone or online." },
  { value: "mobile_area", label: "Mobile service", hint: "Travel within areas agreed with the customer." },
  { value: "appointment_only", label: "By appointment only", hint: "Confirm the place after a request is accepted." },
];

export function isValidUgandaStandPhone(value) {
  return /^(?:7\d|20|31|39)\d{7}$/.test(toUgLocalDigits(value));
}

export function normalizeUgandaStandPhone(value) {
  const localDigits = toUgLocalDigits(value);
  return isValidUgandaStandPhone(localDigits) ? toE164Uganda(localDigits) : "";
}

export function getUgandaStandPhoneError(value) {
  const digits = toUgLocalDigits(value);
  if (!digits) return "Enter the 9 digits after +256.";
  if (digits.length !== 9) return "Enter all 9 digits after +256.";
  if (!isValidUgandaStandPhone(digits)) return "Enter a valid Uganda mobile number.";
  return "";
}

export function convertDurationToMinutes(value, unit = "minutes") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : unit === "weeks" ? 10080 : 1;
  return Math.round(amount * multiplier);
}

export function inferDurationInput(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return { value: "", unit: "minutes" };
  if (minutes % 10080 === 0) return { value: minutes / 10080, unit: "weeks" };
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

export function formatServiceDuration(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  if (!minutes) return "Duration not set";
  const preset = SERVICE_DURATION_PRESETS.find((item) => item.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 10080 === 0) return `${minutes / 10080} ${minutes === 10080 ? "week" : "weeks"}`;
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;
  return `${minutes} min`;
}

export function requiresFixedBusinessLocation(services = []) {
  if (!Array.isArray(services) || !services.length) return true;
  return services.some((service) =>
    ["provider_location", "pickup_delivery"].includes(String(service?.location_type || "provider_location").toLowerCase())
  );
}
