import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiCheck, FiCreditCard, FiHelpCircle, FiLock, FiMapPin, FiSearch, FiStar, FiZap } from "react-icons/fi";
import { findSmartMatches } from "../../api/smartMatchApi.js";
import logo from "../../assets/queless-logo-full.png";
import { isCustomerPremiumActive } from "../../utils/customerPremium.js";
import { reverseGeocodeCoordinates } from "../../utils/locationUtils.js";
import {
  AI_REASON_SETS,
  LOCATION_OPTIONS,
  SERVICE_CATEGORIES,
  SMART_MATCH_SESSION_KEY,
  SMART_MATCH_STEPS,
  WHEN_OPTIONS,
} from "./smartMatchConstants.js";
import {
  getCriteriaKey,
  getServiceByKey,
  getWhenByKey,
  initialSmartMatchState,
  normalizeInitialSmartMatch,
  smartMatchSummary,
} from "./smartMatchUtils.js";
import "./SmartMatchPage.css";

function friendlySmartMatchError(error) {
  const status = Number(error?.status || error?.payload?.status || 0);
  if (status === 403) return "Smart Match needs active Customer Premium. Please verify your access and try again.";
  if (status === 0 || status >= 500) return "Smart Match is temporarily unavailable. Please try again in a moment.";
  return "We couldn't load matches right now. Please try again.";
}

function readStoredDraft(initial, fallbackLocation) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SMART_MATCH_SESSION_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      return {
        ...initialSmartMatchState,
        ...parsed,
        selectedService: getServiceByKey(parsed.selectedService?.key || parsed.selectedService) || null,
      };
    }
  } catch {
    sessionStorage.removeItem(SMART_MATCH_SESSION_KEY);
  }
  return normalizeInitialSmartMatch(initial, fallbackLocation);
}

function SmartMatchStepper({ currentStep }) {
  const activeIndex = SMART_MATCH_STEPS.findIndex((item) => item.key === currentStep);
  return (
    <div className="smart-match-stepper" aria-label="Smart Match steps">
      {SMART_MATCH_STEPS.map((item, index) => {
        const stateClass = index < activeIndex ? "is-complete" : index === activeIndex ? "is-active" : "is-future";
        return (
          <div className="smart-match-stepper-item" key={item.key}>
            <span className={`smart-match-step-circle ${stateClass}`}>{index < activeIndex ? <FiCheck /> : index + 1}</span>
            {index < SMART_MATCH_STEPS.length - 1 ? <span className={`smart-match-step-line ${index < activeIndex ? "is-filled" : ""}`} /> : null}
            <small>{item.label}</small>
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ state }) {
  return (
    <div className="smart-match-summary-card">
      <strong>Your selections so far</strong>
      <span>Service: {state.selectedService?.label || "Not selected"}</span>
      <span>When: {getWhenByKey(state.selectedWhen)?.label || "Not selected"}</span>
    </div>
  );
}

function LocationReasonCard({ locationType }) {
  const reasons = AI_REASON_SETS[locationType] || AI_REASON_SETS.use_current_location;
  return (
    <section className="smart-match-reason-card" aria-label="Why this is recommended">
      <div className="smart-match-reason-head">
        <FiZap />
        <strong>Why this is recommended</strong>
      </div>
      <div className="smart-match-reason-grid">
        {reasons.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title}>
              <span className="smart-match-icon-box"><Icon /></span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
              </span>
            </article>
          );
        })}
      </div>
      <p>This helps Smart Match rank the most relevant providers in the final Matches step.</p>
    </section>
  );
}

function LoadingResults() {
  return (
    <div className="smart-match-skeletons" aria-label="Loading matches">
      <span />
      <span />
      <span />
    </div>
  );
}

