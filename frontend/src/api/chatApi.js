import { apiFetch } from "../config/api.js";

export function getMessages({ barberId, customerUsername }) {
  return apiFetch(
    `/api/messages?barberId=${barberId}&customerUsername=${encodeURIComponent(customerUsername)}`
  );
}

export function createMessage(payload) {
  return apiFetch("/api/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Real conversation list for the authenticated user. Each conversation already
// carries the resolved other participant (title/otherUser), lastMessage (with
// stable sender_user_id), and unreadCount — the backend is the source of truth.
export function getConversations() {
  return apiFetch("/api/messages/conversations");
}
