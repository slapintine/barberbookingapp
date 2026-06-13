import { useCallback, useEffect, useState } from "react";
import { FiMessageCircle, FiRefreshCw, FiSearch } from "react-icons/fi";
import { getConversations } from "../api/chatApi.js";

function formatTime(value) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Inbox driven by the real /api/messages/conversations endpoint.
 * The backend resolves the other participant and carries a stable
 * lastMessage.sender_user_id, so ownership is decided by ID — never by name.
 */
export default function InboxPage({ currentUserId, onOpenConversation }) {
  const [conversations, setConversations] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const myId = currentUserId != null ? Number(currentUserId) : null;

  const load = useCallback(async () => {
    setStatus((prev) => (prev === "ready" ? "ready" : "loading"));
    try {
      const data = await getConversations();
      const list = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(list);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = conversations.map((conversation) => {
    const last = conversation.lastMessage || conversation.last_message || {};
    const senderId = last.senderId ?? last.sender_user_id ?? null;
    const isMine = myId != null && senderId != null && Number(senderId) === myId;
    const text = last.text || last.body || conversation.lastMessageText || "New message";
    const other = conversation.otherUser || conversation.other_user || {};

    return {
      id: conversation.id || conversation.conversationId,
      barberId: conversation.barberId ?? conversation.providerId ?? null,
      customerUsername: conversation.customerUsername || conversation.customer_username || "",
      title: conversation.title || other.fullName || other.username || "Conversation",
      // own messages are clearly attributed to "You:", never to my display name
      preview: isMine ? `You: ${text}` : text,
      time: formatTime(conversation.updatedAt || conversation.updated_at || last.createdAt),
      unread: Number(conversation.unreadCount ?? conversation.unread_count ?? 0) > 0,
    };
  });

  const hasRows = rows.length > 0;
  const showEmpty = status === "ready" && !hasRows;

  return (
    <div className="content-v4 app-page-v4 queless-utility-page">
      <div className="queless-utility-head">
        <span><FiMessageCircle /></span>
        <div>
          <h1>Inbox</h1>
          <p>{hasRows ? "Recent service conversations" : "Your conversations live here."}</p>
        </div>
      </div>

      <div className="queless-inbox-list">
        {status === "loading" ? (
          <div className="queless-inbox-skeletons" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="queless-inbox-skeleton" key={i}>
                <span />
                <div>
                  <i />
                  <em />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status === "error" ? (
          <div className="queless-inbox-empty">
            <FiRefreshCw />
            <strong>Couldn't load your conversations.</strong>
            <small>Check your connection and try again.</small>
            <button type="button" className="queless-inbox-retry" onClick={load}>
              Retry
            </button>
          </div>
        ) : null}

        {showEmpty ? (
          <div className="queless-inbox-empty">
            <FiSearch />
            <strong>No messages yet.</strong>
            <small>Conversations with service providers will show up here.</small>
          </div>
        ) : null}

        {rows.map((row) => (
          <button
            type="button"
            className={row.unread ? "queless-inbox-card queless-inbox-card--unread" : "queless-inbox-card"}
            key={row.id}
            onClick={() => onOpenConversation?.(row)}
            disabled={!row.barberId}
            aria-label={`Open conversation with ${row.title}`}
          >
            <span>{String(row.title).slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{row.title}</strong>
              <small>{row.preview}</small>
            </div>
            <em>{row.time}</em>
            {row.unread ? <i className="queless-inbox-unread-dot" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
