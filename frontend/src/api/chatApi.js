import { apiFetch } from "../config/api.js";

const CONVERSATIONS_CACHE_TTL_MS = 15_000;
let conversationsCache = null;
let conversationsRequest = null;

function currentAuthScope() {
  if (typeof localStorage === "undefined" && typeof sessionStorage === "undefined") return "server";
  const token =
    localStorage.getItem("lineup_token") ||
    sessionStorage.getItem("lineup_token") ||
    "";
  return token ? `auth:${token.slice(-12)}` : "guest";
}

export function clearConversationsCache() {
  conversationsCache = null;
  conversationsRequest = null;
}

export function getMessages({ barberId, customerUsername }) {
  return apiFetch(
    `/api/messages?barberId=${barberId}&customerUsername=${encodeURIComponent(customerUsername)}`
  );
}

export function createMessage(payload) {
  clearConversationsCache();
  return apiFetch("/api/messages", {
    method: "POST",
    headers: payload.clientMessageId ? { "Idempotency-Key": payload.clientMessageId } : {},
    body: JSON.stringify(payload),
  });
}

// Real conversation list for the authenticated user. Each conversation already
// carries the resolved other participant (title/otherUser), lastMessage (with
// stable sender_user_id), and unreadCount — the backend is the source of truth.
export function getConversations() {
  const key = currentAuthScope();
  const now = Date.now();
  if (conversationsCache?.key === key && now - conversationsCache.createdAt < CONVERSATIONS_CACHE_TTL_MS) {
    return Promise.resolve(conversationsCache.data);
  }
  if (conversationsRequest?.key === key) return conversationsRequest.promise;
  const promise = apiFetch("/api/messages/conversations")
    .then((data) => {
      conversationsCache = { key, data, createdAt: Date.now() };
      return data;
    })
    .finally(() => {
      if (conversationsRequest?.key === key) conversationsRequest = null;
    });
  conversationsRequest = { key, promise };
  return promise;
}
