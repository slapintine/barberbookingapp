import test from "node:test";
import assert from "node:assert/strict";
import { buildAppVersionResponse } from "./appVersionService.js";

test("returns the public Android release contract", () => {
  assert.deepEqual(buildAppVersionResponse(), {
    platform: "android",
    latestVersion: "1.0.9",
    versionName: "1.0.9",
    versionCode: 10,
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

test("includes optional APK release metadata for download verification", () => {
  assert.deepEqual(
    buildAppVersionResponse({
      androidAppVersion: "1.0.1",
      androidVersionCode: 2,
      androidBuildId: "f422bebc0acc-dirty-20260715213334",
      androidReleaseDate: "2026-07-14",
      androidApkSize: "10.2 MB",
      androidApkSha256: "39F255325A189A76A727BE988FB458383D5231539DA7338DEE2F74C036D52CD0",
    }),
    {
      platform: "android",
      latestVersion: "1.0.1",
      versionName: "1.0.1",
      versionCode: 2,
      apkUrl: "https://queless.org/downloads/queless-latest.apk",
      buildId: "f422bebc0acc-dirty-20260715213334",
      releaseNotes: "Initial Queless Android release",
      forceUpdate: false,
      releasedAt: "2026-07-14",
      fileSize: "10.2 MB",
      sha256: "39F255325A189A76A727BE988FB458383D5231539DA7338DEE2F74C036D52CD0",
    }
  );
});
