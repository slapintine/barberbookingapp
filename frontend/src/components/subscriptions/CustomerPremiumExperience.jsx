import { useRef, useState } from "react";
import {
  FiArrowRight,
  FiAward,
  FiCheck,
  FiCompass,
  FiLayers,
  FiSettings,
  FiShield,
  FiZap,
} from "react-icons/fi";
import { formatCustomerPremiumPrice } from "../../utils/customerPremium.js";
import "./CustomerPremiumExperience.css";

const PREMIUM_PERKS = [
  {
    title: "Smart Match unlocked",
    description: "Tell Queless what you need and get a focused shortlist of suitable providers.",
    icon: FiZap,
  },
  {
    title: "Better recommendations",
    description: "Compare providers using location, availability, rating, and service-fit signals.",
    icon: FiCompass,
  },
  {
    title: "Faster booking",
    description: "Move from discovery to a confident booking with fewer steps and less searching.",
    icon: FiLayers,
  },
  {
    title: "Premium experience",
    description: "Use smarter discovery, comparison, and booking tools designed around your needs.",
    icon: FiShield,
  },
];

export default function CustomerPremiumExperience({
  plan,
  subscription,
  message = "",
  onUseSmartMatch,
}) {
  const benefitsRef = useRef(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const expiry = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const expiryLabel = expiry && Number.isFinite(expiry.getTime()) ? expiry.toLocaleDateString("en-UG") : "Active monthly";

  const showBenefits = () => {
    benefitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="customer-premium-experience" aria-labelledby="customer-premium-title">
      <div className="customer-premium-hero">
        <div className="customer-premium-hero-glow" aria-hidden="true" />
        <div className="customer-premium-hero-copy">
          <div className="customer-premium-eyebrow">
            <span className="customer-premium-badge"><FiAward /> Premium active</span>
            <span className="customer-premium-price">{formatCustomerPremiumPrice(plan, "monthly")}</span>
          </div>
          <h1 id="customer-premium-title">Welcome to Customer Premium <span aria-hidden="true">🎉</span></h1>
          <p>You now have access to smarter, faster booking tools on Queless.</p>
          <div className="customer-premium-hero-actions">
            <button type="button" className="customer-premium-primary" onClick={onUseSmartMatch}>
              Use Smart Match <FiArrowRight />
            </button>
            <button type="button" className="customer-premium-secondary" onClick={showBenefits}>
              View Premium benefits
            </button>
            <button type="button" className="customer-premium-text-action" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>
              <FiSettings /> Manage subscription
            </button>
          </div>
        </div>
        <div className="customer-premium-emblem" aria-hidden="true">
          <FiZap />
          <span>Smart Match</span>
          <small>Unlocked</small>
        </div>
      </div>

      {message ? (
        <div className="customer-premium-success" role="status">
          <FiCheck />
          <span>{message}</span>
        </div>
      ) : null}

      {detailsOpen ? (
        <div className="customer-premium-details">
          <div><span>Plan</span><strong>Customer Premium</strong></div>
          <div><span>Price</span><strong>{formatCustomerPremiumPrice(plan, "monthly")}</strong></div>
          <div><span>Status</span><strong>Active</strong></div>
          <div><span>Access</span><strong>{expiryLabel}</strong></div>
        </div>
      ) : null}

      <div className="customer-premium-benefits" ref={benefitsRef} tabIndex={-1}>
        <div className="customer-premium-section-head">
          <div>
            <span>Included with your plan</span>
            <h2>Your premium booking toolkit</h2>
          </div>
          <p>Discover, compare, and book with more confidence.</p>
        </div>
        <div className="customer-premium-perk-grid">
          {PREMIUM_PERKS.map(({ title, description, icon: Icon }) => (
            <article className="customer-premium-perk" key={title}>
              <span className="customer-premium-perk-icon"><Icon /></span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

