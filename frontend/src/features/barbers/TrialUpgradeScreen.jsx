import { useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBarChart2,
  FiCheck,
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
  badge: plan.recommended ? "Recommended" : plan.tier === "PLATINUM" ? "Best visibility" : plan.tier === "FREE" ? "No payment" : "",
}));

const PAYMENT_METHODS = [
  { id: "mtn_mobile_money", label: "MTN Mobile Money", icon: FiPhone, action: "Pay with MTN Mobile Money" },
  { id: "airtel_money", label: "Airtel Money", icon: FiPhone, action: "Pay with Airtel Money" },
];

const COMPARISON_ROWS = [
  ["Business profile", "Included", "Included", "Included"],
  ["Number of services", "5", "20", "Unlimited"],
  ["Images", "2 images / 20MB total", "5 images / 50MB total", "10 images / 100MB total"],
  ["Search visibility", "Basic", "Priority visibility", "Top search, map, and category ranking"],
  ["Promotions", "Not included", "Promotional display tools", "Advanced promotional tools"],
  ["Analytics", "Basic reports", "Basic analytics", "Advanced analytics dashboard"],
  ["Smart Match eligibility", "Not included", "Included", "Included"],
  ["Provider Coach", "Platinum preview", "5 tips/month", "Unlimited"],
  ["Review blocking", "Not included", "Not included", "Up to 10 reviews"],
  ["Support level", "Normal support", "Faster support", "Priority support"],
];

const PLAN_PREVIEWS = {
  FREE: [
    { title: "Reviews", text: "Collect and show customer ratings on your business profile.", icon: FiStar },
    { title: "Earnings", text: "Track paid bookings and basic wallet activity.", icon: FiDollarSign },
    { title: "Service list", text: "Publish up to 5 bookable services with prices.", icon: FiCheck },
  ],
  PREMIUM: [
    { title: "More services", text: "List more services and add a stronger gallery as your business grows.", icon: FiCheck },
    { title: "Smart Match", text: "Become eligible for Smart Match discovery where provider matching is available.", icon: FiEye },
    { title: "Growth tools", text: "Use basic analytics and promotional display tools to attract more customers.", icon: FiTrendingUp },
  ],
  PLATINUM: [
    { title: "Homepage feature", text: "Get premium placement in high-visibility discovery areas.", icon: FiZap },
    { title: "Verified badge", text: "Stand out with trust and verification signals.", icon: FiShield },
    { title: "Advanced controls", text: "Unlock deeper analytics, media, and priority support.", icon: FiLock },
  ],
};

