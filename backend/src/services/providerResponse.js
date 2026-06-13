function uniqueImages(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function canonicalProviderImages(provider = {}, { services = [], portfolio = [] } = {}) {
  const coverImage = String(provider.coverImage || provider.cover_image || provider.profileImage || provider.profile_image || provider.image || "").trim();
  const portfolioImages = uniqueImages(portfolio.flatMap((item) => [item?.afterImage, item?.beforeImage, item?.after_image, item?.before_image, item?.image]));
  const serviceImages = uniqueImages(services.flatMap((service) => [service?.image, service?.service_image]));
  const galleryImages = uniqueImages([
    ...(Array.isArray(provider.galleryImages) ? provider.galleryImages : []),
    ...(Array.isArray(provider.gallery_images) ? provider.gallery_images : []),
    ...portfolioImages,
  ]);
  return {
    image: coverImage,
    image_url: coverImage,
    coverImage,
    cover_image: coverImage,
    profileImage: coverImage,
    profile_image: coverImage,
    galleryImages,
    gallery_images: galleryImages,
    serviceImages,
    service_images: serviceImages,
    portfolioImages,
    portfolio_images: portfolioImages,
  };
}

export function withCanonicalProviderFields(provider = {}, options = {}) {
  return { ...provider, ...canonicalProviderImages(provider, options) };
}
