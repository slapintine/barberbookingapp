import { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiBookOpen, FiCheck, FiClock, FiCreditCard, FiDollarSign, FiLock, FiMapPin, FiNavigation, FiSearch, FiStar, FiX, FiZap } from "react-icons/fi";
import { findSmartMatches } from "../../api/smartMatchApi.js";
import { reverseGeocodeCoordinates } from "../../utils/locationUtils.js";
import { isCustomerPremiumActive } from "../../utils/customerPremium.js";
import "./SmartMatchModal.css";

const CATEGORIES = [
  { label: "Barber", value: "Beauty & Grooming" },
  { label: "Salon", value: "Beauty & Grooming" },
  { label: "Spa", value: "Beauty & Grooming" },
  { label: "Plumbing", value: "Home Services" },
  { label: "Carpentry", value: "Repairs & Maintenance" },
  { label: "Cleaning", value: "Cleaning Services" },
  { label: "Repairs", value: "Repairs & Maintenance" },
  { label: "Tutor", value: "Tutor / Lessons", icon: FiBookOpen },
  { label: "Other", value: "All" },
];

const PREFERENCES = [
  { label: "Best match", value: "best_match" },
  { label: "Affordable", value: "affordable" },
  { label: "Best rated", value: "best_rated" },
];

function todayValue(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function money(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `UGX ${amount.toLocaleString("en-UG")}` : "Price on consultation";
}

export default function SmartMatchModal({
  show,
  initial = {},
  providers = [],
  locationLabel = "",
  customerSubscription,
  customerSubscriptionLoading = false,
  customerSubscriptionMessage = "",
  pendingCustomerSubscriptionPayment,
  onClose,
  onOpenProvider,
  onUpgradePremium,
  onVerifyPremium,
  onContinueManualSearch,
}) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState(initial.category || "");
  const [manualLocation, setManualLocation] = useState(locationLabel || "");
  const [location, setLocation] = useState({ label: locationLabel || "", lat: "", lng: "" });
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [preference, setPreference] = useState("best_match");
  const [dateMode, setDateMode] = useState("today");
  const [date, setDate] = useState(todayValue());
  const [time, setTime] = useState("");
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!show) return;
    const initialLocation = typeof initial.location === "string" ? initial.location : initial.location?.label || "";
    const nextLocationLabel = initialLocation || locationLabel || "";
    setStep(0);
    setCategory(initial.category || "");
    setManualLocation(nextLocationLabel);
    setLocation({
      label: nextLocationLabel,
      lat: typeof initial.location === "object" ? initial.location.lat || "" : "",
      lng: typeof initial.location === "object" ? initial.location.lng || "" : "",
    });
    setResult(null);
    setError("");
  }, [show, initial.category, initial.location, locationLabel]);

  const localProviderById = useMemo(() => {
    return new Map((providers || []).map((provider) => [String(provider.id), provider]));
  }, [providers]);
  const premiumActive = isCustomerPremiumActive(customerSubscription);

  if (!show) return null;

  if (!premiumActive) {
    return (
      <>
        <div className="smart-match-backdrop-v1" onClick={onClose} />
        <section className="smart-match-modal-v1 smart-match-lock-v1" role="dialog" aria-modal="true" aria-label="Smart Match Premium">
          <div className="smart-match-handle-v1" />
          <header className="smart-match-head-v1 smart-match-lock-head-v1">
            <div>
              <strong>Smart Match</strong>
              <span>Find the best provider faster with Queless Premium.</span>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"><FiX /></button>
          </header>
          <div className="smart-match-lock-body-v1">
            <div className="smart-match-lock-icon-v1"><FiLock /></div>
            <h2>Smart Match</h2>
            <p>Find the best provider faster with Queless Premium.</p>
            {pendingCustomerSubscriptionPayment?.reference ? (
              <div className="smart-match-pending-v1">
                <strong>Payment pending</strong>
                <span>Reference {pendingCustomerSubscriptionPayment.reference}</span>
              </div>
            ) : null}
            <div className="smart-match-lock-list-v1">
              {["Location", "Budget", "Rating", "Availability", "Payment options", "Service need"].map((item) => (
                <span key={item}><FiCheck /> {item}</span>
              ))}
            </div>
            <div className="smart-match-price-v1">
              <FiCreditCard />
              <span>Premium: UGX 10,000/month</span>
            </div>
            {customerSubscriptionMessage ? <div className="smart-match-error-v1 inline">{customerSubscriptionMessage}</div> : null}
          </div>
          <footer className="smart-match-footer-v1 smart-match-lock-actions-v1">
            {pendingCustomerSubscriptionPayment?.reference ? (
              <button type="button" className="primary-btn-v4" onClick={() => onVerifyPremium?.(pendingCustomerSubscriptionPayment.reference)} disabled={customerSubscriptionLoading}>
                {customerSubscriptionLoading ? "Checking payment..." : "Verify Premium payment"}
              </button>
            ) : (
              <button type="button" className="primary-btn-v4" onClick={onUpgradePremium} disabled={customerSubscriptionLoading}>
                {customerSubscriptionLoading ? "Loading..." : "Choose Payment Method"}
              </button>
            )}
            <button type="button" className="secondary-btn-v4" onClick={onContinueManualSearch || onClose}>
              Continue with Manual Search
            </button>
          </footer>
        </section>
      </>
    );
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location detection.");
      return;
    }
    setLoadingLocation(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        let label = "";
        try {
          label = await reverseGeocodeCoordinates(coords);
        } catch {
          label = "";
        }
        const readable = label || "Location detected near you";
        setLocation({ label: readable, lat: coords.latitude, lng: coords.longitude });
        setManualLocation(readable);
        setLoadingLocation(false);
      },
      () => {
        setError("Could not get your location. Enter it manually instead.");
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const runMatch = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await findSmartMatches({
        category,
        location: {
          label: location.label || manualLocation,
          lat: location.lat,
          lng: location.lng,
        },
        budgetMin,
        budgetMax,
        date,
        time,
        preference,
      });
      setResult(response);
      setStep(4);
    } catch (err) {
      setError(err.message || "Smart Match could not load right now.");
    } finally {
      setLoading(false);
    }
  };

  const canContinue =
    step === 0 ? Boolean(category) :
    step === 1 ? Boolean(location.label || manualLocation) :
    step === 2 ? preference || budgetMin || budgetMax :
    true;

  const steps = ["Service", "Location", "Budget", "Time", "Matches"];

  return (
    <>
      <div className="smart-match-backdrop-v1" onClick={onClose} />
      <section className="smart-match-modal-v1" role="dialog" aria-modal="true" aria-label="Smart Match">
        <div className="smart-match-handle-v1" />
        <header className="smart-match-head-v1">
          <button type="button" onClick={step > 0 ? () => setStep((value) => value - 1) : onClose} aria-label="Back">
            {step > 0 ? <FiArrowLeft /> : <FiX />}
          </button>
          <div>
            <strong>Smart Match</strong>
            <span>{steps[step]}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><FiX /></button>
        </header>

        <div className="smart-match-progress-v1">
          {steps.map((item, index) => (
            <span key={item} className={index === step ? "active" : index < step ? "done" : ""}>{index < step ? <FiCheck /> : index + 1}</span>
          ))}
        </div>

        {error ? <div className="smart-match-error-v1">{error}</div> : null}

        <div className="smart-match-body-v1">
          {step === 0 ? (
            <div className="smart-match-grid-v1">
              {CATEGORIES.map((item) => {
                const Icon = item.icon || FiZap;
                return (
                  <button type="button" key={item.label} className={category === item.value || category === item.label ? "active" : ""} onClick={() => setCategory(item.value)}>
                    <Icon /> <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="smart-match-stack-v1">
              <button type="button" className="smart-match-location-btn-v1" onClick={useCurrentLocation} disabled={loadingLocation}>
                <FiNavigation /> {loadingLocation ? "Finding location..." : "Use current location"}
              </button>
              <label>
                <span>Enter location manually</span>
                <input
                  value={manualLocation}
                  onChange={(event) => {
                    setManualLocation(event.target.value);
                    setLocation((prev) => ({ ...prev, label: event.target.value }));
                  }}
                  placeholder="Gayaza, Nakwero"
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="smart-match-stack-v1">
              <div className="smart-match-budget-row-v1">
                <label><span>Minimum</span><input value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} inputMode="numeric" placeholder="10000" /></label>
                <label><span>Maximum</span><input value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} inputMode="numeric" placeholder="30000" /></label>
              </div>
              <div className="smart-match-prefs-v1">
                {PREFERENCES.map((item) => (
                  <button type="button" key={item.value} className={preference === item.value ? "active" : ""} onClick={() => setPreference(item.value)}>
                    {item.value === "affordable" ? <FiDollarSign /> : item.value === "best_rated" ? <FiStar /> : <FiZap />}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="smart-match-stack-v1">
              <div className="smart-match-prefs-v1">
                <button type="button" className={dateMode === "now" ? "active" : ""} onClick={() => { setDateMode("now"); setDate(todayValue()); }}>Now</button>
                <button type="button" className={dateMode === "today" ? "active" : ""} onClick={() => { setDateMode("today"); setDate(todayValue()); }}>Today</button>
                <button type="button" className={dateMode === "tomorrow" ? "active" : ""} onClick={() => { setDateMode("tomorrow"); setDate(todayValue(1)); }}>Tomorrow</button>
              </div>
              <div className="smart-match-budget-row-v1">
                <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
                <label><span>Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="smart-match-results-v1">
              <p>{result?.message || "Best matches based on your preferences."}</p>
              {(result?.matches || []).length ? result.matches.map((match) => {
                const provider = localProviderById.get(String(match.businessId)) || match.provider;
                return (
                  <article key={`${match.businessId}-${match.serviceId}`}>
                    <div>
                      <strong>{match.businessName}</strong>
                      <span>{match.serviceName || match.category}</span>
                      <small><FiStar /> {match.rating ? Number(match.rating).toFixed(1) : "New"} - <FiMapPin /> {match.distanceKm ?? "Nearby"} km - <FiClock /> {match.nextAvailableTime}</small>
                      <small>{money(match.priceMin)}{match.priceMax && match.priceMax !== match.priceMin ? ` - ${money(match.priceMax)}` : ""} - {(match.paymentOptions || ["Cash"]).join(", ")}</small>
                    </div>
                    <b>{match.score}%</b>
                    <button type="button" onClick={() => onOpenProvider?.(provider)}>Book</button>
                  </article>
                );
              }) : (
                <div className="smart-match-empty-v1">
                  <FiSearch />
                  <strong>No tutors or providers found near you yet.</strong>
                  <span>Try changing your location, budget, or category and search again.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <footer className="smart-match-footer-v1">
          {step < 3 ? (
            <button type="button" className="primary-btn-v4" onClick={() => setStep((value) => value + 1)} disabled={!canContinue}>
              Continue
            </button>
          ) : step === 3 ? (
            <button type="button" className="primary-btn-v4" onClick={runMatch} disabled={loading}>
              {loading ? "Finding matches..." : "Show best matches"}
            </button>
          ) : (
            <button type="button" className="secondary-btn-v4" onClick={() => setStep(0)}>
              Adjust preferences
            </button>
          )}
        </footer>
      </section>
    </>
  );
}
