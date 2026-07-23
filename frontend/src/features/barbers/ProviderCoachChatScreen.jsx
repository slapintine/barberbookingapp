import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiBriefcase,
  FiRefreshCw,
  FiSend,
  FiStar,
  FiZap,
} from "react-icons/fi";
import { sendProviderCoachMessage } from "../../api/aiCoachApi.js";
import "./ProviderCoachChatScreen.css";

const PROMPTS = [
  "Why am I not getting bookings?",
  "Improve my stand description",
  "What services should I add?",
  "Is my pricing okay?",
  "How can I attract more customers?",
  "Write a better welcome message",
  "What should I post today?",
  "Explain my current plan",
];

const WELCOME_MESSAGE = {
  id: "provider-coach-welcome",
  role: "assistant",
  content: "Hi! I am your Queless Business Assistant. Ask me about your stand, services, pricing, photos, profile readiness, or ways to build customer trust. I will use the business details you have saved on Queless.",
};

function storageKey(businessId) {
  return businessId ? `queless-provider-coach-chat:${businessId}` : "";
}

function readStoredMessages(businessId) {
  const key = storageKey(businessId);
  if (!key) return [WELCOME_MESSAGE];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    const messages = Array.isArray(parsed)
      ? parsed
          .filter((item) => ["user", "assistant"].includes(item?.role) && String(item?.content || "").trim())
          .slice(-30)
          .map((item, index) => ({ ...item, id: `stored-${index}-${item.role}` }))
      : [];
    return messages.length ? [WELCOME_MESSAGE, ...messages.filter((item) => item.id !== WELCOME_MESSAGE.id)] : [WELCOME_MESSAGE];
  } catch {
    return [WELCOME_MESSAGE];
  }
}

function saveStoredMessages(businessId, messages) {
  const key = storageKey(businessId);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify(messages.filter((item) => item.id !== WELCOME_MESSAGE.id).slice(-30))
    );
  } catch {
    // Chat remains usable when storage is unavailable.
  }
}

