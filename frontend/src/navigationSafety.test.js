import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("provider navigation has a cream fallback and stays above the map", () => {
  const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./styles/navigation-safety.css", import.meta.url), "utf8");
  const openBody = app.slice(app.indexOf("const openProviderProfile"), app.indexOf("const openProviderProfile") + 1400);
  assert.match(app, /Suspense fallback={<ProviderProfileSkeleton \/>}/);
  assert.doesNotMatch(openBody, /setMapState/);
  assert.match(openBody, /providerOpenRef/);
  assert.match(css, /#fff8f4/);
  assert.match(css, /z-index: 1491/);
});
