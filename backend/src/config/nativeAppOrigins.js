export const NATIVE_APP_ORIGINS = Object.freeze([
  "https://localhost",
  "capacitor://localhost",
]);

export function isNativeAppOrigin(origin) {
  return NATIVE_APP_ORIGINS.includes(String(origin || "").trim());
}

export function withNativeAppOrigins(origins = []) {
  return [...new Set([...(origins || []), ...NATIVE_APP_ORIGINS])];
}
