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

test("a logo-only stand uses the logo (normalizer and image helper agree)", () => {
  const raw = { id: 9, business_name: "Logo Stand", logo: "/api/uploads/providers/9/logo.png" };
  const normalized = normalizeProviderData(raw);
  // Both the normalized record and the shared image helper resolve to the logo
  // — never a placeholder — so website and app stay in sync.
  assert.equal(normalized.image, "/api/uploads/providers/9/logo.png");
  assert.equal(getProviderImageUrl(raw), "/api/uploads/providers/9/logo.png");
});

test("real uploaded references pass through unchanged", () => {
  for (const ref of ["/api/uploads/providers/1/a.png", "https://cdn.example.com/a.jpg", "data:image/png;base64,AAAA", "blob:http://x/y"]) {
    assert.equal(normalizeProviderImageReference(ref), ref);
  }
});

test("numeric prices still render normally", () => {
  assert.equal(formatProviderPrice({ price_from: 15000 }), "UGX 15,000");
});
