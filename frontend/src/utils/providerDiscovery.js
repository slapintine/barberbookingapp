import { resolveProviderImage } from "./providerImage.js";
import { formatServicePrice, getServiceBookingAmount, normalizeCategoryKey, serviceMatchesCategory } from "./serviceCatalog.js";

const VALID_PROVIDER_PLANS = new Set(["FREE", "PREMIUM", "PLATINUM"]);
const VALID_PUBLIC_STATUSES = new Set(["active", "approved", "live"]);
// Only statuses that represent a truly terminal or hard-blocked billing state.
// "pending_subscription", "draft", "inactive" are NOT terminal — a free provider
// with no sub row simply has no status set, which is fine.
const BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  "cancelled",
  "expired",
  "payment_failed",
  "plan_required",
  "rejected",
  "subscription_expired",
  "suspended",
  "trial_expired",
]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeProviderPlan(plan) {
  const normalized = String(plan || "").trim().toUpperCase();
  return VALID_PROVIDER_PLANS.has(normalized) ? normalized : "";
}

export function isFutureDate(value, now = Date.now()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const current = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(timestamp) && timestamp > current;
}

export function isDemoLikeProvider(provider = {}) {
  const businessName = normalizeText(provider.business_name || provider.name);
  const ownerUsername = normalizeText(provider.ownerUsername || provider.owner_username || provider.username);
  const ownerEmail = normalizeText(provider.email || provider.owner_email);
  const image = normalizeText(provider.image || provider.profile_image || provider.cover_image);
  const location = normalizeText(provider.location);

  return (
    Number(provider.is_demo ?? provider.isDemo ?? 0) === 1 ||
    provider.is_demo === true ||
    provider.isDemo === true ||
    /\b(demo|sample|fake|test)\b/.test(businessName) ||
    businessName.startsWith("qa ") ||
    businessName.startsWith("qa_") ||
    ownerUsername.startsWith("qa_") ||
    ownerEmail.startsWith("qa.") ||
    ownerEmail.endsWith("@queless.test") ||
    image.includes("placeholder") ||
    ["test location", "demo location", "sample location"].includes(location)
  );
}

function isVerificationApproved(value) {
  const status = normalizeText(value);
  return ["approved", "verified", "complete", "completed"].includes(status);
}

export function isPublicMarketplaceProvider(provider = {}) {
  // Treat missing/unknown plan as FREE — a provider without an explicit plan is still a free provider.
  const rawPlan = normalizeProviderPlan(provider?.subscription?.tier || provider?.subscription_tier || provider?.subscription_plan);
  const plan = rawPlan || "FREE";
  const businessStatus = normalizeText(provider?.business_status || provider?.status);
  const subscriptionStatus = normalizeText(provider?.subscription?.status || provider?.subscription_status);
  const published =
    provider?.is_published === 1 ||
    provider?.is_published === true ||
    provider?.isPublished === true ||
    String(provider?.is_published) === "1" ||
    provider?.published === true;
  const deleted = Boolean(
    provider?.deleted_at || provider?.deletedAt || businessStatus === "deleted"
  );
  const isBanned = provider?.is_banned === 1 || provider?.is_banned === true;
  const isSuspended = provider?.is_suspended === 1 || provider?.is_suspended === true;
  return (
    Boolean(plan) &&
    VALID_PUBLIC_STATUSES.has(businessStatus) &&
    published &&
    !isBanned &&
    !isSuspended &&
    !deleted &&
    !isDemoLikeProvider(provider) &&
    !BLOCKED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
  );
}

/**
 * True when the logged-in user owns this provider stand. Used to switch the UI
 * into "self-view" (no Book Now / no self-booking) across web and mobile.
 */
