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
    const error = new Error(`${fieldName} must be a positive integer.`);
    error.statusCode = 400;
    throw error;
  }

  return number;
}

export function requireIsoDate(value, fieldName) {
  const normalized = cleanString(value);

  if (!isIsoDate(normalized)) {
    const error = new Error(`${fieldName} must be a valid date in YYYY-MM-DD format.`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

export function requireClockTime(value, fieldName) {
  const normalized = cleanString(value);

  if (!isClockTime(normalized)) {
    const error = new Error(`${fieldName} must be a valid time in HH:MM format.`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}
