import { FiArrowLeft, FiMessageCircle, FiSend, FiX } from "react-icons/fi";

export default function ChatSheet({
  show,
  barber,
  messages,
  currentUser,
  chatText,
  setChatText,
  targetName,
  chatStatus,
  chatError,
  typingState,
  onTyping,
  onSend,
  onClose,
  chatThreadRef,
}) {
  if (!show || !barber) return null;

  return (
    <>
      <div className={show ? "booking-overlay-v4 open" : "booking-overlay-v4"} onClick={onClose} />
      <div className={show ? "booking-modal-v4 open chat-sheet-wrap-v4" : "booking-modal-v4 chat-sheet-wrap-v4"}>
        <div
          className="booking-modal-card-v4 chat-card-v4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="barber-profile-topbar-v4">
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiArrowLeft />
            </button>
            <div className="profile-top-title-v4">Chat with {targetName || barber.business_name}</div>
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiX />
            </button>
          </div>

          {chatError ? <div className="chat-error-v4">{chatError}</div> : null}

          <div className="chat-thread-v4" ref={chatThreadRef}>
            {messages.length === 0 ? (
              <div className="empty-state-v7 compact">
                <FiMessageCircle />
                <strong>No messages yet</strong>
                <span>Send a quick note to start the conversation.</span>
              </div>
            ) : (
              messages.map((item) => (
                <div
                  key={item.id}
                  className={item.sender === currentUser?.username ? "chat-bubble-v4 mine" : "chat-bubble-v4"}
                >
                  <div className="chat-bubble-text-v4">{item.text}</div>
                  {item.sender === currentUser?.username ? (
                    <div className="tiny-meta-v4">{item.seen ? "Seen" : "Sent"}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="chat-compose-v4">
            <input
              className="search-input-v4"
              placeholder="Type a message"
              value={chatText}
              onChange={(e) => {
                setChatText(e.target.value);
                onTyping(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSend();
              }}
            />
            <button className="header-icon-btn" type="button" onClick={onSend}>
              <FiSend />
            </button>
          </div>

          {typingState?.active ? (
            <div className="chat-status-v4">{typingState.name} is typing...</div>
          ) : null}

          {chatStatus ? <div className="chat-status-v4">{chatStatus}</div> : null}
        </div>
      </div>
    </>
  );
}