function buildNoMatchCopy(state = {}) {
  const service = state.selectedService?.label || "this service";
  const serviceLower = service.toLowerCase();
  const nearest = state.nearestProvider || null;
  const nearestName = nearest?.businessName || nearest?.provider?.business_name || "the nearest provider";
  const nearestLocation = state.nearestLocation || nearest?.location || nearest?.provider?.location || "";
  const nearestDistance = Number(state.nearestDistanceKm ?? nearest?.distanceKm);
  const distanceCopy = Number.isFinite(nearestDistance) ? `, about ${nearestDistance.toFixed(1)} km away` : "";

  switch (state.reasonCode) {
    case "LOCATION_MISSING":
      return {
        title: "We need your location to find nearby providers.",
        body: "Enable location access or type your area in the location step.",
      };
    case "NO_SERVICE_PROVIDERS":
      return {
        title: `No ${serviceLower} providers are on Queless yet.`,
        body: "Try a different service category or check back soon.",
      };
    case "NO_NEARBY_PROVIDERS":
      return {
        title: `No ${serviceLower} providers are near you yet.`,
        body: nearest
          ? `The nearest option is ${nearestName}${nearestLocation ? ` in ${nearestLocation}` : ""}${distanceCopy}. Try expanding your search area.`
          : "Try changing your location or continue with manual search.",
      };
    case "NO_TIME_MATCH":
      return {
        title: "Providers are available, but not at that time.",
        body: "Try a different time or check manual search for flexible providers.",
      };
    case "FILTERS_TOO_NARROW":
      return {
        title: "Your filters are a little too specific.",
        body: "Try a broader time window, a different location, or a related service.",
      };
    case "NO_EXACT_MATCH":
      return {
        title: `No exact ${serviceLower} match found yet.`,
        body: nearest
          ? `The closest option is ${nearestName}${nearestLocation ? ` in ${nearestLocation}` : ""}${distanceCopy}.`
          : "Try changing your timing or location.",
      };
    default:
      return {
        title: "No exact matches found yet.",
        body: "Try adjusting your timing or location.",
      };
  }
}

function NoMatchResults({ state, onChangeLocation, onTryAnotherService, onOpenProvider }) {
  const copy = buildNoMatchCopy(state);
  const nearest = state.nearestProvider || null;
  const provider = nearest?.provider || null;
  return (
    <div className="smart-match-no-match-card">
      <span className="smart-match-no-match-icon"><FiSearch /></span>
      <strong>{copy.title}</strong>
      <span>{copy.body}</span>
      <div className="smart-match-no-match-actions">
        {provider ? (
          <button type="button" className="smart-match-primary-button compact" onClick={() => onOpenProvider?.(provider)}>
            View nearest provider
          </button>
        ) : null}
        <button type="button" className="smart-match-secondary-button compact" onClick={onChangeLocation}>
          Change location
        </button>
        <button type="button" className="smart-match-secondary-button compact" onClick={onTryAnotherService}>
          Try another service
        </button>
      </div>
    </div>
  );
}

