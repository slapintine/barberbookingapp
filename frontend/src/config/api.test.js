import test from "node:test";
import assert from "node:assert/strict";
import { buildAssetUrl, buildPublicUrl, ASSET_ORIGIN } from "./api.js";

test("absolute, data, and blob image refs pass through unchanged", () => {
  assert.equal(buildAssetUrl("https://queless.org/api/uploads/p/x.jpg"), "https://queless.org/api/uploads/p/x.jpg");
  assert.equal(buildAssetUrl("http://x/y.png"), "http://x/y.png");
  assert.equal(buildAssetUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(buildAssetUrl("blob:abc"), "blob:abc");
});

test("empty / nullish refs return an empty string (no broken <img>)", () => {
  assert.equal(buildAssetUrl(""), "");
  assert.equal(buildAssetUrl(null), "");
  assert.equal(buildAssetUrl(undefined), "");
});

test("server-relative upload paths are made absolute against the asset origin", () => {
  // Under `node --test` there is no VITE_API_URL, so ASSET_ORIGIN is "" and the
  // path stays relative; in a production/Android build (VITE_API_URL=https://queless.org/api)
  // ASSET_ORIGIN is https://queless.org, so this returns an absolute HTTPS URL that
  // resolves correctly even inside the Android WebView (origin https://localhost).
  assert.equal(
    buildAssetUrl("/api/uploads/providers/7/cover-abc.jpg"),
    `${ASSET_ORIGIN}/api/uploads/providers/7/cover-abc.jpg`
  );
});

test("public links use the API origin instead of the WebView origin", () => {
  assert.equal(buildPublicUrl("/providers/demo-stand"), `${ASSET_ORIGIN || "https://queless.org"}/providers/demo-stand`);
});
