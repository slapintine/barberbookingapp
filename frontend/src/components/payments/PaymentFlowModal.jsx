import { useMemo, useState } from "react";
import { FiAlertCircle, FiCheck, FiCheckCircle, FiClock, FiLoader, FiRefreshCw, FiSmartphone, FiX } from "react-icons/fi";
import { PAYMENTS_ENABLED, PAYMENTS_COMING_SOON_MESSAGE } from "../../utils/launchFlags.js";
import {
  getUgMobileProvider,
  maskUgandaPhone,
  toE164Uganda,
  toUgLocalDigits,
  validateUgMobileForProvider,
} from "../../utils/ugandaPhone.js";
import "./PaymentFlowModal.css";

const MIN_DEFAULT_AMOUNT = 1000;
const MAX_DEFAULT_AMOUNT = 5000000;

const PAYMENT_METHODS = [
  {
    id: "mtn_mobile_money",
    label: "MTN Mobile Money",
    detail: "Pay securely with MTN Mobile Money.",
    icon: FiSmartphone,
  },
  {
    id: "airtel_money",
    label: "Airtel Money",
    detail: "Pay securely from your Airtel Money phone.",
    icon: FiSmartphone,
  },
];

// Re-exported for callers/tests that historically imported these from here.
export { toE164Uganda as normalizeUgandaPhoneNumber };
export function isValidUgandaPhoneNumber(value) {
  return Boolean(toE164Uganda(value));
}

function money(value) {
  return `UGX ${Number(value || 0).toLocaleString("en-UG")}`;
}

function getStatusKind(status) {
  const normalized = String(status || "").toLowerCase();
  if (["successful", "success", "completed", "paid"].includes(normalized)) return "success";
  if (["failed", "cancelled", "canceled", "expired", "error"].includes(normalized)) return "failed";
  if (["unknown", "unreachable", "warning"].includes(normalized)) return "warning";
  if (["pending", "processing", "initiated"].includes(normalized)) return "pending";
  return "idle";
}