function normalizePaymentError(error, planName = "selected plan") {
  if (error?.status === 401) return "Your session has expired. Please log in again.";
  if (error?.status === 403) return error?.message || "This action is not available for your account type.";
  if (error?.status === 400) return error.message || "Missing payment details.";
  return error?.message || `We couldn't activate your ${planName}. Please try again.`;
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
  const [selectedTier, setSelectedTier] = useState(() => normalizePlanTier(initialSelectedTier, "FREE"));
  const [step, setStep] = useState("plans");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [status, setStatus] = useState("");
  const [expandedPlan, setExpandedPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState("");

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.tier === selectedTier) || PLANS[0],
    [selectedTier]
  );
  const selectedIsFree = selectedPlan?.tier === "FREE";
  const selectedPaymentMethod = PAYMENT_METHODS.find((method) => method.id === selectedMethod);
  const currentTier = String(subscription?.tier || "LOCKED").toUpperCase();
  const currentTierLabel = formatPlanName(currentTier, "Plan required");
  const visibleMessage = localMessage || message || "";
  const planAmount = getPlanAmount(selectedPlan, billingCycle);
  const promoPreviewAmount = promoApplied ? planAmount : planAmount;

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
    setSelectedTier(normalizePlanTier(tier, selectedTier || "FREE"));
    setLocalMessage("");
  };

  const openPayment = async () => {
    if (selectedIsFree) {
      try {
        setStatus("processing");
        setLocalMessage("Starting Free plan...");
        const ok = await onUpgrade?.({
          tier: "FREE",
          method: "free",
          provider: "free",
          billingCycle: "monthly",
        });
        if (ok) {
          setStatus("success");
          setLocalMessage("Free plan activated. Verification may still be required before customers can see it.");
        } else {
          setStatus("failed");
          setLocalMessage("");
        }
      } catch (error) {
        setStatus("failed");
        setLocalMessage(normalizePaymentError(error, "Free plan"));
      }
      return;
    }
    setStep("payment");
    setStatus("");
    setLocalMessage("");
  };

  const validatePayment = () => {
    if (!currentUser?.username) return "Your session has expired. Please log in again.";
    if ((promoApplied || promoCode.trim()) && !selectedMethod) return "";
    if (!selectedMethod) return "Choose MTN Mobile Money or Airtel Money before paying.";
    if (!phoneNumber.trim()) return "Enter a phone number for Mobile Money payment.";
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
        billingCycle,
        promoCode: promoApplied || promoCode.trim(),
      });
      if (ok) {
        setStatus("pending");
        setLocalMessage("Plan selected. Complete payment to activate your business.");
      } else {
        setStatus("failed");
        setLocalMessage("");
      }
    } catch (error) {
      setStatus("failed");
      setLocalMessage(normalizePaymentError(error, selectedPlan?.name || "selected plan"));
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

        <section className="trial-upgrade-hero-v12 trial-plan-helper-v16">
          <div className="trial-hero-badge-v12">
            {isAdmin ? <FiEye /> : <FiLock />}
            {isAdmin ? "Admin preview mode" : currentTier === "LOCKED" ? "Plan setup" : `Current plan: ${currentTierLabel}`}
          </div>
          <p>Start free or upgrade when you are ready.</p>
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
                {billingCycle === "annual" && plan.annualSavings > 0 ? <small>Save {formatMoney(plan.annualSavings)} yearly</small> : null}
              </button>
              <span className="trial-feature-list-v12">
                {plan.features.map((feature) => (
                  <span key={feature}><FiCheck /> {feature}</span>
                ))}
              </span>
              <button type="button" className="trial-select-btn-v13" onClick={() => selectPlan(plan.tier)}>
                {selectedTier === plan.tier ? "Selected" : plan.tier === "FREE" ? "Start free" : `Upgrade to ${plan.name}`}
              </button>
              <button
                type="button"
                className="trial-view-more-btn-v14"
                aria-expanded={expandedPlan === plan.tier}
                onClick={() => setExpandedPlan((current) => (current === plan.tier ? "" : plan.tier))}
              >
                {expandedPlan === plan.tier ? "Hide plan details" : "View plan details"} <FiArrowRight />
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
                <span>Selected plan: {selectedPlan.name}</span>
                <strong>{formatSubscriptionPrice(selectedPlan, billingCycle)}</strong>
                {billingCycle === "annual" && selectedPlan.annualSavings > 0 ? <span>Pay yearly and save {formatMoney(selectedPlan.annualSavings)}</span> : null}
              </div>
              {visibleMessage ? <p className="trial-message-v12">{visibleMessage}</p> : null}
              <button type="button" className="trial-primary-btn-v12" onClick={openPayment} disabled={loading}>
                {selectedIsFree ? "Start free" : "Continue to payment"} <FiArrowRight />
              </button>
              <button type="button" className="trial-secondary-btn-v12" onClick={onChooseLater}>
                Choose later
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
                      <th>Free</th>
                      <th>Premium</th>
                      <th>Platinum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map(([feature, FREE, premium, platinum]) => (
                      <tr key={feature}>
                        <th>{feature}</th>
                        <td>{FREE}</td>
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

            <div className="trial-payment-form-v13">
              <label>
                Phone number
                <input inputMode="tel" placeholder="256700000000" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
              </label>
              <label>
                Promo code
                <span className="trial-promo-row-v16">
                  <input
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(event) => {
                      setPromoCode(event.target.value);
                      setPromoApplied("");
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPromoApplied(promoCode.trim());
                      setStatus("");
                      setLocalMessage("Promo code applied.");
                    }}
                    disabled={!promoCode.trim()}
                  >
                    Apply
                  </button>
                </span>
              </label>
              <div className="trial-readonly-row-v13">
                <span>Network</span>
                <strong>{selectedPaymentMethod?.label || "Choose a network"}</strong>
              </div>
            </div>

            <div className="trial-readonly-row-v13">
              <span>Amount</span>
              <strong>{formatMoney(planAmount)}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>Final amount payable</span>
              <strong>{promoApplied ? "Calculated after server validation" : formatMoney(promoPreviewAmount)}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>Plan</span>
              <strong>{selectedPlan.name} - {billingCycle === "annual" ? "Annual" : "Monthly"}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>After payment</span>
              <strong>Activation happens only after backend payment confirmation.</strong>
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
                {status === "processing" || loading ? "Processing payment..." : selectedPaymentMethod?.action || "Choose Payment Method"}
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
              : "Free starts without payment. Paid features activate after payment is confirmed."}
          </span>
        </div>
      </div>
    </div>
  );
}
