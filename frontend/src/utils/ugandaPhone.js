// Uganda mobile money phone helpers.
//
// UX: the +256 country code is fixed in the UI; the user types only the 9 local
// digits, for example "712345678". These helpers accept pasted formats and
// reduce them to those 9 local digits, detect the network from the prefix,
// validate, and produce the E.164 form the backend/provider expects.

export const MTN_PREFIXES = ["76", "77", "78", "39"];
export const AIRTEL_PREFIXES = ["70", "74", "75", "20"];

export function toUgLocalDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("256")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

export function getUgMobileProvider(localDigits) {
  const digits = String(localDigits || "");
  if (digits.length < 2) return "";
  const prefix = digits.slice(0, 2);
  if (MTN_PREFIXES.includes(prefix)) return "mtn_mobile_money";
  if (AIRTEL_PREFIXES.includes(prefix)) return "airtel_money";
  return "";
}

export function isValidUgMobile(localDigits) {
  return /^\d{9}$/.test(String(localDigits || "")) && Boolean(getUgMobileProvider(localDigits));
}

export function toE164Uganda(value) {
  const digits = toUgLocalDigits(value);
  return digits.length === 9 ? `+256${digits}` : "";
}

export function maskUgandaPhone(value) {
  const digits = toUgLocalDigits(value);
  if (digits.length !== 9) return "";
  return `+256 ${digits.slice(0, 1)}** *** ${digits.slice(-3)}`;
}

const PROVIDER_LABELS = {
  mtn_mobile_money: "MTN Mobile Money",
  airtel_money: "Airtel Money",
};

export function validateUgMobileForProvider(localDigits, selectedProvider) {
  const digits = toUgLocalDigits(localDigits);
  if (digits.length < 9) return { valid: false, error: "Enter the 9 digits after +256." };

  const provider = getUgMobileProvider(digits);
  if (!provider) {
    return { valid: false, error: "This does not look like a valid Uganda mobile money number." };
  }

  if (selectedProvider && provider !== selectedProvider) {
    const looksLike = provider === "mtn_mobile_money" ? "MTN" : "Airtel";
    const selectedLabel = PROVIDER_LABELS[selectedProvider] || "the selected network";
    return {
      valid: false,
      error: `This number looks like ${looksLike}, but ${selectedLabel} is selected.`,
    };
  }

  return { valid: true, error: "" };
}
