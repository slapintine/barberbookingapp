const STORAGE_PREFIX = "lineup_fallback";
const LEGACY_STORAGE_PREFIX = "cutz_fallback";

export const storageKey = (name, scope = "global") => `${STORAGE_PREFIX}:${name}:${scope}`;
const legacyStorageKey = (name, scope = "global") => `${LEGACY_STORAGE_PREFIX}:${name}:${scope}`;

export function readStored(name, scope = "global", fallback = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey(name, scope));
    if (raw) return JSON.parse(raw);

    const legacyRaw = localStorage.getItem(legacyStorageKey(name, scope));
    if (legacyRaw) {
      localStorage.setItem(storageKey(name, scope), legacyRaw);
      return JSON.parse(legacyRaw);
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(name, scope = "global", value) {
  if (typeof window === "undefined") return value;
  try {
    localStorage.setItem(storageKey(name, scope), JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
  return value;
}

export function appendStored(name, scope = "global", item) {
  const current = readStored(name, scope, []);
  const next = Array.isArray(current) ? [...current, item] : [item];
  return writeStored(name, scope, next);
}
