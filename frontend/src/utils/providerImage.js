// Shared provider/user image fallback helpers.
//
// Rules (per Queless design spec):
//   1. Use a real uploaded photo / business logo / cover image when present.
//   2. Otherwise fall back to a service or portfolio image.
//   3. Otherwise show a clean initials avatar.
//   4. Otherwise a neutral placeholder icon.
// NEVER fall back to the Queless logo and NEVER use unrelated stock photos.

const AVATAR_PALETTE = [
  ["#0EA5A5", "#0B1D3A"],
  ["#0B1D3A", "#0EA5A5"],
  ["#22C55E", "#0B1D3A"],
  ["#155E75", "#0EA5A5"],
  ["#1E3A8A", "#0EA5A5"],
];

/** 1-2 letter initials from the first non-empty business / person name. */
export function getProviderInitials(provider = {}) {
  const candidates = [
    provider.business_name,
    provider.name,
    provider.businessName,
    provider.title,
    provider.username,
    provider.owner_username,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (text.includes("@")) return text[0].toUpperCase();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    return text.slice(0, 2).toUpperCase();
  }
  return "Q";
}

function pickPalette(seed = "") {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Deterministic, brand-coloured initials avatar as an inline SVG data URI. */
export function buildInitialsAvatar(seed = "", initials = "") {
  const label = String(initials || seed || "Q").slice(0, 2).toUpperCase();
  const [from, to] = pickPalette(seed || label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="160" height="160" rx="24" fill="url(#g)"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="#FFFFFF"
    font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="62" font-weight="700">${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Neutral grey placeholder (storefront glyph) — used when there is no name either. */
export const NEUTRAL_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="24" fill="#F1F5F9"/>
    <g fill="none" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M48 70h64v46H48z"/><path d="M44 70l8-22h56l8 22"/><path d="M70 116V90h20v26"/>
    </g>
  </svg>`
)}`;

/** First real uploaded image for a provider/service, or "" when none exists. */
export function getProviderImageUrl(provider = {}, service = {}) {
  const portfolioImage = (Array.isArray(provider.portfolio) ? provider.portfolio : [])
    .flatMap((item) => [item?.afterImage, item?.beforeImage, item?.image].filter(Boolean))
    .find(Boolean);
  const galleryImage = (Array.isArray(provider.gallery) ? provider.gallery : []).find(Boolean);
  return (
    service?.image ||
    service?.image_url ||
    service?.photo ||
    provider.cover_image ||
    provider.logo ||
    provider.profilePhoto ||
    provider.profile_photo ||
    provider.profile_image ||
    provider.image ||
    provider.image_url ||
    provider.photo ||
    portfolioImage ||
    galleryImage ||
    ""
  );
}

/**
 * A usable <img src> that is never the Queless logo: real image when present,
 * otherwise a branded initials avatar (or neutral placeholder).
 */
export function resolveProviderImage(provider = {}, service = {}) {
  const real = getProviderImageUrl(provider, service);
  if (real) return real;
  const initials = getProviderInitials(provider);
  return initials === "Q" && !provider.business_name && !provider.name
    ? NEUTRAL_PLACEHOLDER
    : buildInitialsAvatar(provider.business_name || provider.name || "", initials);
}

/** onError handler that swaps a broken image for the initials/placeholder fallback. */
export function handleProviderImageError(provider = {}) {
  return (event) => {
    const fallback = resolveProviderImage(provider);
    if (event?.currentTarget && event.currentTarget.src !== fallback) {
      event.currentTarget.src = fallback;
    }
  };
}
