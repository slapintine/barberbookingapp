import { useMemo, useState } from "react";
import { FiAlertCircle, FiCheck, FiCheckCircle, FiLoader, FiRefreshCw, FiSmartphone, FiX } from "react-icons/fi";
import "./PaymentFlowModal.css";

const MIN_DEFAULT_AMOUNT = 1000;
const MAX_DEFAULT_AMOUNT = 5000000;

const PAYMENT_METHODS = [
  {
    id: "mtn_mobile_money",
    label: "MTN Mobile Money",
    detail: "Pay securely from your MTN MoMo phone.",
    icon: FiSmartphone,
  },
  {
    id: "airtel_money",
    label: "Airtel Money",
    detail: "Pay securely from your Airtel Money phone.",
    icon: FiSmartphone,
  },
];

function cleanPhone(value) {
  return String(value || "").replace(/[\s-]/g, "").trim();
}

export function isValidUgandaPhoneNumber(value) {
  return /^(\+?256|0)?[37]\d{8}$/.test(cleanPhone(value));
}

export function normalizeUgandaPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return "";
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
  onClose,
  onSubmit,
  onVerify,
}) {
  const formKey = `${show ? "open" : "closed"}|${amount || 10000}|${defaultPhone || ""}`;
  const [selectedMethodEntry, setSelectedMethodEntry] = useState({ key: "", value: "" });
  const [amountValueEntry, setAmountValueEntry] = useState({ key: "", value: "" });
  const [phoneNumberEntry, setPhoneNumberEntry] = useState({ key: "", value: "" });
  const [promoCodeEntry, setPromoCodeEntry] = useState({ key: "", value: "" });
  const [errorsEntry, setErrorsEntry] = useState({ key: "", value: {} });
  const selectedMethod = selectedMethodEntry.key === formKey ? selectedMethodEntry.value : "";
  const amountValue = amountValueEntry.key === formKey ? amountValueEntry.value : String(amount || 10000);
  const phoneNumber = phoneNumberEntry.key === formKey ? phoneNumberEntry.value : defaultPhone || "";
  const promoCode = promoCodeEntry.key === formKey ? promoCodeEntry.value : "";
  const errors = errorsEntry.key === formKey ? errorsEntry.value : {};
  const setSelectedMethod = (value) => setSelectedMethodEntry({ key: formKey, value });
  const setAmountValue = (value) => setAmountValueEntry({ key: formKey, value });
  const setPhoneNumber = (value) => setPhoneNumberEntry({ key: formKey, value });
  const setPromoCode = (value) => setPromoCodeEntry({ key: formKey, value });
  const setErrors = (updater) => {
    setErrorsEntry((prev) => {
      const current = prev.key === formKey ? prev.value : {};
      return {
        key: formKey,
        value: typeof updater === "function" ? updater(current) : updater,
      };
    });
  };

  const numericAmount = useMemo(() => Number(amountValue), [amountValue]);
  const methodReady = selectedMethod ? selectedMethod === "mtn_mobile_money" ? mtnReady : airtelReady : false;
  const selectedMethodLabel = PAYMENT_METHODS.find((item) => item.id === selectedMethod)?.label || "Mobile money";
  const statusKind = getStatusKind(pendingPayment?.status);
  const canVerify = Boolean(pendingPayment?.reference) && typeof onVerify === "function";

  const validate = () => {
    const nextErrors = {};
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      nextErrors.amount = "Enter a valid amount.";
    } else if (numericAmount < minAmount) {
      nextErrors.amount = `Minimum amount is ${money(minAmount)}.`;
    } else if (numericAmount > maxAmount) {
      nextErrors.amount = `Maximum amount is ${money(maxAmount)}.`;
    }

    const promoOnlyAttempt = allowPromoOnly && promoEnabled && promoCode.trim() && !selectedMethod;

    if (!selectedMethod && !promoOnlyAttempt) {
      nextErrors.method = "Choose MTN Mobile Money or Airtel Money before paying.";
    } else if (selectedMethod && !methodReady) {
      nextErrors.method =
        selectedMethod === "mtn_mobile_money"
          ? mtnReadinessMessage || "MTN Mobile Money is not available right now."
          : airtelReadinessMessage || "Airtel Money is not available right now.";
    }

    if (!promoOnlyAttempt) {
      if (!phoneNumber.trim()) nextErrors.phoneNumber = "Enter your mobile money number.";
      else if (!isValidUgandaPhoneNumber(phoneNumber)) nextErrors.phoneNumber = "Use a valid Uganda number, for example 0772123456.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    await onSubmit?.({
      amount: numericAmount,
      method: selectedMethod,
      provider: selectedMethod,
      phoneNumber: normalizeUgandaPhoneNumber(phoneNumber),
      promoCode: promoCode.trim(),
    });
  };

  if (!show) return null;

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
              {message || "Payment request started. Confirm the prompt on your phone, then check status."}
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
            const ready = id === "mtn_mobile_money" ? mtnReady : airtelReady;
            const disabled = !ready || loading || Boolean(pendingPayment?.reference);
            return (
              <button
                type="button"
                key={id}
                className={selectedMethod === id ? "active" : ""}
                onClick={() => {
                  setSelectedMethod(id);
                  setErrors((prev) => ({ ...prev, method: "" }));
                }}
                disabled={disabled}
              >
                <Icon />
                <span>
                  <strong>{label}</strong>
                  <small>{ready ? detail : id === "mtn_mobile_money" ? mtnReadinessMessage || "Unavailable" : airtelReadinessMessage || "Unavailable"}</small>
                </span>
                {selectedMethod === id ? <FiCheck /> : null}
              </button>
            );
          })}
        </div>
        {errors.method ? <div className="payment-flow-field-error-v1">{errors.method}</div> : null}

        <label className="payment-flow-field-v1">
          <span>{selectedMethodLabel} number</span>
          <input
            type="tel"
            value={phoneNumber}
            placeholder="0772123456"
            inputMode="tel"
            autoComplete="tel"
            onChange={(event) => {
              setPhoneNumber(event.target.value);
              setErrors((prev) => ({ ...prev, phoneNumber: "" }));
            }}
            disabled={loading || Boolean(pendingPayment?.reference)}
          />
          <small>{errors.phoneNumber || "Enter the phone number registered for mobile money."}</small>
        </label>

        {promoEnabled ? (
          <label className="payment-flow-field-v1">
            <span>{promoLabel}</span>
            <input
              type="text"
              value={promoCode}
              placeholder="Enter promo code"
              autoComplete="off"
              onChange={(event) => setPromoCode(event.target.value)}
              disabled={loading || Boolean(pendingPayment?.reference)}
            />
            <small>{allowPromoOnly ? "Optional. A full promo can unlock without mobile money." : "Optional. Discounts are validated before payment is created."}</small>
          </label>
        ) : null}

        <footer className="payment-flow-actions-v1">
          {pendingPayment?.reference ? (
            <button type="button" className="payment-flow-primary-v1" onClick={() => onVerify?.(pendingPayment.reference)} disabled={!canVerify || loading}>
              {loading ? <FiLoader className="payment-flow-spin-v1" /> : <FiRefreshCw />}
              {loading ? "Checking..." : "Check payment status"}
            </button>
          ) : (
            <button type="button" className="payment-flow-primary-v1" onClick={submit} disabled={loading}>
              {loading ? <FiLoader className="payment-flow-spin-v1" /> : <FiCheckCircle />}
              {loading ? "Processing..." : submitLabel}
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
