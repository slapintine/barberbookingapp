const OFFICIAL_APK_URL = "https://queless.org/downloads/queless-latest.apk";

function isSafeDistributionUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue || /debug/i.test(rawValue)) return false;

  try {
    const url = new URL(rawValue);
    const isOfficialApk =
      url.protocol === "https:" &&
      ["queless.org", "www.queless.org"].includes(url.hostname) &&
      /^\/downloads\/queless-(?:latest|v\d+\.\d+\.\d+)\.apk$/i.test(url.pathname);
    const isPlayStoreListing =
      url.protocol === "https:" &&
      url.hostname === "play.google.com" &&
      url.pathname === "/store/apps/details";
    return isOfficialApk || isPlayStoreListing;
  } catch {
    return false;
  }
}

export function buildAppVersionResponse(config = {}) {
  const configuredUrl = String(config.androidApkUrl || "").trim();
  const response = {
    platform: "android",
    latestVersion: String(config.androidAppVersion || "1.0.0"),
    apkUrl: isSafeDistributionUrl(configuredUrl) ? configuredUrl : OFFICIAL_APK_URL,
    releaseNotes: String(config.androidReleaseNotes || "Initial Queless Android release"),
    forceUpdate: config.androidForceUpdate === true,
  };

  if (config.androidReleaseDate) response.releasedAt = String(config.androidReleaseDate);
  if (config.androidApkSize) response.fileSize = String(config.androidApkSize);

  return response;
}