export default function PaymentFlowModal({
  show = false,
  title = "Payment",
  subtitle = "Choose how you want to pay.",
  amountLabel = "Amount",
  amount = 10000,
  amountEditable = false,
  minAmount = MIN_DEFAULT_AMOUNT,
  maxAmount = MAX_DEFAULT_AMOUNT,
  defaultPhone = "",
  loading = false,
  message = "",
  pendingPayment = null,
  mtnReady = true,
  mtnReadinessMessage = "",
  airtelReady = false,
  airtelReadinessMessage = "",
  submitLabel = "Confirm payment",
  promoEnabled = false,
  promoLabel = "Promo code",
  allowPromoOnly = false,
  comingSoon = !PAYMENTS_ENABLED,
  onClose,
  onSubmit,
  onVerify,
}) {
  const formKey = `${show ? "open" : "closed"}|${amount || 10000}|${defaultPhone || ""}`;
  const [selectedMethodEntry, setSelectedMethodEntry] = useState({ key: "", value: "" });
  const [amountValueEntry, setAmountValueEntry] = useState({ key: "", value: "" });
  // Phone is stored as the 9 local digits only — the +256 prefix is fixed in the UI.
  const [localDigitsEntry, setLocalDigitsEntry] = useState({ key: "", value: "" });
  const [promoCodeEntry, setPromoCodeEntry] = useState({ key: "", value: "" });
  const [errorsEntry, setErrorsEntry] = useState({ key: "", value: {} });

  const selectedMethod = selectedMethodEntry.key === formKey ? selectedMethodEntry.value : "";
  const amountValue = amountValueEntry.key === formKey ? amountValueEntry.value : String(amount || 10000);
  const localDigits = localDigitsEntry.key === formKey ? localDigitsEntry.value : toUgLocalDigits(defaultPhone || "");
  const promoCode = promoCodeEntry.key === formKey ? promoCodeEntry.value : "";
  const errors = errorsEntry.key === formKey ? errorsEntry.value : {};

  const setSelectedMethod = (value) => setSelectedMethodEntry({ key: formKey, value });
  const setAmountValue = (value) => setAmountValueEntry({ key: formKey, value });
  const setLocalDigits = (value) => setLocalDigitsEntry({ key: formKey, value });
  const setPromoCode = (value) => setPromoCodeEntry({ key: formKey, value });
  const setErrors = (updater) => {
    setErrorsEntry((prev) => {
      const current = prev.key === formKey ? prev.value : {};
      return { key: formKey, value: typeof updater === "function" ? updater(current) : updater };
    });
  };

  const numericAmount = useMemo(() => Number(amountValue), [amountValue]);
  const selectedMethodLabel = PAYMENT_METHODS.find((item) => item.id === selectedMethod)?.label || "Mobile money";
  const statusKind = getStatusKind(pendingPayment?.status);
  const canVerify = Boolean(pendingPayment?.reference) && typeof onVerify === "function";
  const detectedProvider = getUgMobileProvider(localDigits);

  // Promo-only path: a full-discount promo can unlock without entering a number.
  const promoOnlyAttempt = allowPromoOnly && promoEnabled && promoCode.trim() && !selectedMethod;

  const isMethodReady = (id) => (id === "mtn_mobile_money" ? mtnReady : airtelReady);

  const handlePhoneChange = (raw) => {
    setLocalDigits(toUgLocalDigits(raw));
    setErrors((prev) => ({ ...prev, phoneNumber: "" }));
  };

  const handleSelectMethod = (id) => {
    if (!isMethodReady(id)) {
      // Don't select an unavailable method; explain why instead.
      setErrors((prev) => ({
        ...prev,
        method:
          id === "airtel_money"
            ? "Airtel Money is not available yet. Please use MTN Mobile Money."
            : mtnReadinessMessage || "This payment method is not available right now.",
      }));
      return;
    }
    setSelectedMethod(id);
    setErrors((prev) => ({ ...prev, method: "", phoneNumber: "" }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      nextErrors.amount = "Enter a valid amount.";
    } else if (numericAmount < minAmount) {
      nextErrors.amount = `Minimum amount is ${money(minAmount)}.`;
    } else if (numericAmount > maxAmount) {
      nextErrors.amount = `Maximum amount is ${money(maxAmount)}.`;
    }

    if (!promoOnlyAttempt) {
      if (!selectedMethod) {
        nextErrors.method = "Choose MTN Mobile Money to continue.";
      } else if (!isMethodReady(selectedMethod)) {
        nextErrors.method =
          selectedMethod === "mtn_mobile_money"
            ? mtnReadinessMessage || "MTN Mobile Money is not available right now."
            : "Airtel Money is not available yet. Please use MTN Mobile Money.";
      }

      const phoneCheck = validateUgMobileForProvider(localDigits, selectedMethod);
      if (!phoneCheck.valid) {
        nextErrors.phoneNumber = phoneCheck.error;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async () => {
    if (loading) return;
    if (!validate()) return;
    await onSubmit?.({
      amount: numericAmount,
      method: selectedMethod,
      provider: selectedMethod,
      phoneNumber: toE164Uganda(localDigits),
      promoCode: promoCode.trim(),
    });
  };

  // Primary CTA label reflects the real state of the flow.
  const primaryLabel = (() => {
    if (loading) {
      if (pendingPayment?.reference) return "Waiting for payment confirmation...";
      return "Starting payment...";
    }
    if (pendingPayment?.reference) {
      return statusKind === "failed" ? "Try Again" : "Check payment status";
    }
    if (promoOnlyAttempt) return "Apply promo code";
    return submitLabel;
  })();

  if (!show) return null;

  if (comingSoon) {
    // Live payments are off, but the promo path stays fully usable. We disable the
    // payment methods + Pay Now (Coming Soon) yet keep the promo input live so a
    // full/free promo can still unlock the plan. A promo entered with no method is
    // a promo-only attempt; the backend activates a full promo and never starts a
    // live collection (it requires an explicit method + phone for any balance).
    const canSubmitPromo = promoEnabled && promoCode.trim().length > 0;
    // Promo-only submit: no payment method while payments are off. The backend
    // activates a full promo or rejects a partial one without a live collection.
    const submitPromoOnly = async () => {
      if (loading || !canSubmitPromo) return;
      await onSubmit?.({
        amount: numericAmount,
        method: "",
        provider: "promo",
        phoneNumber: "",
        promoCode: promoCode.trim(),
      });
    };
    return (
      <div className="payment-flow-shell-v1" role="presentation" onClick={onClose}>
        <section
          className="payment-flow-panel-v1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-flow-title"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="payment-flow-close-v1" aria-label="Close payment" onClick={onClose}>
            <FiX />
          </button>

          <header className="payment-flow-header-v1">
            <span className="payment-flow-mark-v1" aria-hidden="true">
              <FiSmartphone />
            </span>
            <div>
              <strong id="payment-flow-title">{title}</strong>
              <p>{subtitle}</p>
            </div>
          </header>

          {message ? (
            <div className="payment-flow-alert-v1 warning">
              <FiAlertCircle />
              <span>{message}</span>
            </div>
          ) : null}

          <div className="payment-flow-summary-v1">
            <span>{amountLabel}</span>
            <strong>{money(numericAmount)}</strong>
          </div>

          <div className="payment-flow-methods-v1" aria-label="Payment methods">
            {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} className="is-disabled" disabled aria-disabled="true">
                <Icon />
                <span>
                  <strong>{label}</strong>
                  <small>Coming Soon</small>
                </span>
                <em className="payment-flow-soon-v1"><FiClock /> Soon</em>
              </button>
            ))}
          </div>
          <p className="payment-flow-note-v1">
            <FiClock aria-hidden="true" />
            {PAYMENTS_COMING_SOON_MESSAGE}
          </p>

          {promoEnabled ? (
            <label className="payment-flow-field-v1">
              <span>{promoLabel}</span>
              <input
                type="text"
                value={promoCode}
                placeholder="Enter promo code"
                autoComplete="off"
                onChange={(event) => setPromoCode(event.target.value)}
                disabled={loading}
              />
              <small>Have a promo code? Apply it here. Promo codes are active while online payments are being prepared — your code can unlock access if it covers this plan.</small>
            </label>
          ) : null}

          <footer className="payment-flow-actions-v1">
            {promoEnabled ? (
              <button
                type="button"
                className={`payment-flow-primary-v1${canSubmitPromo ? "" : " is-disabled"}`}
                onClick={submitPromoOnly}
                disabled={loading || !canSubmitPromo}
              >
                {loading ? <FiLoader className="payment-flow-spin-v1" /> : <FiCheckCircle />}
                {loading ? "Applying promo..." : "Apply promo code"}
              </button>
            ) : (
              <button type="button" className="payment-flow-primary-v1 is-disabled" disabled>
                <FiClock />
                Payments Coming Soon
              </button>
            )}
            <button type="button" className="payment-flow-secondary-v1" onClick={onClose}>
              Continue for now
            </button>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="payment-flow-shell-v1" role="presentation" onClick={onClose}>
      <section
        className="payment-flow-panel-v1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-flow-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="payment-flow-close-v1" aria-label="Close payment" onClick={onClose}>
          <FiX />
        </button>

        <header className="payment-flow-header-v1">
          <span className="payment-flow-mark-v1" aria-hidden="true">
            <FiSmartphone />
          </span>
          <div>
            <strong id="payment-flow-title">{title}</strong>
            <p>{subtitle}</p>
          </div>
        </header>

        {pendingPayment?.reference ? (
          <div className={`payment-flow-alert-v1 ${statusKind || "pending"}`}>
            {statusKind === "success" ? <FiCheckCircle /> : statusKind === "pending" ? <FiLoader /> : <FiAlertCircle />}
            <span>
              {message || "Check your phone to approve the payment, then confirm the status here."}
              <small>Reference: {pendingPayment.reference}</small>
            </span>
          </div>
        ) : message ? (
          <div className="payment-flow-alert-v1 warning">
            <FiAlertCircle />
            <span>{message}</span>
          </div>
        ) : null}

        <div className="payment-flow-summary-v1">
          <span>{amountLabel}</span>
          {amountEditable ? (
            <label>
              <em>UGX</em>
              <input
                type="number"
                min={minAmount}
                max={maxAmount}
                value={amountValue}
                onChange={(event) => {
                  setAmountValue(event.target.value);
                  setErrors((prev) => ({ ...prev, amount: "" }));
                }}
                disabled={loading || Boolean(pendingPayment?.reference)}
              />
            </label>
          ) : (
            <strong>{money(numericAmount)}</strong>
          )}
          {errors.amount ? <small>{errors.amount}</small> : null}
        </div>

        <div className="payment-flow-methods-v1" aria-label="Payment methods">
          {PAYMENT_METHODS.map(({ id, label, detail, icon: Icon }) => {
            const ready = isMethodReady(id);
            const active = selectedMethod === id;
            const comingSoon = id === "airtel_money" && !ready;
            return (
              <button
                type="button"
                key={id}
                className={`${active ? "active" : ""} ${ready ? "" : "is-disabled"}`.trim()}
                onClick={() => handleSelectMethod(id)}
                disabled={loading || Boolean(pendingPayment?.reference)}
                aria-pressed={active}
              >
                <Icon />
                <span>
                  <strong>{label}</strong>
                  <small>
                    {comingSoon
                      ? "Airtel Money coming soon"
                      : ready
                      ? detail
                      : id === "mtn_mobile_money"
                      ? mtnReadinessMessage || "Unavailable"
                      : airtelReadinessMessage || "Unavailable"}
                  </small>
                </span>
                {comingSoon ? (
                  <em className="payment-flow-soon-v1"><FiClock /> Soon</em>
                ) : active ? (
                  <FiCheck />
                ) : null}
              </button>
            );
          })}
        </div>
        {errors.method ? <div className="payment-flow-field-error-v1">{errors.method}</div> : null}

        {!pendingPayment?.reference ? (
          <label className="payment-flow-field-v1">
            <span>{selectedMethodLabel} number</span>
            <div className={`payment-flow-phone-v1${errors.phoneNumber ? " has-error" : ""}`}>
              <span className="payment-flow-phone-cc-v1" aria-hidden="true">+256</span>
              <input
                type="tel"
                value={localDigits}
                placeholder="712345678"
                inputMode="numeric"
                autoComplete="tel-national"
                aria-label="Mobile money number, 9 digits after +256"
                maxLength={9}
                onChange={(event) => handlePhoneChange(event.target.value)}
                onPaste={(event) => {
                  event.preventDefault();
                  handlePhoneChange(event.clipboardData.getData("text"));
                }}
                disabled={loading}
              />
            </div>
            <small className={errors.phoneNumber ? "is-error" : "is-hint"}>
              {errors.phoneNumber
                ? errors.phoneNumber
                : detectedProvider && localDigits.length === 9
                ? `Detected: ${detectedProvider === "mtn_mobile_money" ? "MTN" : "Airtel"} · ${maskUgandaPhone(localDigits)}`
                : "Enter the 9 digits after +256, e.g. 712345678."}
            </small>
          </label>
        ) : null}

        {promoEnabled && !pendingPayment?.reference ? (
          <label className="payment-flow-field-v1">
            <span>{promoLabel}</span>
            <input
              type="text"
              value={promoCode}
              placeholder="Enter promo code"
              autoComplete="off"
              onChange={(event) => setPromoCode(event.target.value)}
              disabled={loading}
            />
            <small>{allowPromoOnly ? "Optional. A full promo can unlock Premium without mobile money." : "Optional. Discounts are validated before payment is created."}</small>
          </label>
        ) : null}

        {!pendingPayment?.reference && !promoOnlyAttempt ? (
          <p className="payment-flow-note-v1">
            <FiSmartphone aria-hidden="true" />
            You will receive a mobile money prompt on your phone. Enter your PIN to approve the payment.
          </p>
        ) : null}

        <footer className="payment-flow-actions-v1">
          {pendingPayment?.reference ? (
            <button type="button" className="payment-flow-primary-v1" onClick={() => onVerify?.(pendingPayment.reference)} disabled={!canVerify || loading}>
              {loading ? <FiLoader className="payment-flow-spin-v1" /> : <FiRefreshCw />}
              {primaryLabel}
            </button>
          ) : (
            <button type="button" className="payment-flow-primary-v1" onClick={submit} disabled={loading}>
              {loading ? <FiLoader className="payment-flow-spin-v1" /> : <FiCheckCircle />}
              {primaryLabel}
            </button>
          )}
          <button type="button" className="payment-flow-secondary-v1" onClick={onClose} disabled={loading}>
            Continue later
          </button>
        </footer>
      </section>
    </div>
  );
}
