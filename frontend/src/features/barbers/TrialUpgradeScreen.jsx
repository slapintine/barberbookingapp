import { useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBarChart2,
  FiCheck,
  FiCreditCard,
  FiDollarSign,
  FiEye,
  FiLock,
  FiPhone,
  FiShield,
  FiStar,
  FiTrendingUp,
  FiX,
  FiZap,
} from "react-icons/fi";
import { formatMoney, formatPlanName, formatSubscriptionPrice, getPlanAmount, normalizePlanTier, PROVIDER_PLANS } from "../../utils/subscriptionPlans.js";

const PLANS = PROVIDER_PLANS.map((plan) => ({
  ...plan,
  badge: plan.recommended ? "Recommended" : plan.tier === "PLATINUM" ? "Best Visibility" : "",
}));

const PAYMENT_METHODS = [
  { id: "mtn_mobile_money", label: "MTN Mobile Money", icon: FiPhone, action: "Pay with MTN Mobile Money" },
  { id: "airtel_money", label: "Airtel Money", icon: FiPhone, action: "Pay with Airtel Money" },
  { id: "card", label: "Card", icon: FiCreditCard, action: "Pay with Card" },
];

const COMPARISON_ROWS = [
  ["Business profile", "Included", "Included", "Included"],
  ["Number of services", "5", "20", "Unlimited"],
  ["Photos/videos", "5 photos", "20 photos", "Unlimited photos and video"],
  ["Search visibility", "Standard", "Better ranking", "Top search, map, and category ranking"],
  ["Promotions", "Not included", "Discounts and reminders", "Featured promotions with AI captions"],
  ["Analytics", "Basic reports", "Booking and service insights", "Advanced analytics dashboard"],
  ["AI Business Coach", "Not included", "Not included", "Included"],
  ["Verified badge", "Not included", "Not included", "Included"],
  ["Homepage feature", "Not included", "Not included", "Priority placement"],
  ["Support level", "Normal", "Priority", "Premium"],
];

const PLAN_PREVIEWS = {
  PRO: [
    { title: "Reviews", text: "Collect and show customer ratings on your business profile.", icon: FiStar },
    { title: "Earnings", text: "Track paid bookings and basic wallet activity.", icon: FiDollarSign },
    { title: "Service list", text: "Publish up to 5 bookable services with prices.", icon: FiCheck },
  ],
  PREMIUM: [
    { title: "Booking analytics", text: "See booking trends, revenue signals, and customer activity.", icon: FiBarChart2 },
    { title: "Map visibility", text: "Rank higher when nearby customers open the provider map.", icon: FiEye },
    { title: "Promotions", text: "Create offers and discounts to bring customers back.", icon: FiTrendingUp },
  ],
  PLATINUM: [
    { title: "Homepage feature", text: "Get premium placement in high-visibility discovery areas.", icon: FiZap },
    { title: "Verified badge", text: "Stand out with trust and verification signals.", icon: FiShield },
    { title: "Advanced controls", text: "Unlock deeper analytics, media, and priority support.", icon: FiLock },
  ],
};

function normalizePaymentError(error) {
  if (error?.status === 401) return "Your session has expired. Please log in again.";
  if (error?.status === 403) return "You do not have permission to complete this action.";
  if (error?.status === 400) return error.message || "Missing payment details.";
  return error?.message || "Payment failed. Please try again.";
}

