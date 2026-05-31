import { FiMessageCircle, FiSearch } from "react-icons/fi";

export default function InboxPage({ messages = [] }) {
  const visibleMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message.text || message.body || message.message || "").trim())
    : [];
  const hasMessages = visibleMessages.length > 0;
  const conversations = hasMessages
    ? visibleMessages.slice(-4).reverse().map((message, index) => ({
        id: message.id || `message-${index}`,
        name: message.senderName || message.from || message.sender || "Queless message",
        preview: message.text || message.body || message.message || "New message",
        time: message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Recent",
      }))
    : [];

  return (
    <div className="content-v4 app-page-v4 queless-utility-page">
      <div className="queless-utility-head">
        <span><FiMessageCircle /></span>
        <div>
          <h1>Inbox</h1>
          <p>{hasMessages ? "Recent service conversations" : "No new messages yet."}</p>
        </div>
      </div>

      <div className="queless-inbox-list">
        {!hasMessages ? (
          <div className="queless-inbox-empty">
            <FiSearch />
            <strong>No new messages yet.</strong>
            <small>Conversations with service providers will show up here.</small>
          </div>
        ) : null}

        {conversations.map((conversation) => (
          <article className="queless-inbox-card" key={conversation.id}>
            <span>{conversation.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{conversation.name}</strong>
              <small>{conversation.preview}</small>
            </div>
            <em>{conversation.time}</em>
          </article>
        ))}
      </div>
    </div>
  );
}
