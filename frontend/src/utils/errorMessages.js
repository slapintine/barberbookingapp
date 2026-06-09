// Central guard so a raw server/proxy HTML body (e.g. an nginx "502 Bad Gateway"
// page) can NEVER be rendered as if it were a normal application error message.
//
// This is the single chokepoint used by the API client (config/api.js) before it
// throws, so every API-powered page — login, booking, messages, notifications,
// provider dashboard, wallet, etc. — is protected globally. UI components may also
// call sanitizeErrorMessage() directly as defense-in-depth before rendering.

export const SERVER_UNAVAILABLE_FALLBACK =
  "We're having trouble connecting to Queless right now. Please try again in a moment.";

// Friendly copy keyed by HTTP status, used when the body gives us nothing usable.
export function getFriendlyApiErrorMessage(status) {
  const code = Number(status);
  if (code === 0) {
    return "Unable to connect to the server. Please check your internet connection.";
  }
  if (code === 401) {
    return "Invalid login details. Please check your username/email and password.";
  }
  if (code === 403) {
    return "You do not have permission to perform this action.";
  }
  if (code === 404) {
    return "The requested service was not found.";
  }
  if (code === 413) {
    return "The uploaded data is too large. Please reduce the image size or upgrade your plan.";
  }
  if (code === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (code >= 500) {
    return SERVER_UNAVAILABLE_FALLBACK;
  }
  return "Something went wrong. Please try again.";
}

// Detects the tell-tale signatures of a raw HTML / server error page so we never
// surface it to a user. Catches nginx/proxy bodies as well as any stray markup.
export function looksLikeServerHtml(message) {
  if (!message) return false;
  const value = String(message);
  return (
    /<\s*!?\s*(html|head|body|center|pre|title|h1|div|p)\b/i.test(value) ||
    /<\s*!--/.test(value) ||
    /<\s*\/\s*[a-z]+\s*>/i.test(value) ||
    /\bnginx\b/i.test(value) ||
    /\bbad gateway\b/i.test(value) ||
    /\bgateway time-?out\b/i.test(value) ||
    /\b50[234]\b[^]*\b(gateway|unavailable|error)\b/i.test(value) ||
    /\bservice (temporarily )?unavailable\b/i.test(value)
  );
}

// Returns a safe, human-friendly string. If `message` looks like HTML/a server
// error page, is empty, or is missing, the friendly `fallback` is returned instead.
export function sanitizeErrorMessage(message, fallback = SERVER_UNAVAILABLE_FALLBACK) {
  if (message === null || message === undefined) return fallback;
  const value = String(message).trim();
  if (!value) return fallback;
  if (looksLikeServerHtml(value)) return fallback;
  return value;
}
