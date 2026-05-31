import { useMemo, useState } from "react";
import { FiChevronDown, FiLifeBuoy, FiMail, FiMessageCircle, FiSearch, FiShield } from "react-icons/fi";
import { SUPPORT_CHANNELS } from "../config/support.js";

const HOW_IT_WORKS = [
  "Search by service, category, nearby area, or current location.",
  "Review provider profiles, ratings, safety signals, pricing, and service area.",
  "Request or confirm a booking, then follow updates in the app.",
];

const PRICING = [
  { title: "Customer Free", price: "Free", text: "Browse, save providers, request quotes, and book services." },
  { title: "Customer Premium", price: "UGX 10,000/month", text: "Unlock Smart Match recommendations for faster provider discovery." },
  { title: "Provider Plus", price: "UGX 6,000/month", text: "Start listing services and receiving booking requests." },
  { title: "Provider Premium", price: "UGX 12,000/month", text: "Grow visibility with stronger profile and booking tools." },
  { title: "Provider Platinum", price: "UGX 24,000/month", text: "Top visibility, advanced insights, and premium trust signals." },
];

const FAQS = [
  {
    question: "What is Queless?",
    answer: "Queless helps customers find and book trusted local service providers in Uganda, including beauty, grooming, home services, repairs, cleaning, tutors, and other local professionals.",
  },
  {
    question: "How does booking work?",
    answer: "Choose a provider, select a service, pick a date and time, then send the booking request. Some bookings are confirmed immediately, while others wait for the provider to accept.",
  },
  {
    question: "How do customers pay?",
    answer: "Customers can use the payment options shown during booking. Cash may be available for some providers. Mobile money and wallet actions are shown only when the app confirms they are available.",
  },
  {
    question: "How do providers receive bookings?",
    answer: "Providers receive booking requests in the app, with notifications where available. They can accept, reject, complete, or manage bookings from the provider dashboard.",
  },
  {
    question: "What is Smart Match?",
    answer: "Smart Match is a Premium customer feature that helps recommend providers using service category, location, budget, availability, rating, and payment preferences.",
  },
  {
    question: "How do subscriptions work?",
    answer: "Customers can use Queless Free or Customer Premium. Providers must choose a paid provider plan: Plus, Premium, or Platinum. Provider listings are reviewed before they appear publicly.",
  },
  {
    question: "What happens if a provider does not show up?",
    answer: "Report the problem from Support or the booking screen. Queless can review the booking, messages, payment state, and provider record before advising on refunds, credits, or account action.",
  },
  {
    question: "How do I contact support?",
    answer: `Use Contact Support in the app, email ${SUPPORT_CHANNELS.email}, or message WhatsApp ${SUPPORT_CHANNELS.whatsapp}. Include your booking ID if you have one.`,
  },
];

export default function HelpCenterPage({ onOpenSupport, onBackHome }) {
  const [query, setQuery] = useState("");
  const [openIndex, setOpenIndex] = useState(0);
  const filteredFaqs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return FAQS;
    return FAQS.filter((item) => `${item.question} ${item.answer}`.toLowerCase().includes(needle));
  }, [query]);

  return (
    <main className="content-v4 app-page-v4 trust-page-v1">
      <section className="trust-hero-v1">
        <span><FiLifeBuoy /> Help Center</span>
        <h1>Get clear answers before you book or list services.</h1>
        <p>Simple guidance for customers and providers, with safety-first support when something goes wrong.</p>
        <div className="trust-search-v1">
          <FiSearch />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics" />
        </div>
      </section>

      <section className="trust-quick-grid-v1">
        <button type="button" onClick={() => onOpenSupport?.("Contact Support")}>
          <FiMail />
          <strong>Contact Support</strong>
          <small>{SUPPORT_CHANNELS.email}</small>
        </button>
        <button type="button" onClick={() => onOpenSupport?.("Report a Problem")}>
          <FiShield />
          <strong>Report a Problem</strong>
          <small>Bookings, payments, safety, or account issues</small>
        </button>
        <button type="button" onClick={() => onOpenSupport?.("WhatsApp Support")}>
          <FiMessageCircle />
          <strong>WhatsApp</strong>
          <small>{SUPPORT_CHANNELS.whatsapp}</small>
        </button>
      </section>

      <section className="trust-panel-v1">
        <div className="trust-panel-head-v1">
          <h2>How Queless Works</h2>
        </div>
        <div className="trust-step-grid-v1">
          {HOW_IT_WORKS.map((item, index) => (
            <article key={item}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-panel-v1">
        <div className="trust-panel-head-v1">
          <h2>Plans and Pricing</h2>
        </div>
        <div className="trust-pricing-grid-v1">
          {PRICING.map((item) => (
            <article key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.price}</span>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-panel-v1 trust-safety-band-v1">
        <FiShield />
        <div>
          <strong>Book with clear expectations</strong>
          <p>Check ratings, verified badges, prices, service area, opening hours, and reviews before booking. Report fake providers, no-shows, unsafe conduct, or unfair payment pressure from Support.</p>
        </div>
      </section>

      <section className="trust-panel-v1">
        <div className="trust-panel-head-v1">
          <h2>Frequently Asked Questions</h2>
          <button type="button" onClick={onBackHome}>Back home</button>
        </div>
        <div className="faq-list-v1">
          {filteredFaqs.map((item, index) => (
            <article key={item.question} className={openIndex === index ? "faq-item-v1 open" : "faq-item-v1"}>
              <button type="button" onClick={() => setOpenIndex(openIndex === index ? -1 : index)}>
                <strong>{item.question}</strong>
                <FiChevronDown />
              </button>
              {openIndex === index ? <p>{item.answer}</p> : null}
            </article>
          ))}
          {!filteredFaqs.length ? <div className="trust-muted-v1">No matching answer yet. Contact support and we will help.</div> : null}
        </div>
      </section>
    </main>
  );
}
