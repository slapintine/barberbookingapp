import fallbackStandIcon from "../assets/queless-logo-icon.png";
import { formatServicePrice, getServiceBookingAmount, normalizeCategoryKey, serviceMatchesCategory } from "./serviceCatalog.js";

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
        providerName: provider?.business_name || provider?.name || "Queless provider",
        rating: Number(provider?.rating || 0) ? Number(provider.rating).toFixed(1) : "New",
        price: getServicePrice(service, provider),
        image: getProviderImage(provider, service),
      }));
  });
}
