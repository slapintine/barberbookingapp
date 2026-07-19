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
import { PAYMENTS_COMING_SOON_MESSAGE, PAYMENTS_ENABLED } from "../../utils/launchFlags.js";

const PLANS = PROVIDER_PLANS.map((plan) => ({
  ...plan,
  badge: plan.recommended ? "Recommended" : plan.tier === "PLATINUM" ? "Best visibility" : plan.tier === "FREE" ? "No payment" : "",
}));

const PAYMENT_METHODS = [
  { id: "mtn_mobile_money", label: "MTN Mobile Money", icon: FiPhone, action: "Continue with MTN Mobile Money" },
  { id: "airtel_money", label: "Airtel Money", icon: FiPhone, action: "Continue with Airtel Money" },
];

const COMPARISON_ROWS = [
  ["Business profile", "Included", "Included", "Included"],
  ["Number of services", "5", "20", "Unlimited"],
  ["Images", "8 images / 80MB total", "30 images / 300MB total", "Unlimited / 1000MB total"],
  ["Search visibility", "Basic", "Priority visibility", "Top search, map, and category ranking"],
  ["Promotions", "Not included", "Promotional display tools", "Advanced promotional tools"],
  ["Analytics", "Basic reports", "Basic analytics", "Advanced analytics dashboard"],
  ["Smart Match eligibility", "Not included", "Included", "Included"],
  ["Provider Coach", "Not included", "Not included", "Unlimited"],
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

  const plans = useMemo(() => PLANS, []);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.tier === selectedTier) || plans[0],
    [plans, selectedTier]
  );
  const selectedIsFree = selectedPlan?.tier === "FREE";
  const selectedPaidComingSoon = !selectedIsFree && !PAYMENTS_ENABLED;
  const selectedPaymentMethod = PAYMENT_METHODS.find((method) => method.id === selectedMethod);
  const currentTier = normalizePlanTier(subscription?.tier, "FREE");
  const currentTierLabel = formatPlanName(currentTier, "Free Provider");
  const visibleMessage = localMessage || message || "";
  const planAmount = getPlanAmount(selectedPlan, billingCycle);

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
    // Payments may be off, but the promo path stays open. Advance to the payment
    // step so the user can still enter and apply a promo code.
    setStep("payment");
    setStatus("");
    setLocalMessage(PAYMENTS_ENABLED ? "" : "Online payments are Coming Soon. A 100% promo code unlocks this plan now; partial promos show the remaining balance.");
  };

  const validatePayment = () => {
    if (!currentUser?.username) return "Your session has expired. Please log in again.";
    // While payments are off, only the promo path is available.
    if (!PAYMENTS_ENABLED) {
      return promoCode.trim()
        ? ""
        : "Enter a promo code to continue while online payments are Coming Soon.";
    }
    if (promoCode.trim() && !selectedMethod) return "";
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
      setLocalMessage("Admin preview completed. No live payment was made.");
      return;
    }

    try {
      setStatus("processing");
      setLocalMessage(PAYMENTS_ENABLED ? "Processing payment..." : "Validating promo code...");
      const ok = await onUpgrade?.({
        tier: selectedTier,
        method: selectedMethod,
        provider: selectedMethod,
        phoneNumber: phoneNumber.trim(),
        billingCycle,
        promoCode: promoCode.trim(),
      });
      if (ok) {
        if (PAYMENTS_ENABLED) {
          setStatus("pending");
          setLocalMessage("Plan selected. Mobile money confirmation is required to activate your business.");
        } else {
          // Promo path: let the parent's activation / partial-promo message show.
          setStatus("");
          setLocalMessage("");
        }
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
    if (!PAYMENTS_ENABLED) {
      setStatus("");
      setLocalMessage(PAYMENTS_COMING_SOON_MESSAGE);
      return;
    }
    setStatus("success");
    setLocalMessage("Admin preview completed. No live payment was made.");
  };

  const verifyPayment = async () => {
    if (!PAYMENTS_ENABLED) {
      setStatus("");
      setLocalMessage(PAYMENTS_COMING_SOON_MESSAGE);
      return;
    }
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
            <h1 id="trial-upgrade-title">Upgrade your stand</h1>
            {isAdmin ? <span>Admin preview mode</span> : null}
          </div>
          <button type="button" className="trial-close-icon-btn-v14" onClick={onClose} aria-label="Close upgrade">
            <FiX />
          </button>
        </div>

        <section className="trial-upgrade-hero-v12 trial-plan-helper-v16">
          <div className="trial-hero-badge-v12">
            {isAdmin ? <FiEye /> : <FiLock />}
            {isAdmin ? "Admin preview mode" : `Current plan: ${currentTierLabel}`}
          </div>
          <p>Start free, unlock more visibility when ready.</p>
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
          {plans.map((plan) => (
            <article
              className={`trial-plan-card-v12 ${selectedTier === plan.tier ? "selected" : ""}`}
              key={plan.tier}
            >
              <button type="button" className="trial-plan-select-v13" onClick={() => selectPlan(plan.tier)}>
                <span className="trial-plan-top-v12">
                  <span>{plan.name}</span>
                  {plan.tier !== "FREE" && !PAYMENTS_ENABLED ? <em>Promo unlock</em> : plan.badge ? <em>{plan.badge}</em> : null}
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
                {selectedTier === plan.tier ? "Selected" : plan.tier === "FREE" ? "Start now" : "Unlock with promo code"}
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
                {selectedIsFree ? "Continue with Free" : PAYMENTS_ENABLED ? "Continue" : "Apply promo code"} <FiArrowRight />
              </button>
              {selectedPaidComingSoon ? (
                <p className="trial-message-v12">Unlock {selectedPlan.name} with a 100% promo code while online payments are Coming Soon. Partial promos show the remaining balance.</p>
              ) : null}
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
              <small>{billingCycle === "annual" ? "Annual billing" : "Monthly billing"}</small>
              {isAdmin ? <em>Admin preview mode</em> : null}
            </div>

            <div className="trial-method-grid-v13" aria-label="Payment methods">
              {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  className={`${selectedMethod === id ? "selected" : ""} ${PAYMENTS_ENABLED ? "" : "is-disabled"}`.trim()}
                  onClick={() => {
                    if (!PAYMENTS_ENABLED) return;
                    setSelectedMethod(id);
                    setLocalMessage("");
                    setStatus("");
                  }}
                  disabled={!PAYMENTS_ENABLED}
                  aria-disabled={!PAYMENTS_ENABLED}
                >
                  <Icon />
                  <span>{PAYMENTS_ENABLED ? label : `${label} — Coming Soon`}</span>
                </button>
              ))}
            </div>

            <div className="trial-payment-form-v13">
              {PAYMENTS_ENABLED ? (
                <label>
                  Phone number
                  <input inputMode="tel" placeholder="256700000000" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
                </label>
              ) : null}
              <label>
                Promo code
                <span className="trial-promo-row-v16">
                  <input
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(event) => {
                      setPromoCode(event.target.value);
                      setStatus("");
                      setLocalMessage("");
                    }}
                  />
                  <button
                    type="button"
                    onClick={submitPayment}
                    disabled={!promoCode.trim() || loading || status === "processing"}
                  >
                    Apply
                  </button>
                </span>
              </label>
              {!PAYMENTS_ENABLED ? (
                <p className="trial-message-v12">Have a promo code? Apply it here. A 100% promo unlocks {selectedPlan.name} now; partial promos show the remaining balance while online payments are Coming Soon.</p>
              ) : null}
              {PAYMENTS_ENABLED ? (
                <div className="trial-readonly-row-v13">
                  <span>Network</span>
                  <strong>{selectedPaymentMethod?.label || "Choose a network"}</strong>
                </div>
              ) : null}
            </div>

            <div className="trial-readonly-row-v13">
              <span>Original amount</span>
              <strong>{formatMoney(planAmount)}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>Discount</span>
              <strong>{promoCode.trim() ? "Validated by backend" : "Enter a promo code"}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>Final amount</span>
              <strong>{promoCode.trim() ? "Shown after validation" : formatMoney(planAmount)}</strong>
            </div>
            <div className="trial-readonly-row-v13">
              <span>Activation</span>
              <strong>
                {!PAYMENTS_ENABLED
                  ? "100% promo activates now. Partial promo waits for payments."
                  : "Paid plan activates after payment confirmation."}
              </strong>
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
                {status === "processing" || loading
                  ? "Processing request..."
                  : !PAYMENTS_ENABLED
                  ? "Apply promo code"
                  : selectedPaymentMethod?.action || "Choose Payment Method"}
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
                <strong>Plan access updated. No live online payment is shown unless payments are enabled.</strong>
              </div>
            ) : null}
          </section>
        )}

        <div className="trial-footer-note-v12">
          <FiShield />
          <span>
            {isAdmin
              ? "Admin users can preview all subscription and payment screens without being blocked."
              : PAYMENTS_ENABLED
              ? "Free starts without payment. Paid features activate after payment is confirmed."
              : "Free starts without payment. Premium and Platinum payments are coming soon."}
          </span>
        </div>
      </div>
    </div>
  );
}
