// Uganda mobile money phone helpers.
//
// UX: the +256 country code is fixed in the UI; the user types only the 9 local
// digits (e.g. "712345678"). These helpers accept any pasted format and reduce
// it to those 9 local digits, detect the network from the prefix, validate, and
// produce the E.164 form (+256XXXXXXXXX) the backend/provider expects.

// Mobile money network prefixes (first two local digits).
export const MTN_PREFIXES = ["76", "77", "78", "39"];
export const AIRTEL_PREFIXES = ["70", "74", "75", "20"];

/**
 * Reduce any pasted value to the 9 local digits (no country code, no leading 0).
 *   "0712345678"     -> "712345678"
 *   "+256712345678"  -> "712345678"
 *   "256712345678"   -> "712345678"
 *   "712345678"      -> "712345678"
 * Caps at 9 digits and strips spaces/symbols/letters.
 */
export function toUgLocalDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("256")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

/** Network for a 9-digit local number, or "" if the prefix is unknown. */
export function getUgMobileProvider(localDigits) {
  const d = String(localDigits || "");
  if (d.length < 2) return "";
  const prefix = d.slice(0, 2);
  if (MTN_PREFIXES.includes(prefix)) return "mtn_mobile_money";
  if (AIRTEL_PREFIXES.includes(prefix)) return "airtel_money";
  return "";
}

/** True when the local number is 9 digits AND a recognised mobile-money prefix. */
export function isValidUgMobile(localDigits) {
  return /^\d{9}$/.test(String(localDigits || "")) && Boolean(getUgMobileProvider(localDigits));
}

/** E.164 form (+256XXXXXXXXX) the backend expects, or "" when incomplete. */
export function toE164Uganda(value) {
  const d = toUgLocalDigits(value);
  return d.length === 9 ? `+256${d}` : "";
}

/** Masked display, e.g. "+256 7•• ••• 494" — never show the full number widely. */
export function maskUgandaPhone(value) {
  const d = toUgLocalDigits(value);
  if (d.length !== 9) return "";
  return `+256 ${d.slice(0, 1)}•• ••• ${d.slice(-3)}`;
}

const PROVIDER_LABELS = {
  mtn_mobile_money: "MTN Mobile Money",
  airtel_money: "Airtel Money",
};

/**
 * Validate a local number against the selected provider.
 * Returns { valid, error } with a user-facing message when invalid.
 */
export function validateUgMobileForProvider(localDigits, selectedProvider) {
  const d = toUgLocalDigits(localDigits);
  if (d.length < 9) return { valid: false, error: "Enter the 9 digits after +256." };

  const provider = getUgMobileProvider(d);
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