function getPlanLabel(subscription, barber) {
  const value = String(
    subscription?.tier ||
    subscription?.plan ||
    barber?.subscription_tier ||
    barber?.selected_plan ||
    "Free"
  ).trim().toLowerCase();
  const normalized = ["premium", "platinum"].includes(value) ? value : "free";
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function getFriendlyCoachError(error) {
  if (error?.code === "DAILY_LIMIT_REACHED") {
    return error?.userMessage || "You've reached today's Business Assistant limit. Please come back tomorrow.";
  }
  if (error?.status === 429) return "Coach is receiving a lot of questions. Please wait a moment and try again.";
  if (error?.status === 404 || error?.code === "NO_STAND") {
    return "Create or save your stand first so Coach can give advice based on your business.";
  }
  if (error?.status === 503 || error?.code === "AI_UNAVAILABLE") {
    return "Business Assistant is taking a short break. Your stand is safe—please try again shortly.";
  }
  if (error?.status === 401) return "Please log in again to continue with Business Assistant.";
  if (error?.status === 403 || error?.code === "PROVIDER_PLAN_INACTIVE") return "Choose an active provider plan to use Business Assistant.";
  return error?.userMessage || error?.message || "Business Assistant couldn’t answer that question. Please try again.";
}

export default function ProviderCoachChatScreen({
  barber,
  subscription,
  onBack,
  onCreateStand,
  onEditStand,
}) {
  const [messages, setMessages] = useState(() => readStoredMessages(barber?.id));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const messageListRef = useRef(null);
  const inputRef = useRef(null);
  const messageSequenceRef = useRef(0);
  const planLabel = useMemo(() => getPlanLabel(subscription, barber), [subscription, barber]);
  const standStatus = Number(barber?.is_published ?? barber?.isPublished ?? 0) === 1 ? "Live stand" : "Draft stand";
  const latestAssistantId = useMemo(
    () => [...messages].reverse().find((item) => item.role === "assistant" && item.id !== WELCOME_MESSAGE.id)?.id || "",
    [messages]
  );

  useEffect(() => {
    document.body.dataset.quelessProviderCoachOpen = "true";
    const handleNativeBack = () => onBack?.();
    window.addEventListener("queless:native-back", handleNativeBack);
    return () => {
      delete document.body.dataset.quelessProviderCoachOpen;
      window.removeEventListener("queless:native-back", handleNativeBack);
    };
  }, [onBack]);

  useEffect(() => {
    setMessages(readStoredMessages(barber?.id));
    setDraft("");
    setError("");
  }, [barber?.id]);

  useEffect(() => {
    saveStoredMessages(barber?.id, messages);
    const list = messageListRef.current;
    if (!list) return;
    if (autoScroll) {
      window.requestAnimationFrame(() => {
        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      });
    }
  }, [barber?.id, messages, sending, autoScroll]);

  const scrollToLatest = () => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    setAutoScroll(true);
    setShowJump(false);
  };

  const handleMessageScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const nearBottom = distanceFromBottom < 96;
    setAutoScroll(nearBottom);
    setShowJump(!nearBottom);
  };

  async function submitQuestion(rawQuestion = draft) {
    const question = String(rawQuestion || "").trim();
    if (!question || sending || !barber) return;

    const userMessage = {
      id: `provider-${messageSequenceRef.current += 1}`,
      role: "user",
      content: question.slice(0, 1000),
    };
    const history = messages
      .filter((item) => item.id !== WELCOME_MESSAGE.id)
      .slice(-8)
      .map(({ role, content, intent, topic }) => ({ role, content, intent, topic }));

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setSending(true);
    setError("");
    setLastQuestion(question);

    try {
      const result = await sendProviderCoachMessage(question, history);
      setMessages((current) => [
        ...current,
        {
          id: `coach-${messageSequenceRef.current += 1}`,
          role: "assistant",
          content: result?.answer || "I couldn’t prepare an answer just now. Please try again.",
          contextSummary: result?.contextSummary || null,
          intent: result?.intent || "",
          topic: result?.topic || "",
          nextBestAction: result?.nextBestAction || "",
          suggestedChips: Array.isArray(result?.suggestedChips) ? result.suggestedChips.slice(0, 6) : [],
        },
      ]);
    } catch (requestError) {
      setError(getFriendlyCoachError(requestError));
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  if (!barber) {
    return (
      <main className="provider-coach-chat-page provider-coach-chat-empty">
        <header className="provider-coach-chat-header">
          <button type="button" className="provider-coach-back" data-testid="provider-coach-back" onClick={onBack} aria-label="Back to dashboard">
            <FiArrowLeft />
          </button>
          <div>
            <span>Queless</span>
            <h1>Business Assistant</h1>
          </div>
        </header>
        <section className="provider-coach-empty-card">
          <span><FiBriefcase /></span>
          <h2>Create your stand first</h2>
          <p>Create or save your stand first so Coach can give advice based on your business.</p>
          <button type="button" onClick={onCreateStand}>Create stand</button>
        </section>
      </main>
    );
  }

  return (
    <main className="provider-coach-chat-page">
      <header className="provider-coach-chat-header">
          <button type="button" className="provider-coach-back" data-testid="provider-coach-back" onClick={onBack} aria-label="Back to dashboard">
          <FiArrowLeft />
        </button>
        <div className="provider-coach-chat-title">
          <span><FiZap /> Queless AI</span>
          <h1>Business Assistant</h1>
          <p>Ask me how to improve your stand, bookings, pricing, services, and customer experience.</p>
        </div>
        <div className="provider-coach-chat-status" title={`${planLabel} plan · ${standStatus}`}>
          <FiStar />
          <span>{planLabel}</span>
        </div>
      </header>

      <div className="provider-coach-context-strip">
        <span>{barber.business_name || "Your stand"}</span>
        <i aria-hidden="true" />
        <span>{standStatus}</span>
        <button type="button" data-testid="provider-coach-edit-stand" onClick={onEditStand}>Edit stand</button>
      </div>

      <section className="provider-coach-message-list" ref={messageListRef} onScroll={handleMessageScroll} aria-live="polite">
        <div className="provider-coach-prompt-area">
          <strong>Try asking</strong>
          <div className="provider-coach-prompt-chips">
            {PROMPTS.map((prompt) => (
              <button type="button" key={prompt} data-testid="provider-coach-quick-action" onClick={() => submitQuestion(prompt)} disabled={sending}>
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {messages.map((message) => (
          <article
            key={message.id}
            className={`provider-coach-message provider-coach-message--${message.role}`}
          >
            {message.role === "assistant" ? <span className="provider-coach-avatar"><FiZap /></span> : null}
            <div>
              <small>{message.role === "assistant" ? "Business Assistant" : "You"}</small>
              <p>{message.content}</p>
              {message.role === "assistant" && message.nextBestAction ? (
                <aside className="provider-coach-next-action">
                  <strong><FiZap /> Next best action</strong>
                  <span>{message.nextBestAction}</span>
                </aside>
              ) : null}
              {message.role === "assistant" &&
              message.id === latestAssistantId &&
              Array.isArray(message.suggestedChips) &&
              message.suggestedChips.length ? (
                <div className="provider-coach-response-chips" aria-label="Suggested follow-up questions">
                  {message.suggestedChips.map((chip) => (
                    <button type="button" key={chip} data-testid="provider-coach-suggested-action" onClick={() => submitQuestion(chip)} disabled={sending}>
                      {chip}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}

        {sending ? (
          <article className="provider-coach-message provider-coach-message--assistant">
            <span className="provider-coach-avatar"><FiZap /></span>
            <div className="provider-coach-typing" aria-label="Business Assistant is typing">
              <small>Business Assistant</small>
              <span><i /><i /><i /></span>
            </div>
          </article>
        ) : null}

        {error ? (
          <div className="provider-coach-chat-error" role="alert">
            <FiAlertCircle />
            <span>{error}</span>
            {lastQuestion ? (
              <button type="button" onClick={() => submitQuestion(lastQuestion)} disabled={sending}>
                <FiRefreshCw /> Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {showJump ? (
        <button type="button" className="provider-coach-jump-latest" data-testid="provider-coach-jump-latest" onClick={scrollToLatest}>
          Jump to latest
        </button>
      ) : null}

      <form
        className="provider-coach-composer"
        data-testid="provider-coach-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submitQuestion();
        }}
      >
        <label htmlFor="provider-coach-message">Ask Business Assistant</label>
        <div>
          <textarea
            id="provider-coach-message"
            data-testid="provider-coach-input"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
            onFocus={() => window.setTimeout(scrollToLatest, 120)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitQuestion();
              }
            }}
            placeholder="Ask about your stand, pricing, services…"
            rows={1}
            maxLength={1000}
            disabled={sending}
          />
          <button type="submit" data-testid="provider-coach-submit" disabled={sending || !draft.trim()} aria-label="Send message">
            <FiSend />
          </button>
        </div>
        <small>Coach gives advice only and never edits your stand automatically.</small>
      </form>
    </main>
  );
}
