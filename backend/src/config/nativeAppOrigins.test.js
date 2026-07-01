import assert from "node:assert/strict";
import test from "node:test";

import {
  NATIVE_APP_ORIGINS,
  isNativeAppOrigin,
  withNativeAppOrigins,
} from "./nativeAppOrigins.js";
import { buildCorsOptions } from "../middleware/securityMiddleware.js";

test("allows only the exact bundled Capacitor app origins", () => {
  assert.equal(isNativeAppOrigin("https://localhost"), true);
  assert.equal(isNativeAppOrigin("capacitor://localhost"), true);
  assert.equal(isNativeAppOrigin("http://localhost"), false);
  assert.equal(isNativeAppOrigin("https://localhost.evil.example"), false);
});

test("adds native app origins without duplicating website origins", () => {
  assert.deepEqual(
    withNativeAppOrigins(["https://queless.org", "https://localhost"]),
    ["https://queless.org", ...NATIVE_APP_ORIGINS]
  );
});

test("HTTP CORS middleware accepts the bundled Android WebView origin", async () => {
  await new Promise((resolve, reject) => {
    buildCorsOptions().origin("https://localhost", (error, allowed) => {
      if (error) return reject(error);
      assert.equal(allowed, true);
      resolve();
    });
  });
});
