import assert from "node:assert/strict";
import test from "node:test";
import { formatProviderPrice, normalizeProviderData, normalizeProviderImageReference } from "./providerData.js";
import { getProviderImageUrl } from "./providerImage.js";

test("normalizes canonical backend provider images consistently", () => {
  const provider = normalizeProviderData({
    id: 7,
    business_name: "A Stand",
    coverImage: "/api/uploads/providers/7/cover.png",
    galleryImages: ["/api/uploads/providers/7/work.png"],
  });
  assert.equal(provider.image, provider.coverImage);
  assert.equal(provider.profileImage, provider.coverImage);
  assert.deepEqual(provider.galleryImages, ["/api/uploads/providers/7/work.png"]);
});

test("removes production stock-image fallbacks", () => {
  assert.equal(normalizeProviderImageReference("https://images.unsplash.com/photo-demo"), "");
  assert.equal(getProviderImageUrl({ image: "https://images.unsplash.com/photo-demo", coverImage: "/api/uploads/providers/1/cover.png" }), "/api/uploads/providers/1/cover.png");
});

test("quote stands never render UGX 0", () => {
  assert.equal(formatProviderPrice({ pricing_mode: "quote", price_from: 0 }), "Request quote");
  assert.equal(formatProviderPrice({ price_from: 0 }), "Inquire for price");
});
