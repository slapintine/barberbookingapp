const STOCK_IMAGE_HOSTS = [
  "images.unsplash.com",
  "source.unsplash.com",
  "picsum.photos",
  "randomuser.me",
  "via.placeholder.com",
  "placeholder.com",
  "loremflickr.com",
];

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeProviderImageReference(value) {
  const reference = String(value || "").trim();
  if (!reference) return "";
  if (STOCK_IMAGE_HOSTS.some((host) => reference.toLowerCase().includes(host))) return "";
  return reference;
}

export function getProviderImageCandidates(provider = {}) {
  const portfolio = arrayValue(provider.portfolio || provider.portfolio_json);
  const gallery = arrayValue(provider.galleryImages || provider.gallery_images || provider.gallery);
  return [
    provider.coverImage,
    provider.cover_image,
    provider.profileImage,
    provider.profile_image,
    provider.profilePhoto,
    provider.profile_photo,
    provider.image,
    provider.image_url,
    ...gallery,
    ...portfolio.flatMap((item) => [item?.afterImage, item?.beforeImage, item?.after_image, item?.before_image, item?.image]),
  ].map(normalizeProviderImageReference).filter(Boolean);
}

export function isQuotePricing(value = {}) {
  const mode = String(value.pricingMode || value.pricing_mode || value.pricingType || value.pricing_type || "").toLowerCase();
  return value.requiresQuote === true || value.requires_quote === true || value.quoteOnly === true || value.quote_only === true || ["quote", "custom", "inquiry", "inquire"].includes(mode);
}

export function formatProviderPrice(value = {}, currency = "UGX") {
  if (isQuotePricing(value)) return "Request quote";
  const amount = Number(value.price_from ?? value.priceFrom ?? value.starting_price ?? value.price ?? 0);
  return amount > 0 ? `${currency} ${amount.toLocaleString()}` : "Inquire for price";
}

export function normalizeProviderData(provider = {}, options = {}) {
  const portfolio = arrayValue(provider.portfolio || provider.portfolio_json);
  const galleryImages = [...new Set([
    ...arrayValue(provider.galleryImages || provider.gallery_images || provider.gallery),
    ...portfolio.flatMap((item) => [item?.afterImage, item?.beforeImage, item?.after_image, item?.before_image, item?.image]),
  ].map(normalizeProviderImageReference).filter(Boolean))];
  const image = getProviderImageCandidates(provider)[0] || "";
  const businessName = provider.businessName || provider.business_name || provider.name || "Queless provider";
  const businessType = provider.businessType || provider.business_type || provider.category?.name || provider.category || "Services";
  const latitude = Number(provider.latitude ?? provider.lat ?? options.defaultLatitude);
  const longitude = Number(provider.longitude ?? provider.lng ?? options.defaultLongitude);
  const pricingMode = provider.pricingMode || provider.pricing_mode || provider.pricingType || provider.pricing_type || (provider.requires_quote ? "quote" : "fixed");

  return {
    ...provider,
    id: provider.id,
    userId: provider.userId || provider.user_id || provider.owner_user_id || null,
    owner_user_id: provider.owner_user_id || provider.user_id || provider.userId || null,
    ownerUsername: provider.ownerUsername || provider.owner_username || provider.username || null,
    businessName,
    business_name: businessName,
    name: businessName,
    businessType,
    business_type: businessType,
    category: typeof provider.category === "object" ? provider.category : { id: provider.category_id || businessType, name: businessType },
    description: provider.description || provider.intro_text || "",
    intro_text: provider.intro_text || provider.description || "",
    image,
    image_url: image,
    coverImage: image,
    cover_image: image,
    profileImage: image,
    profile_image: image,
    galleryImages,
    gallery_images: galleryImages,
    portfolio,
    portfolioImages: galleryImages,
    serviceImages: arrayValue(provider.serviceImages || provider.service_images).map(normalizeProviderImageReference).filter(Boolean),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    coordinates: { lat: Number.isFinite(latitude) ? latitude : null, lng: Number.isFinite(longitude) ? longitude : null },
    pricingMode,
    pricing_mode: pricingMode,
    requiresQuote: isQuotePricing({ ...provider, pricingMode }),
    priceLabel: formatProviderPrice({ ...provider, pricingMode }),
  };
}
