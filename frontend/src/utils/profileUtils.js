export const PHONE_COUNTRIES = [
  { code: "+256", label: "Uganda", flag: "🇺🇬", localLength: 9 },
  { code: "+254", label: "Kenya", flag: "🇰🇪", localLength: 9 },
  { code: "+255", label: "Tanzania", flag: "🇹🇿", localLength: 9 },
  { code: "+250", label: "Rwanda", flag: "🇷🇼", localLength: 9 },
];

export function sanitizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function splitPhoneNumber(value) {
  const raw = String(value || "").trim();
  const match = PHONE_COUNTRIES.find((item) => raw.startsWith(item.code));
  if (!match) {
    return { countryCode: "+256", localNumber: sanitizeDigits(raw).replace(/^0+/, "") };
  }
  return {
    countryCode: match.code,
    localNumber: sanitizeDigits(raw.slice(match.code.length)).replace(/^0+/, ""),
  };
}

export function buildPhoneNumber(countryCode, localNumber) {
  return `${countryCode}${sanitizeDigits(localNumber).replace(/^0+/, "")}`;
}

export function isValidPhoneNumber(countryCode, localNumber) {
  const country = PHONE_COUNTRIES.find((item) => item.code === countryCode);
  if (!country) return false;
  const digits = sanitizeDigits(localNumber).replace(/^0+/, "");
  return digits.length === country.localLength;
}
