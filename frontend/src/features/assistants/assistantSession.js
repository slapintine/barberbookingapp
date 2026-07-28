export function readAssistantSession(key, fallbackValue) {
  if (!key || typeof sessionStorage === "undefined") return fallbackValue;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : fallbackValue;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Session persistence is optional.
    }
    return fallbackValue;
  }
}

export function writeAssistantSession(key, value) {
  if (!key || typeof sessionStorage === "undefined") return false;
  try {
    sessionStorage.setItem(key, JSON.stringify(value || {}));
    return true;
  } catch {
    return false;
  }
}

export function mergeAssistantSession(current = {}, patch = {}) {
  return {
    ...(current && typeof current === "object" ? current : {}),
    ...(patch && typeof patch === "object" ? patch : {}),
    updatedAt: new Date().toISOString(),
  };
}