function MatchProviderCard({ match, provider, onOpenProvider }) {
  const score = Number(match.score || 0);
  const badges = Array.isArray(match.badges) ? match.badges.slice(0, 5) : [];
  const reasons = Array.isArray(match.reasons) ? match.reasons.slice(0, 3) : [];
  const providerImage = match.imageUrl || provider?.image || "";
  return (
    <article className="smart-match-result-card">
      <div className="smart-match-result-media">
        {providerImage ? <img src={providerImage} alt="" loading="lazy" decoding="async" /> : <FiMapPin />}
        <b>{score ? `${score}` : "Fit"}</b>
      </div>
      <div className="smart-match-result-body">
        <div className="smart-match-result-title">
          <strong>{match.businessName || provider?.business_name || "Queless provider"}</strong>
          <span>{match.serviceLabel || match.serviceName || match.category || "Service"}</span>
        </div>
        <div className="smart-match-result-meta">
          <span><FiStar /> {match.rating ? Number(match.rating).toFixed(1) : "New"} ({Number(match.reviewsCount || match.reviews || 0)})</span>
          <span><FiMapPin /> {Number.isFinite(Number(match.distanceKm)) ? `${Number(match.distanceKm).toFixed(1)} km` : "Nearby"}</span>
        </div>
        {match.availabilityLabel ? <div className="smart-match-availability">{match.availabilityLabel}</div> : null}
        <div className="smart-match-badges">
          {badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
        {reasons.length ? (
          <ul>
            {reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        ) : null}
        <button type="button" onClick={() => provider ? onOpenProvider?.(provider) : null} disabled={!provider}>
          View / Book
        </button>
      </div>
    </article>
  );
}

export default function SmartMatchPage({
  initial = {},
  providers = [],
  locationLabel = "",
  customerSubscription,
  customerSubscriptionLoading = false,
  customerSubscriptionMessage = "",
  pendingCustomerSubscriptionPayment,
  onBack,
  onOpenProvider,
  onUpgradePremium,
  onVerifyPremium,
  onContinueManualSearch,
}) {
  const draftKey = `${locationLabel}|${JSON.stringify(initial || {})}`;
  const [stateEntry, setStateEntry] = useState(() => ({ key: draftKey, value: readStoredDraft(initial, locationLabel) }));
  const [locationMessageEntry, setLocationMessageEntry] = useState({ key: "", value: "" });
  const cacheRef = useRef(new Map());
  const premiumActive = isCustomerPremiumActive(customerSubscription);
  const state = stateEntry.key === draftKey ? stateEntry.value : readStoredDraft(initial, locationLabel);
  const locationMessage = locationMessageEntry.key === draftKey ? locationMessageEntry.value : "";
  const setState = (updater) => {
    setStateEntry((prev) => {
      const current = prev.key === draftKey ? prev.value : readStoredDraft(initial, locationLabel);
      return {
        key: draftKey,
        value: typeof updater === "function" ? updater(current) : updater,
      };
    });
  };
  const setLocationMessage = (value) => setLocationMessageEntry({ key: draftKey, value });

  useEffect(() => {
    if (!premiumActive) return;
    const draft = {
      step: state.step === "matches" ? "need" : state.step,
      selectedService: state.selectedService,
      selectedWhen: state.selectedWhen,
      selectedLocationType: state.selectedLocationType,
      selectedAddress: state.selectedAddress,
      userCoordinates: state.userCoordinates,
    };
    sessionStorage.setItem(SMART_MATCH_SESSION_KEY, JSON.stringify(draft));
  }, [premiumActive, state]);

  const localProviderById = useMemo(() => {
    return new Map((providers || []).map((provider) => [String(provider.id), provider]));
  }, [providers]);

  const updateState = (patch) => setState((prev) => ({ ...prev, ...patch, error: patch.error ?? "" }));
  const stepIndex = SMART_MATCH_STEPS.findIndex((item) => item.key === state.step);
  const canContinue =
    state.step === "need" ? Boolean(state.selectedService) :
    state.step === "when" ? Boolean(state.selectedWhen) :
    state.step === "where"
      ? state.selectedLocationType === "use_current_location" || (state.selectedLocationType === "enter_address" && Boolean(state.selectedAddress.trim()))
      : true;

  const goBack = () => {
    if (state.loading) return;
    if (!premiumActive || stepIndex <= 0) {
      onBack?.();
      return;
    }
    updateState({ step: SMART_MATCH_STEPS[stepIndex - 1].key });
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("We could not access your current location. Please enter an address instead.");
      updateState({ selectedLocationType: "enter_address", userCoordinates: null });
      return;
    }
    setLocationMessage("Finding your current location...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        let label = "Using your current location.";
        try {
          const resolved = await reverseGeocodeCoordinates({ latitude: coords.lat, longitude: coords.lng });
          if (resolved) label = resolved;
        } catch {
          label = "Using your current location.";
        }
        setLocationMessage("Using your current location.");
        updateState({ selectedLocationType: "use_current_location", userCoordinates: coords, selectedAddress: label });
      },
      () => {
        setLocationMessage("We could not access your current location. Please enter an address instead.");
        updateState({ selectedLocationType: "enter_address", userCoordinates: null });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const loadMatches = async () => {
    if (!canContinue || state.loading) return;

    // Guard: location step was "use current" but permission was denied
    if (
      state.selectedLocationType === "use_current_location" &&
      !state.userCoordinates
    ) {
      updateState({
        step: "matches",
        matchResults: [],
        reasonCode: "LOCATION_MISSING",
        nearestProvider: null,
        nearestLocation: "",
        nearestDistanceKm: null,
        suggestions: [],
        loading: false,
        error: "",
      });
      return;
    }

    const criteriaKey = getCriteriaKey(state);
    if (!cacheRef.current || typeof cacheRef.current.get !== "function") {
      cacheRef.current = new Map();
    }
    const cached = cacheRef.current.get(criteriaKey);
    if (cached) {
      updateState({ step: "matches", ...cached, error: "" });
      return;
    }
    updateState({
      step: "matches",
      matchResults: [],
      reasonCode: "",
      nearestProvider: null,
      nearestLocation: "",
      nearestDistanceKm: null,
      suggestions: [],
      loading: true,
      error: "",
    });
    try {
      const response = await findSmartMatches({
        serviceKey: state.selectedService.key,
        serviceLabel: state.selectedService.label,
        when: state.selectedWhen,
        locationType: state.selectedLocationType,
        coordinates: state.userCoordinates,
        address: state.selectedLocationType === "enter_address" ? state.selectedAddress : "",
      });
      const matches = Array.isArray(response?.matches) ? response.matches : [];
      const matchPayload = {
        matchResults: matches,
        reasonCode: response?.reasonCode || "",
        nearestProvider: response?.nearestProvider || null,
        nearestLocation: response?.nearestLocation || "",
        nearestDistanceKm: response?.nearestDistanceKm ?? null,
        suggestions: Array.isArray(response?.suggestions) ? response.suggestions : [],
        loading: false,
      };
      cacheRef.current?.set?.(criteriaKey, matchPayload);
      updateState({ step: "matches", ...matchPayload, error: "" });
    } catch (error) {
      updateState({
        matchResults: [],
        loading: false,
        reasonCode: "SYSTEM_ERROR",
        nearestProvider: null,
        nearestLocation: "",
        nearestDistanceKm: null,
        suggestions: [],
        error: friendlySmartMatchError(error),
      });
    }
  };

  const goNext = () => {
    if (!canContinue || state.loading) return;
    if (state.step === "where") {
      loadMatches();
      return;
    }
    updateState({ step: SMART_MATCH_STEPS[Math.min(stepIndex + 1, SMART_MATCH_STEPS.length - 1)].key });
  };

  const matches = Array.isArray(state.matchResults) ? state.matchResults : [];

  return (
    <div className="smart-match-page">
      <header className="smart-match-header">
        <button type="button" onClick={goBack} aria-label="Back"><FiArrowLeft /></button>
        <img src={logo} alt="Queless" />
        <button type="button" aria-label="Smart Match help"><FiHelpCircle /></button>
      </header>

      {premiumActive ? <SmartMatchStepper currentStep={state.step} /> : null}

      <main className="smart-match-content">
        {!premiumActive ? (
          <section className="smart-match-lock-panel">
            <div className="smart-match-lock-icon"><FiLock /></div>
            <h1>Smart Match</h1>
            <p>Smart Match is included with Customer Premium. Manual search and normal booking stay free.</p>
            {pendingCustomerSubscriptionPayment?.reference ? (
              <div className="smart-match-pending">
                <strong>Payment pending</strong>
                <span>Reference {pendingCustomerSubscriptionPayment.reference}</span>
              </div>
            ) : null}
            <div className="smart-match-lock-list">
              {["Guided matching", "Ranked providers", "Location fit", "Availability signals"].map((item) => (
                <span key={item}><FiCheck /> {item}</span>
              ))}
            </div>
            <div className="smart-match-price"><FiCreditCard /> Customer Premium: UGX 10,000/month</div>
            {customerSubscriptionMessage ? <div className="smart-match-error">{customerSubscriptionMessage}</div> : null}
          </section>
        ) : null}

        {premiumActive && state.error ? <div className="smart-match-error">{state.error}</div> : null}

        {premiumActive && state.step === "need" ? (
          <section className="smart-match-step">
            <div className="smart-match-title">
              <h1>What do you need?</h1>
              <p>Pick the category that's closest to what you need help with.</p>
            </div>
            <div className="smart-match-category-grid">
              {SERVICE_CATEGORIES.map((item) => {
                const Icon = item.icon;
                const active = state.selectedService?.key === item.key;
                return (
                  <button type="button" key={item.key} className={active ? "smart-match-tile is-selected" : "smart-match-tile"} onClick={() => updateState({ selectedService: item })}>
                    <span className="smart-match-icon-box"><Icon /></span>
                    <span className="smart-match-label">{item.label}</span>
                    {active ? <FiCheck className="smart-match-check" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {premiumActive && state.step === "when" ? (
          <section className="smart-match-step">
            <div className="smart-match-title">
              <h1>How soon?</h1>
              <p>Let us know your timeline.</p>
            </div>
            <div className="smart-match-option-stack">
              {WHEN_OPTIONS.map((item) => {
                const Icon = item.icon;
                const active = state.selectedWhen === item.key;
                return (
                  <button type="button" key={item.key} className={active ? "smart-match-option is-selected" : "smart-match-option"} onClick={() => updateState({ selectedWhen: item.key })}>
                    <span className="smart-match-icon-box"><Icon /></span>
                    <span><strong>{item.label}</strong><small>{item.helper}</small></span>
                    {active ? <FiCheck /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {premiumActive && state.step === "where" ? (
          <section className="smart-match-step">
            <SummaryCard state={state} />
            <div className="smart-match-title">
              <h1>Where should this happen?</h1>
              <p>This helps Smart Match find the right providers for you.</p>
            </div>
            <div className="smart-match-option-stack">
              {LOCATION_OPTIONS.map((item) => {
                const Icon = item.icon;
                const active = state.selectedLocationType === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    className={active ? "smart-match-option is-selected" : "smart-match-option"}
                    onClick={() => item.key === "use_current_location" ? requestCurrentLocation() : updateState({ selectedLocationType: "enter_address" })}
                  >
                    <span className="smart-match-icon-box"><Icon /></span>
                    <span><strong>{item.label}</strong><small>{item.key === "enter_address" ? "Type where the service should happen." : item.helper}</small></span>
                    {active ? <FiCheck /> : null}
                  </button>
                );
              })}
            </div>
            {locationMessage ? <div className="smart-match-location-note">{locationMessage}</div> : null}
            {state.selectedLocationType === "enter_address" ? (
              <label className="smart-match-address-field">
                <span>Address or area</span>
                <input
                  value={state.selectedAddress}
                  onChange={(event) => updateState({ selectedAddress: event.target.value })}
                  placeholder="Example: Nakwero A, Wakiso"
                />
              </label>
            ) : null}
            {state.selectedLocationType ? <LocationReasonCard locationType={state.selectedLocationType} /> : null}
          </section>
        ) : null}

        {premiumActive && state.step === "matches" ? (
          <section className="smart-match-step">
            <div className="smart-match-title">
              <h1>Best matches for you</h1>
              <p>Ranked using your service, timing, and location choices.</p>
            </div>
            <div className="smart-match-summary-card compact">{smartMatchSummary(state)}</div>
            {matches.length ? (
              <div className="smart-match-why-card">
                <strong>Why these matches?</strong>
                <span>We ranked providers based on service fit, distance, availability, rating, and reliability.</span>
              </div>
            ) : null}
            {state.loading ? <LoadingResults /> : matches.length ? (
              <div className="smart-match-results">
                {matches.map((match) => {
                  const provider = localProviderById?.get?.(String(match.providerId || match.businessId || "")) || match.provider || null;
                  return <MatchProviderCard key={`${match.providerId || match.businessId}-${match.serviceId || match.serviceName}`} match={match} provider={provider} onOpenProvider={onOpenProvider} />;
                })}
              </div>
            ) : state.error ? null : (
              <NoMatchResults
                state={state}
                onChangeLocation={() => updateState({ step: "where" })}
                onTryAnotherService={() => updateState({ step: "need" })}
                onOpenProvider={onOpenProvider}
              />
            )}
          </section>
        ) : null}
      </main>

      <footer className="smart-match-footer">
        {!premiumActive ? (
          <>
            {pendingCustomerSubscriptionPayment?.reference ? (
              <button type="button" className="smart-match-primary-button" onClick={() => onVerifyPremium?.(pendingCustomerSubscriptionPayment.reference)} disabled={customerSubscriptionLoading}>
                {customerSubscriptionLoading ? "Checking payment..." : "Verify Premium payment"}
              </button>
            ) : (
              <button type="button" className="smart-match-primary-button" onClick={onUpgradePremium} disabled={customerSubscriptionLoading}>
                {customerSubscriptionLoading ? "Loading..." : "Choose Payment Method"}
              </button>
            )}
            <button type="button" className="smart-match-secondary-button" onClick={onContinueManualSearch || onBack}>Continue with Manual Search</button>
          </>
        ) : state.step === "matches" ? (
          <button type="button" className="smart-match-secondary-button" onClick={() => updateState({ step: "need" })}>Adjust choices</button>
        ) : (
          <button type="button" className="smart-match-primary-button" onClick={goNext} disabled={!canContinue || state.loading}>
            {state.step === "where" ? state.loading ? "Finding matches..." : "Show best matches" : "Continue"}
          </button>
        )}
      </footer>
    </div>
  );
}
