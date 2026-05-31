import { useEffect, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiLifeBuoy, FiMail, FiMessageCircle, FiSend } from "react-icons/fi";
import { createSupportRequest, getMySupportRequests } from "../api/supportApi.js";
import { SUPPORT_CHANNELS, SUPPORT_TOPICS } from "../config/support.js";

const DEFAULT_FORM = {
  topic: "Contact Support",
  name: "",
  contact: "",
  bookingId: "",
  message: "",
};

export default function SupportPage({ initialTopic = "Contact Support", profile = {}, currentUser = {}, onBackHome }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recentRequests, setRecentRequests] = useState([]);

  const loadRecentSupportRequests = async () => {
    try {
      const result = await getMySupportRequests();
      setRecentRequests(result?.support_requests || []);
    } catch {
      setRecentRequests([]);
    }
  };

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      topic: initialTopic || "Contact Support",
      name: profile.fullName || currentUser.username || prev.name,
      contact: profile.phone || profile.email || currentUser.email || prev.contact,
    }));
    setStatus("");
    setError("");
  }, [currentUser.email, currentUser.username, initialTopic, profile.email, profile.fullName, profile.phone]);

  useEffect(() => {
    loadRecentSupportRequests();
  }, [currentUser.id]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    const contact = form.contact.trim();
    const contactDigits = contact.replace(/\D/g, "");
    const validContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || (contactDigits.length >= 9 && contactDigits.length <= 15);
    if (!validContact) {
      setError("Add a valid phone number or email so support can reach you.");
      return;
    }
    if (form.message.trim().length < 10) {
      setError("Tell us what happened in at least 10 characters.");
      return;
    }
    try {
      setSubmitting(true);
      const result = await createSupportRequest({
        topic: form.topic,
        name: form.name,
        contact,
        booking_reference: form.bookingId,
        message: form.message,
      });
      const reference = result?.support_request?.id ? ` #${result.support_request.id}` : "";
      setStatus(`Support request${reference} submitted. The Queless team can now review and resolve it from the admin queue.`);
      setForm((prev) => ({ ...prev, bookingId: "", message: "" }));
      await loadRecentSupportRequests();
    } catch (requestError) {
      setError(requestError.message || `Could not submit support request. You can still contact ${SUPPORT_CHANNELS.email} or WhatsApp ${SUPPORT_CHANNELS.whatsapp}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="content-v4 app-page-v4 trust-page-v1">
      <section className="trust-hero-v1 compact">
        <span><FiLifeBuoy /> Support</span>
        <h1>Tell Queless what happened.</h1>
        <p>Use this for booking issues, provider/customer reports, safety concerns, refunds, no-shows, and account help.</p>
      </section>

      <section className="trust-quick-grid-v1">
        <a href={`mailto:${SUPPORT_CHANNELS.email}`}>
          <FiMail />
          <strong>Email</strong>
          <small>{SUPPORT_CHANNELS.email}</small>
        </a>
        <a href={`https://wa.me/${SUPPORT_CHANNELS.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
          <FiMessageCircle />
          <strong>WhatsApp</strong>
          <small>{SUPPORT_CHANNELS.whatsapp}</small>
        </a>
      </section>

      <form className="trust-panel-v1 support-form-v1" onSubmit={submit}>
        <label>
          What do you need help with?
          <select value={form.topic} onChange={(event) => updateField("topic", event.target.value)}>
            {["Contact Support", "Report a Problem", ...SUPPORT_TOPICS].map((topic) => (
              <option key={topic} value={topic}>{topic}</option>
            ))}
          </select>
        </label>
        <label>
          Your name
          <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Full name or username" />
        </label>
        <label>
          Phone or email
          <input value={form.contact} onChange={(event) => updateField("contact", event.target.value)} placeholder="+256..." />
        </label>
        <label>
          Booking ID, provider, or customer name
          <input value={form.bookingId} onChange={(event) => updateField("bookingId", event.target.value)} placeholder="Optional but helpful" />
        </label>
        <label>
          What happened?
          <textarea value={form.message} onChange={(event) => updateField("message", event.target.value)} placeholder="Describe the issue, no-show, refund request, fake listing, safety concern, or dispute." />
        </label>
        {error ? <div className="support-alert-v1 error"><FiAlertCircle /> {error}</div> : null}
        {status ? <div className="support-alert-v1 success"><FiCheckCircle /> {status}</div> : null}
        <div className="support-actions-v1">
          <button type="submit" className="trust-primary-v1" disabled={submitting}>
            <FiSend /> {submitting ? "Submitting..." : "Submit"}
          </button>
          <button type="button" onClick={onBackHome}>Back home</button>
        </div>
      </form>

      {recentRequests.length ? (
        <section className="trust-panel-v1 support-history-v1">
          <div>
            <strong>Recent support requests</strong>
            <span>Track whether a case is open, in progress, waiting on you, or resolved.</span>
          </div>
          {recentRequests.slice(0, 5).map((request) => (
            <article key={request.id}>
              <span>#{request.id} {request.topic}</span>
              <strong>{String(request.status || "open").replaceAll("_", " ")}</strong>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
