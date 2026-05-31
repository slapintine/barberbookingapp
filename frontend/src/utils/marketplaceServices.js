import fallbackStandIcon from "../assets/queless-logo-icon.png";
import { formatServicePrice, getServiceBookingAmount, normalizeCategoryKey, serviceMatchesCategory } from "./serviceCatalog.js";

const VALID_PROVIDER_PLANS = new Set(["PLUS", "PREMIUM", "PLATINUM"]);
const VALID_PUBLIC_STATUSES = new Set(["active", "approved", "live"]);
const BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  "almost_ready",
  "cancelled",
  "draft",
  "expired",
  "inactive",
  "pending_subscription",
  "pending_payment",
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

export function isPublicMarketplaceProvider(provider = {}, now = Date.now()) {
  const plan = normalizeProviderPlan(provider?.subscription?.tier || provider?.subscription_tier || provider?.subscription_plan);
  const businessStatus = normalizeText(provider?.business_status || provider?.status);
  const subscriptionStatus = normalizeText(provider?.subscription?.status || provider?.subscription_status || provider?.trial_status);
  const trialStatus = normalizeText(provider?.trial_status || provider?.subscription?.trial_status);
  const adminApproved =
    provider?.admin_approved === 1 ||
    provider?.admin_approved === true ||
    ["approved", "manual_approved", "admin_approved"].includes(subscriptionStatus);
  const published =
    provider?.is_published === 1 ||
    provider?.is_published === true ||
    provider?.isPublished === true ||
    provider?.published === true;
  const deleted = Boolean(provider?.deleted_at || provider?.deletedAt);
  const hasActiveSubscription =
    subscriptionStatus === "active" &&
    isFutureDate(provider?.subscription?.expires_at || provider?.subscription_expires_at || provider?.subscriptionEndDate, now);
  const hasActiveTrial =
    subscriptionStatus === "trialing" &&
    trialStatus === "active" &&
    isFutureDate(provider?.trial_ends_at || provider?.trialEndDate || provider?.subscription?.expires_at, now);

  return (
    Boolean(plan) &&
    VALID_PUBLIC_STATUSES.has(businessStatus) &&
    published &&
    !deleted &&
    !isDemoLikeProvider(provider) &&
    !BLOCKED_SUBSCRIPTION_STATUSES.has(subscriptionStatus) &&
    (hasActiveSubscription || hasActiveTrial || adminApproved)
  );
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
  return service.image || service.image_url || service.photo || provider.image || fallbackStandIcon;
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