export function isOwnProvider(provider = {}, currentUser = null) {
  if (!provider || !currentUser) return false;
  const userId = currentUser.id ?? currentUser.user_id;
  const ownerId = provider.owner_user_id ?? provider.ownerUserId ?? provider.owner_id;
  if (userId != null && ownerId != null && Number(userId) === Number(ownerId)) return true;
  const username = normalizeText(currentUser.username);
  const ownerUsername = normalizeText(provider.ownerUsername || provider.owner_username);
  return Boolean(username) && username === ownerUsername;
}

/** Provider subscription tier: "PLATINUM" | "PREMIUM" | "FREE". */
export function getProviderTier(provider = {}) {
  return (
    normalizeProviderPlan(
      provider?.subscription?.tier || provider?.subscription_tier || provider?.subscription_plan
    ) || "FREE"
  );
}

/** True when a provider is verified (admin-approved / certified). */
export function isProviderVerified(provider = {}) {
  if (provider?.is_verified === true || provider?.is_verified === 1) return true;
  return (
    isVerificationApproved(provider?.verified) ||
    isVerificationApproved(provider?.verified_status) ||
    ["verified", "certified", "top rated", "top-rated"].includes(normalizeText(provider?.verified))
  );
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours)) return null;
  return hours * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

/** Closing time string (e.g. "20:00") when availability hours are known. */
export function getProviderClosingTime(provider = {}) {
  return provider?.availability?.end || provider?.availability_end || "";
}

/**
 * True when the provider is currently open per its availability window.
 * When hours are unknown we assume open (don't hide providers without hours).
 */
export function isProviderOpenNow(provider = {}, now = new Date()) {
  const start = timeToMinutes(provider?.availability?.start || provider?.availability_start);
  const end = timeToMinutes(provider?.availability?.end || provider?.availability_end);
  if (start == null || end == null) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

export function getServiceName(service = {}) {
  return service.service_name || service.name || service.title || "Service";
}

export function getServiceCategory(service = {}) {
  return service.category || service.category_name || service.type || service.categoryId || service.category_id || "";
}

export function getServicePrice(service = {}, provider = {}) {
  const base = Number(provider.price_from || 0);
  if (base > 0 && String(service.pricing_type || "fixed") === "fixed") {
    const total = base + getServiceBookingAmount(service);
    return total > 0 ? `From UGX ${total.toLocaleString()}` : "Price on consultation";
  }
  return formatServicePrice(service);
}

export function getProviderImage(provider = {}, service = {}) {
  // Real uploaded image when present, otherwise a branded initials avatar —
  // never the Queless logo (see utils/providerImage.js).
  return resolveProviderImage(provider, service);
}

export function categoryMatches(service = {}, category = "") {
  if (!category || category === "All") return true;
  const selectedKey = normalizeCategoryKey(category);
  const serviceCategory = getServiceCategory(service);
  const idMatch = normalizeCategoryKey(service.category_id || service.categoryId || "") === selectedKey;
  const categoryMatch = normalizeCategoryKey(serviceCategory) === selectedKey;
  return idMatch || categoryMatch || serviceMatchesCategory(service, category);
}

export function buildCategoryServices(providers = [], category = "") {
  return (Array.isArray(providers) ? providers : []).flatMap((provider) => {
    if (!isPublicMarketplaceProvider(provider)) return [];
    const services = Array.isArray(provider?.services) ? provider.services : [];
    const providerMatchesCategory =
      !category ||
      category === "All" ||
      normalizeCategoryKey(provider?.category_name || provider?.business_type || provider?.category || "") ===
        normalizeCategoryKey(category);
    return services
      .filter((service) => categoryMatches(service, category))
      .map((service, index) => ({
        id: `${provider?.id || "provider"}-${service.id || getServiceName(service)}-${index}`,
        service,
        provider,
        title: getServiceName(service),
        category: getServiceCategory(service) || (providerMatchesCategory ? category : ""),
        providerName: provider?.business_name || provider?.name || "Provider",
        rating: Number(provider?.rating || 0) ? Number(provider.rating).toFixed(1) : "New",
        price: getServicePrice(service, provider),
        image: getProviderImage(provider, service),
      }));
  });
}
