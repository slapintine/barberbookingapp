import assert from "node:assert/strict";
import test from "node:test";
import { withCanonicalProviderFields } from "./providerResponse.js";

test("canonical response exposes the same image contract to app and website", () => {
  const result = withCanonicalProviderFields({ image: "/api/uploads/providers/1/cover.png" }, {
    services: [{ image: "/api/uploads/providers/1/service.png" }],
    portfolio: [{ afterImage: "/api/uploads/providers/1/work.png" }],
  });
  assert.equal(result.coverImage, result.profileImage);
  assert.deepEqual(result.galleryImages, ["/api/uploads/providers/1/work.png"]);
  assert.deepEqual(result.serviceImages, ["/api/uploads/providers/1/service.png"]);
  assert.deepEqual(result.portfolioImages, ["/api/uploads/providers/1/work.png"]);
});
