export function cleanString(value) {
  return String(value ?? "").trim();
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;

  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isClockTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

export function toPositiveInteger(value, fieldName) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(friendlyFieldMessage(fieldName, "id"));
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    error.details = { field: fieldName };
    throw error;
  }

  return number;
}

export function requireIsoDate(value, fieldName) {
  const normalized = cleanString(value);

  if (!isIsoDate(normalized)) {
    const error = new Error(friendlyFieldMessage(fieldName, "date"));
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    error.details = { field: fieldName };
    throw error;
  }

  return normalized;
}

export function requireClockTime(value, fieldName) {
  const normalized = cleanString(value);

  if (!isClockTime(normalized)) {
    const error = new Error(friendlyFieldMessage(fieldName, "time"));
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    error.details = { field: fieldName };
    throw error;
  }

  return normalized;
}

function friendlyFieldMessage(fieldName, kind) {
  const field = String(fieldName || "").toLowerCase();
  if (field.includes("barber") || field.includes("provider")) {
    return "This provider could not be found. Please return to search and try again.";
  }
  if (field.includes("service")) {
    return "This service is no longer available. Choose another service.";
  }
  if (field.includes("booking")) {
    return "This booking is no longer available. Refresh the page and try again.";
  }
  if (field.includes("team")) {
    return "That provider team member is no longer available. Choose another option.";
  }
  if (kind === "date") {
    return "Choose a valid booking date.";
  }
  if (kind === "time") {
    return "Choose a valid booking time.";
  }
  return "That request could not be completed. Refresh the page and try again.";
}
