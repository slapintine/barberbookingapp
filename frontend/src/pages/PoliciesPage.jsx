import { useState } from "react";
import { FiAlertTriangle, FiFileText, FiRefreshCw, FiShield, FiUsers } from "react-icons/fi";
import { SUPPORT_CHANNELS } from "../config/support.js";

const POLICIES = [
  {
    id: "terms",
    title: "Terms of Service",
    icon: FiFileText,
    points: [
      "Queless connects customers with independent service providers. Providers are responsible for the quality, timing, price, and safety of their own services.",
      "Customers should give accurate booking details, arrive on time, and pay only through the options shown or agreed with the provider.",
      "Providers may accept or reject bookings when they cannot safely or fairly complete the work.",
      "Fake accounts, fake providers, stolen photos, false prices, harassment, spam, or unsafe conduct can lead to account restriction.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    icon: FiShield,
    points: [
      "We collect account details, contact information, booking details, messages, approximate location, payment status, and support reports to run the service.",
      "Phone numbers, locations, and booking details should only be used for the booking or support case they relate to.",
      "We do not ask customers or providers to share passwords, PINs, or mobile money approval codes with anyone.",
      "Support may review booking records, reports, messages, and payment status when resolving disputes or safety concerns.",
    ],
  },
  {
    id: "refunds",
    title: "Refund Policy",
    icon: FiRefreshCw,
    points: [
      "Refunds depend on the payment method, booking status, provider response, and evidence available.",
      "If a provider rejects a paid booking, the customer should receive a refund or wallet reversal where supported.",
      "If a customer cancels late or does not show up, deposits may be held where the provider clearly disclosed that rule.",
      "If a provider does not show up, delivers unsafe service, or charges unfairly, report it quickly with booking details and screenshots where possible.",
    ],
  },
  {
    id: "providers",
    title: "Provider Policy",
    icon: FiUsers,
    points: [
      "Providers must use real business names, real service areas, clear prices, and photos they own or have permission to use.",
      "Providers can start on Free at UGX 0/month. Premium is UGX 12,000/month and Platinum is UGX 24,000/month.",
      "New providers may remain in verification pending until their profile, phone, services, location, and documents are reviewed.",
      "Repeated rejection, no-shows, fake listings, abusive conduct, or unsafe work may reduce visibility or remove the provider from Queless.",
    ],
  },
  {
    id: "community",
    title: "Community Guidelines",
    icon: FiAlertTriangle,
    points: [
      "Treat customers, providers, and support staff with respect.",
      "Do not post threats, hate speech, scams, sexual harassment, or private information.",
      "Report safety concerns, fake providers, fake reviews, no-shows, payment pressure, or off-platform fraud attempts.",
      `Use support in the app, email ${SUPPORT_CHANNELS.email}, or WhatsApp ${SUPPORT_CHANNELS.whatsapp} when something feels wrong.`,
    ],
  },
];

export default function PoliciesPage({ onOpenSupport }) {
  const [active, setActive] = useState(POLICIES[0].id);
  const current = POLICIES.find((item) => item.id === active) || POLICIES[0];
  const Icon = current.icon;

  return (
    <main className="content-v4 app-page-v4 trust-page-v1">
      <section className="trust-hero-v1 compact">
        <span><FiShield /> Queless policies</span>
        <h1>Clear rules for safer local service booking.</h1>
        <p>These summaries are written for customers and providers in Uganda. They keep expectations simple before the full legal review is finalized.</p>
      </section>

      <div className="policy-layout-v1">
        <nav className="policy-tabs-v1" aria-label="Policy sections">
          {POLICIES.map((item) => {
            const TabIcon = item.icon;
            return (
              <button key={item.id} type="button" className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>
                <TabIcon />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>

        <article className="trust-panel-v1 policy-detail-v1">
          <div className="policy-title-v1">
            <Icon />
            <h2>{current.title}</h2>
          </div>
          <ul>
            {current.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <button type="button" className="trust-primary-v1" onClick={() => onOpenSupport?.("Report a Problem")}>
            Report a problem
          </button>
        </article>
      </div>
    </main>
  );
}