export default function TrialUpgradeScreen({
  barber,
  subscription,
  pendingPayment,
  loading,
  message,
  onUpgrade,
  onVerify,
  onClose,
  onChooseLater,
  initialSelectedTier = "",
  currentUser,
  isAdmin = false,
}) {
  const [selectedTier, setSelectedTier] = useState(() => normalizePlanTier(initialSelectedTier, "PRO"));
  const [step, setStep] = useState("plans");
  const [selectedMethod, setSelectedMethod] = useState("mtn_mobile_money");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [cardDetails, setCardDetails] = useState({
    cardholderName: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
  });
  const [localMessage, setLocalMessage] = useState("");
  const [status, setStatus] = useState("");
  const [expandedPlan, setExpandedPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.tier === selectedTier) || PLANS[0],
    [selectedTier]
  );
  const selectedPaymentMethod = PAYMENT_METHODS.find((method) => method.id === selectedMethod) || PAYMENT_METHODS[0];
  const currentTier = String(subscription?.tier || "LOCKED").toUpperCase();
  const currentTierLabel = formatPlanName(currentTier, "Plan required");
  const visibleMessage = localMessage || message || "";
  const trialAlreadyUsed = Number(barber?.trial_used || barber?.owner_trial_used || subscription?.trial_used || 0) === 1;

  useEffect(() => {
    const normalized = normalizePlanTier(initialSelectedTier);
    if (normalized) setSelectedTier(normalized);
  }, [initialSelectedTier]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const selectPlan = (tier) => {
    setSelectedTier(normalizePlanTier(tier, selectedTier || "PRO"));
    setLocalMessage("");
  };

  const openPayment = () => {
    setStep("payment");
    setStatus("");
    setLocalMessage("");
  };

  const validatePayment = () => {
    if (!currentUser?.username) return "Your session has expired. Please log in again.";
    if (selectedMethod !== "card" && !phoneNumber.trim()) return "Enter a phone number for Mobile Money payment.";
    if (selectedMethod === "card") {
      if (!cardDetails.cardholderName.trim()) return "Enter the cardholder name.";
      if (!cardDetails.cardNumber.trim()) return "Enter the card number.";
      if (!cardDetails.expiryDate.trim()) return "Enter the expiry date.";
      if (!cardDetails.cvv.trim()) return "Enter the CVV.";
    }
    return "";
  };

  const submitPayment = async () => {
    const validationError = validatePayment();
    if (validationError) {
      setLocalMessage(validationError);
      setStatus("failed");
      return;
    }

    if (isAdmin) {
      setStatus("success");
      setLocalMessage("Payment successful. Admin preview mode did not change a real subscription.");
      return;
    }

    try {
      setStatus("processing");
      setLocalMessage("Processing payment...");
      const ok = await onUpgrade?.({
        tier: selectedTier,
        method: selectedMethod,
        provider: selectedMethod,
        phoneNumber: phoneNumber.trim(),
        cardDetails: selectedMethod === "card" ? cardDetails : undefined,
        billingCycle,
      });
      if (ok) {
        setStatus("pending");
        setLocalMessage("Payment started. Complete authorization to activate your plan.");
      } else {
        setStatus("failed");
        setLocalMessage("");
      }
    } catch (error) {
      setStatus("failed");
      setLocalMessage(normalizePaymentError(error));
    }
  };

  const startFreeTrial = async () => {
    try {
      setStatus("processing");
      setLocalMessage(`Starting your ${selectedPlan.name} free trial...`);
      const ok = await onUpgrade?.({
        tier: selectedPlan.tier,
        method: "trial",
        provider: "trial",
        billingCycle: "monthly",
      });
      if (ok) {
        setStatus("success");
        setLocalMessage(`Your ${selectedPlan.name} free trial is active. Your business is now visible to customers.`);
      } else {
        setStatus("failed");
      }
    } catch (error) {
      setStatus("failed");
      setLocalMessage(normalizePaymentError(error));
    }
  };

  const simulateSuccess = () => {
    setStatus("success");
    setLocalMessage("Payment successful. Admin preview mode did not change a real subscription.");
  };

  const verifyPayment = async () => {
    const ok = await onVerify?.(pendingPayment?.reference);
    if (ok) {
      setStatus("success");
      setLocalMessage(`Your ${selectedPlan.name} plan is now active.`);
    } else {
      setStatus("failed");
      setLocalMessage("Payment failed. Please try again.");
    }
  };

  return (
    <div
      className="trial-upgrade-overlay-v14"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-upgrade-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="trial-upgrade-sheet-v14 trial-upgrade-screen-v12 trial-upgrade-panel-v13">
        <div className="trial-upgrade-topbar-v13">
          <button type="button" className="trial-back-icon-btn-v13" onClick={onClose} aria-label="Back">
            <FiArrowLeft />
          </button>
          <div>
            <h1 id="trial-upgrade-title">Choose your Queless plan</h1>
            {isAdmin ? <span>Admin preview mode</span> : null}
          </div>
          <button type="button" className="trial-close-icon-btn-v14" onClick={onClose} aria-label="Close upgrade">
            <FiX />
          </button>
        </div>

        <section className="trial-upgrade-hero-v12">
          <div className="trial-hero-badge-v12">
            {isAdmin ? <FiEye /> : <FiLock />}
            {isAdmin ? "Admin preview mode" : `Current plan: ${currentTier === "LOCKED" ? "Plan required" : currentTierLabel}`}
          </div>
          <h1>Upgrade to grow faster</h1>
          <p>
            Upgrade to get more bookings, better visibility, and more business tools.
          </p>
        </section>

        <div className="trial-billing-toggle-v15" role="group" aria-label="Billing cycle">
          {["monthly", "annual"].map((cycle) => (
            <button
              type="button"
              key={cycle}
              className={billingCycle === cycle ? "active" : ""}
              onClick={() => setBillingCycle(cycle)}
            >
              {cycle === "monthly" ? "Monthly" : "Annual"}
              {cycle === "annual" ? <span>Save 2 months</span> : null}
            </button>
          ))}
        </div>

        <section className="trial-plans-v12" aria-label="Choose a business plan">
          {PLANS.map((plan) => (
            <article
              className={`trial-plan-card-v12 ${selectedTier === plan.tier ? "selected" : ""}`}
              key={plan.tier}
            >
              <button type="button" className="trial-plan-select-v13" onClick={() => selectPlan(plan.tier)}>
                <span className="trial-plan-top-v12">
                  <span>{plan.name}</span>
                  {plan.badge ? <em>{plan.badge}</em> : null}
                </span>
                <strong>{formatSubscriptionPrice(plan, billingCycle)}</strong>
                <small>{plan.summary}</small>
                {billingCycle === "annual" ? <small>Save {formatMoney(plan.annualSavings)} yearly</small> : null}
              </button>
              <span className="trial-feature-list-v12">
                {plan.features.map((feature) => (
                  <span key={feature}><FiCheck /> {feature}</span>
                ))}
              </span>
              <button type="button" className="trial-select-btn-v13" onClick={() => selectPlan(plan.tier)}>
                {selectedTier === plan.tier ? "Selected" : "Select Plan"}
              </button>
              <button
                type="button"
                className="trial-view-more-btn-v14"
                aria-expanded={expandedPlan === plan.tier}
                onClick={() => setExpandedPlan((current) => (current === plan.tier ? "" : plan.tier))}
              >
                {expandedPlan === plan.tier ? "Hide Plan Details" : "View Plan Details"} <FiArrowRight />
              </button>
              {expandedPlan === plan.tier ? (
                <div className="trial-plan-preview-v14">
                  {(PLAN_PREVIEWS[plan.tier] || []).map(({ title, text, icon: Icon }) => (
                    <div className="trial-preview-card-v14" key={`${plan.tier}-${title}`}>
                      <span><Icon /></span>
                      <strong>{title}</strong>
                      <small>{text}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>

        {step === "plans" ? (
          <>
            <section className="trial-action-panel-v12">
              <div>
                <span>Selected plan</span>
                <strong>{selectedPlan.name} - {formatSubscriptionPrice(selectedPlan, billingCycle)}</strong>
                {billingCycle === "annual" ? <span>Pay yearly and save {formatMoney(selectedPlan.annualSavings)}</span> : null}
              </div>
              {visibleMessage ? <p className="trial-message-v12">{visibleMessage}</p> : null}
              <button type="button" className="trial-primary-btn-v12" onClick={openPayment} disabled={loading}>
                Continue to Payment <FiArrowRight />
              </button>
              {trialAlreadyUsed ? (
                <p className="trial-message-v12">You have already used your free trial. Select a paid plan to continue.</p>
              ) : null}
              {selectedPlan.trialAvailable && !trialAlreadyUsed ? (
                <button type="button" className="trial-secondary-btn-v12" onClick={startFreeTrial} disabled={loading || status === "processing"}>
                  Start {selectedPlan.name} Free Trial
                </button>
              ) : null}
              <button type="button" className="trial-secondary-btn-v12" onClick={onChooseLater}>
                Choose Later
              </button>
            </section>

            <section className="trial-comparison-v13" aria-label="Plan comparison">
              <div className="trial-comparison-head-v13">
                <FiBarChart2 />
                <strong>Compare Plans</strong>
              </div>
              <div className="trial-comparison-table-v13">
                <table>
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Pro</th>
                      <th>Premium</th>
                      <th>Platinum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map(([feature, pro, premium, platinum]) => (
                      <tr key={feature}>
                        <th>{feature}</th>
                        <td>{pro}</td>
                        <td>{premium}</td>
                        <td>{platinum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="trial-payment-panel-v13">
            <button type="button" className="trial-back-btn-v13" onClick={() => setStep("plans")}>
              <FiArrowLeft /> Back to plans
            </button>

            <div className="trial-payment-summary-v13">
              <span>{selectedPlan.name}</span>
              <strong>{formatSubscriptionPrice(selectedPlan, billingCycle)}</strong>
              {isAdmin ? <em>Admin preview mode</em> : null}
            </div>

            <div className="trial-method-grid-v13" aria-label="Payment methods">
              {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  className={selectedMethod === id ? "selected" : ""}
                  onClick={() => {
                    setSelectedMethod(id);
                    setLocalMessage("");
                    setStatus("");
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {selectedMethod === "card" ? (
              <div className="trial-payment-form-v13">
                <label>
                  Cardholder name
                  <input value={cardDetails.cardholderName} onChange={(event) => setCardDetails((prev) => ({ ...prev, cardholderName: event.target.value }))} />
                </label>
                <label>
                  Card number
                  <input inputMode="numeric" value={cardDetails.cardNumber} onChange={(event) => setCardDetails((prev) => ({ ...prev, cardNumber: event.target.value }))} />
                </label>
                <div className="trial-payment-two-col-v13">
                  <label>
                    Expiry date
                    <input placeholder="MM/YY" value={cardDetails.expiryDate} onChange={(event) => setCardDetails((prev) => ({ ...prev, expiryDate: event.target.value }))} />
                  </label>
                  <label>
                    CVV
                    <input inputMode="numeric" value={cardDetails.cvv} onChange={(event) => setCardDetails((prev) => ({ ...prev, cvv: event.target.value }))} />
                  </label>
                </div>
              </div>
            ) : (
              <div className="trial-payment-form-v13">
                <label>
                  Phone number
                  <input inputMode="tel" placeholder="256700000000" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
                </label>
                <div className="trial-readonly-row-v13">
                  <span>Network</span>
                  <strong>{selectedPaymentMethod.label}</strong>
                </div>
              </div>
            )}

            <div className="trial-readonly-row-v13">
              <span>Amount</span>
              <strong>{formatMoney(getPlanAmount(selectedPlan, billingCycle))}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>Plan</span>
              <strong>{selectedPlan.name} - {billingCycle === "annual" ? "Annual" : "Monthly"}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>After payment</span>
              <strong>Your business stays active for {billingCycle === "annual" ? "12 months" : "1 month"}.</strong>
            </div>

            {visibleMessage ? (
              <p className={`trial-message-v12 ${status === "failed" ? "error" : ""}`}>{visibleMessage}</p>
            ) : null}

            {pendingPayment?.reference && !isAdmin ? (
              <button type="button" className="trial-primary-btn-v12" onClick={verifyPayment} disabled={loading}>
                {loading ? "Checking payment..." : "Verify Payment"} <FiArrowRight />
              </button>
            ) : (
              <button type="button" className="trial-primary-btn-v12" onClick={submitPayment} disabled={loading || status === "processing"}>
                {status === "processing" || loading ? "Processing payment..." : selectedPaymentMethod.action}
                <FiArrowRight />
              </button>
            )}

            {isAdmin ? (
              <button type="button" className="trial-admin-test-btn-v13" onClick={simulateSuccess}>
                <FiZap /> Simulate Payment Success
              </button>
            ) : null}

            {status === "success" ? (
              <div className="trial-success-inline-v13">
                <FiCheck />
                <strong>Payment successful. Your plan has been upgraded.</strong>
              </div>
            ) : null}
          </section>
        )}

        <div className="trial-footer-note-v12">
          <FiShield />
          <span>
            {isAdmin
              ? "Admin users can preview all subscription and payment screens without being blocked."
              : "Paid features activate after payment is confirmed."}
          </span>
        </div>
      </div>
    </div>
  );
}
