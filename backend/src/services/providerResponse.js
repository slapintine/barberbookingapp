import { normalizeProviderForClient } from "./providerCapabilities.js";

function uniqueImages(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function canonicalProviderImages(provider = {}, { services = [], portfolio = [] } = {}) {
  const businessImage = String(provider.profileImage || provider.profile_image || provider.image || "").trim();
  const coverImage = String(provider.coverImageUrl || provider.cover_image_url || provider.coverImage || provider.cover_image || businessImage).trim();
  const portfolioImages = uniqueImages(portfolio.flatMap((item) => [item?.afterImage, item?.beforeImage, item?.after_image, item?.before_image, item?.image]));
  const serviceImages = uniqueImages(services.flatMap((service) => [service?.image, service?.service_image]));
  const galleryImages = uniqueImages([
    ...(Array.isArray(provider.galleryImages) ? provider.galleryImages : []),
    ...(Array.isArray(provider.gallery_images) ? provider.gallery_images : []),
    ...portfolioImages,
  ]);
  return {
    image: businessImage,
    image_url: businessImage,
    coverImage,
    cover_image: coverImage,
    coverImageUrl: coverImage,
    cover_image_url: coverImage,
    profileImage: businessImage,
    profile_image: businessImage,
    galleryImages,
    gallery_images: galleryImages,
    serviceImages,
    service_images: serviceImages,
    portfolioImages,
    portfolio_images: portfolioImages,
  };
}

export function withCanonicalProviderFields(provider = {}, options = {}) {
  return normalizeProviderForClient({ ...provider, ...canonicalProviderImages(provider, options) });
}
