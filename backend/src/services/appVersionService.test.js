import test from "node:test";
import assert from "node:assert/strict";
import { buildAppVersionResponse } from "./appVersionService.js";

test("returns the public Android release contract", () => {
  assert.deepEqual(buildAppVersionResponse(), {
    platform: "android",
    latestVersion: "1.0.0",
    apkUrl: "https://queless.org/downloads/queless-latest.apk",
    releaseNotes: "Initial Queless Android release",
    forceUpdate: false,
  });
});

test("rejects debug and untrusted APK URLs while allowing a future Play Store switch", () => {
  assert.equal(
    buildAppVersionResponse({ androidApkUrl: "https://example.com/queless-debug.apk" }).apkUrl,
    "https://queless.org/downloads/queless-latest.apk"
  );
  assert.equal(
    buildAppVersionResponse({ androidApkUrl: "https://play.google.com/store/apps/details?id=org.queless.app" }).apkUrl,
    "https://play.google.com/store/apps/details?id=org.queless.app"
  );
});
