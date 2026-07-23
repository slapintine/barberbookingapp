import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiCheck, FiCheckCircle, FiCreditCard, FiHelpCircle, FiHome, FiMap, FiMapPin, FiMessageSquare, FiSearch, FiShield, FiStar, FiX, FiZap } from "react-icons/fi";
import { askSmartMatchAssistant, findSmartMatches } from "../../api/smartMatchApi.js";
import { getProviderTier, isProviderOpenNow, isProviderVerified } from "../../utils/providerDiscovery.js";
import logo from "../../assets/queless-logo-full.png";
import { isCustomerPremiumActive } from "../../utils/customerPremium.js";
import { reverseGeocodeCoordinates } from "../../utils/locationUtils.js";
import { CUSTOMER_PREMIUM_PLAN } from "../../utils/subscriptionPlans.js";
import { PAYMENTS_COMING_SOON_MESSAGE } from "../../utils/launchFlags.js";
import { buildAssetUrl } from "../../config/api.js";
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
  if (status === 403) return "Smart Match is not available for this account right now. You can still browse providers normally.";
  if (status === 0 || status >= 500) return "Smart Match is temporarily unavailable. Please try again in a moment.";
  return "We couldn't load matches right now. Please try again.";
}

function customerSubscriptionMessageClass(message) {
  const value = String(message || "").toLowerCase();
  if (/active|unlocked|ready|successful|success/.test(value)) return "smart-match-subscription-message is-success";
  if (/could not|failed|invalid|expired|declined/.test(value)) return "smart-match-subscription-message is-error";
  return "smart-match-subscription-message";
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

function SmartMatchAssistantPanel({
  messages,
  draft,
  loading,
  error,
  onDraftChange,
  onSubmit,
  onOpenProvider,
  onAsk,
  onViewOnMap,
}) {
  const latestMatches = [...messages].reverse().find((item) => item.kind === "matches" && Array.isArray(item.results))?.results || [];
  const messageListRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToLatest = (behavior = "smooth") => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
    setAutoScroll(true);
    setShowJump(false);
  };

  const handleScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const nearBottom = distanceFromBottom < 96;
    setAutoScroll(nearBottom);
    setShowJump(!nearBottom);
  };

  useEffect(() => {
    if (autoScroll) {
      window.requestAnimationFrame(() => scrollToLatest("smooth"));
    }
  }, [autoScroll, messages, loading]);

  return (
    <section className="smart-match-assistant-panel" aria-label="Smart Match Assistant" data-testid="smart-match-assistant-panel">
      <div className="smart-match-assistant-title">
        <span><FiZap /></span>
        <div>
          <strong>Smart Match Assistant</strong>
          <p>Tell Queless what you need in your own words. Premium Customer uses real providers, services, images, prices, and availability.</p>
        </div>
      </div>
      <div className="smart-match-assistant-messages" ref={messageListRef} onScroll={handleScroll} aria-live="polite" data-testid="smart-match-assistant-messages">
        {messages.map((message) => (
          <article key={message.id} className={`smart-match-assistant-message is-${message.role}`}>
            <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
            <p>{message.content}</p>
          </article>
        ))}
        {loading ? <div className="smart-match-assistant-loading">Finding real matches...</div> : null}
        {error ? <div className="smart-match-error" role="alert">{error}</div> : null}
      </div>
      {showJump ? (
        <button type="button" className="smart-match-jump-latest" data-testid="smart-match-jump-latest" onClick={() => scrollToLatest()}>
          Jump to latest
        </button>
      ) : null}
      {latestMatches.length ? (
        <div className="smart-match-assistant-results" data-testid="smart-match-assistant-results">
          {latestMatches.slice(0, 3).map((match) => (
            <MatchProviderCard
              key={`${match.providerId || match.businessId}-${match.serviceId || match.serviceName}`}
              match={{
                ...match,
                reasons: Array.isArray(match.explanation) ? match.explanation : match.reasons,
                providerName: match.standName || match.providerName,
              }}
              provider={match.provider || null}
              onOpenProvider={onOpenProvider}
              onAsk={onAsk}
              onViewOnMap={onViewOnMap}
            />
          ))}
        </div>
      ) : null}
      <form className="smart-match-assistant-form" onSubmit={onSubmit} data-testid="smart-match-assistant-form">
        <label htmlFor="smart-match-assistant-input">Ask for a match</label>
        <div>
          <input
            id="smart-match-assistant-input"
            data-testid="smart-match-assistant-input"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value.slice(0, 500))}
            placeholder="Example: I need braids in Ntinda on Saturday afternoon"
            disabled={loading}
            onFocus={() => window.setTimeout(() => scrollToLatest(), 120)}
          />
          <button type="submit" disabled={loading || !draft.trim()} data-testid="smart-match-assistant-submit">
            {loading ? "Checking..." : "Ask"}
          </button>
        </div>
      </form>
    </section>
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

/** Priority sort modes — all sort by REAL fields; ties keep best-match order. */
const SMART_MATCH_SORTS = [
  { key: "best", label: "Best match" },
  { key: "nearest", label: "Nearest" },
  { key: "rated", label: "Top rated" },
  { key: "available", label: "Available now" },
  { key: "budget", label: "Budget" },
  { key: "premium", label: "Premium" },
];

function providerHasHours(provider) {
  return Boolean(provider?.availability?.start || provider?.availability_start);
}

function providerPriceFrom(provider) {
  const value = Number(provider?.price_from || 0);
  return value > 0 ? value : Number.POSITIVE_INFINITY;
}

function providerTierRank(provider) {
  const tier = String(getProviderTier(provider || {}) || "").toUpperCase();
  return tier === "PLATINUM" ? 0 : tier === "PREMIUM" ? 1 : 2;
}

/** Sort the existing matches client-side. Default keeps the backend relevance order. */
function sortMatches(matches, mode, providerById) {
  const resolve = (match) =>
    providerById?.get?.(String(match.providerId || match.businessId || "")) || match.provider || null;
  const list = [...matches];
  switch (mode) {
    case "nearest":
      return list.sort(
        (a, b) => Number(a.distanceKm ?? Number.POSITIVE_INFINITY) - Number(b.distanceKm ?? Number.POSITIVE_INFINITY)
      );
    case "rated":
      return list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    case "budget":
      return list.sort((a, b) => providerPriceFrom(resolve(a)) - providerPriceFrom(resolve(b)));
    case "premium":
      return list.sort((a, b) => providerTierRank(resolve(a)) - providerTierRank(resolve(b)));
    case "available":
      return list.sort((a, b) => {
        const openRank = (match) => {
          const provider = resolve(match);
          return providerHasHours(provider) && isProviderOpenNow(provider) ? 0 : 1;
        };
        return openRank(a) - openRank(b);
      });
    default:
      return list;
  }
}

/**
 * Build honest "why this match" chips from REAL fields only. Never fabricate
 * availability, distance, rating, verification, home service, or plan tier.
 */
function getMatchChips(match, provider) {
  const chips = [];
  const distance = Number(match?.distanceKm);
  const rating = Number(match?.rating);
  if (Number.isFinite(distance) && distance <= 3) chips.push({ icon: "pin", label: "Nearby" });
  if (Number.isFinite(rating) && rating >= 4.5) chips.push({ icon: "star", label: "Highly rated" });
  if (isProviderVerified(provider || {})) chips.push({ icon: "shield", label: "Verified" });
  const tier = String(getProviderTier(provider || {}) || "").toUpperCase();
  if (tier === "PLATINUM") chips.push({ icon: "zap", label: "Platinum" });
  else if (tier === "PREMIUM") chips.push({ icon: "zap", label: "Premium" });
  if (provider?.home_service_enabled === 1 || provider?.home_service_enabled === true) {
    chips.push({ icon: "home", label: "Home service" });
  }
  // Only when real availability hours exist and the provider is open right now.
  if (providerHasHours(provider) && isProviderOpenNow(provider)) chips.push({ icon: "check", label: "Available now" });
  return chips.slice(0, 4);
}

function ChipIcon({ name }) {
  if (name === "pin") return <FiMapPin />;
  if (name === "star") return <FiStar />;
  if (name === "shield") return <FiShield />;
  if (name === "zap") return <FiZap />;
  if (name === "home") return <FiHome />;
  if (name === "check") return <FiCheckCircle />;
  return null;
}

function MatchProviderImage({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <FiMapPin className="smart-match-result-fallback-icon" aria-hidden="true" />;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function MatchProviderCard({ match, provider, onOpenProvider, onAsk, onViewOnMap }) {
  const score = Number(match.score || 0);
  const chips = getMatchChips(match, provider);
  const primaryReason = Array.isArray(match.reasons) && match.reasons.length ? match.reasons[0] : "";
  const providerImage = buildAssetUrl(match.imageUrl || provider?.image || "");
  const hasRating = Number(match.rating) > 0;
  return (
    <article className="smart-match-result-card" data-testid="smart-match-result-card">
      <div className="smart-match-result-media">
        <MatchProviderImage src={providerImage} />
        <b>{score ? `${score}` : "Fit"}</b>
      </div>
      <div className="smart-match-result-body">
        <div className="smart-match-result-title">
          <strong>{match.businessName || provider?.business_name || "Queless provider"}</strong>
          <span>{match.serviceLabel || match.serviceName || match.category || "Service"}</span>
        </div>
        <div className="smart-match-result-meta">
          <span><FiStar /> {hasRating ? Number(match.rating).toFixed(1) : "New"} ({Number(match.reviewsCount || match.reviews || 0)})</span>
          <span><FiMapPin /> {Number.isFinite(Number(match.distanceKm)) ? `${Number(match.distanceKm).toFixed(1)} km` : "Nearby"}</span>
        </div>
        {chips.length ? (
          <div className="smart-match-chips">
            {chips.map((chip) => (
              <span className="smart-match-chip" key={chip.label}>
                <ChipIcon name={chip.icon} /> {chip.label}
              </span>
            ))}
          </div>
        ) : null}
        {primaryReason ? <p className="smart-match-why-line">{primaryReason}</p> : null}
        <div className="smart-match-result-actions">
          <button
            type="button"
            className="smart-match-result-btn primary"
            data-testid="smart-match-result-profile"
            onClick={() => (provider ? onOpenProvider?.(provider) : null)}
            disabled={!provider}
          >
            View &amp; Book
          </button>
          <button
            type="button"
            className="smart-match-result-btn"
            data-testid="smart-match-result-ask"
            onClick={() => (provider ? onAsk?.(provider) : null)}
            disabled={!provider}
          >
            <FiMessageSquare /> Ask
          </button>
          {onViewOnMap ? (
            <button type="button" className="smart-match-result-btn" data-testid="smart-match-result-map" onClick={() => onViewOnMap(provider || match)}>
              <FiMap /> Map
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function SmartMatchPage({
  initial = {},
  providers = [],
  locationLabel = "",
  customerSubscription,
  premiumActive: premiumActiveProp,
  smartMatchAvailable = true,
  customerSubscriptionMessage = "",
  pendingCustomerSubscriptionPayment,
  onBack,
  onOpenProvider,
  onContinueManualSearch,
  onAsk,
  onViewOnMap,
}) {
  const draftKey = `${locationLabel}|${JSON.stringify(initial || {})}`;
  const [stateEntry, setStateEntry] = useState(() => ({ key: draftKey, value: readStoredDraft(initial, locationLabel) }));
  const [locationMessageEntry, setLocationMessageEntry] = useState({ key: "", value: "" });
  const [showHelp, setShowHelp] = useState(false);
  const [sortMode, setSortMode] = useState("best");
  const [assistantMessages, setAssistantMessages] = useState([
    {
      id: "assistant-welcome",
      role: "assistant",
      kind: "welcome",
      content: "Tell me what service you need, where, and when. I will only recommend real Queless providers.",
    },
  ]);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const cacheRef = useRef(new Map());
  const premiumActive = typeof premiumActiveProp === "boolean" ? premiumActiveProp : isCustomerPremiumActive(customerSubscription);
  const standardSmartMatchActive = Boolean(smartMatchAvailable);
  const includedButUnavailable = !standardSmartMatchActive;
  const showPremiumAssistant = premiumActive && standardSmartMatchActive && !includedButUnavailable;
  const showStandardSmartMatch = standardSmartMatchActive && !includedButUnavailable && !showPremiumAssistant;
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
    const draft = {
      step: state.step === "matches" ? "need" : state.step,
      selectedService: state.selectedService,
      selectedWhen: state.selectedWhen,
      selectedLocationType: state.selectedLocationType,
      selectedAddress: state.selectedAddress,
      userCoordinates: state.userCoordinates,
    };
    sessionStorage.setItem(SMART_MATCH_SESSION_KEY, JSON.stringify(draft));
  }, [state]);

  const localProviderById = useMemo(() => {
    return new Map((providers || []).map((provider) => [String(provider.id), provider]));
  }, [providers]);

  const updateState = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...patch, error: patch.error ?? "" }));
  }, [setState]);
  const stepIndex = SMART_MATCH_STEPS.findIndex((item) => item.key === state.step);
  const canContinue =
    state.step === "need" ? Boolean(state.selectedService) :
    state.step === "when" ? Boolean(state.selectedWhen) :
    state.step === "where"
      ? state.selectedLocationType === "use_current_location" || (state.selectedLocationType === "enter_address" && Boolean(state.selectedAddress.trim()))
      : true;

  const goBack = useCallback(() => {
    if (state.loading) return;
    if (showPremiumAssistant || !standardSmartMatchActive || stepIndex <= 0) {
      onBack?.();
      return;
    }
    updateState({ step: SMART_MATCH_STEPS[stepIndex - 1].key });
  }, [onBack, showPremiumAssistant, standardSmartMatchActive, state.loading, stepIndex, updateState]);

  useEffect(() => {
    document.body.dataset.quelessSmartMatchOpen = "true";
    const handleNativeBack = () => {
      goBack();
    };
    window.addEventListener("queless:native-back", handleNativeBack);
    return () => {
      if (document.body?.dataset?.quelessSmartMatchOpen === "true") {
        delete document.body.dataset.quelessSmartMatchOpen;
      }
      window.removeEventListener("queless:native-back", handleNativeBack);
    };
  }, [goBack]);

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
        budgetMax: budgetInput ? Number(String(budgetInput).replace(/[^\d]/g, "")) : null,
        verifiedOnly,
      });
      const matches = Array.isArray(response?.matches) ? response.matches : [];
      const matchPayload = {
        matchResults: matches,
        reasonCode: response?.reasonCode || "",
        nearestProvider: response?.nearestProvider || null,
        nearestLocation: response?.nearestLocation || "",
        nearestDistanceKm: response?.nearestDistanceKm ?? null,
        suggestions: Array.isArray(response?.suggestions) ? response.suggestions : [],
        budgetMax: budgetInput ? Number(String(budgetInput).replace(/[^\d]/g, "")) : null,
        verifiedOnly,
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

  const submitAssistantRequest = async (event) => {
    event?.preventDefault?.();
    const message = assistantDraft.trim();
    if (!message || assistantLoading) return;
    const userMessage = {
      id: `assistant-user-${Date.now()}`,
      role: "user",
      kind: "message",
      content: message,
    };
    const conversation = assistantMessages
      .filter((item) => item.id !== "assistant-welcome")
      .slice(-8)
      .map((item) => ({
        role: item.role,
        content: item.content,
        criteria: item.criteria,
      }));
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantDraft("");
    setAssistantLoading(true);
    setAssistantError("");
    try {
      const result = await askSmartMatchAssistant({ message, conversation });
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-response-${Date.now()}`,
          role: "assistant",
          kind: result?.kind || "message",
          content: result?.message || "I could not prepare a recommendation just now.",
          criteria: result?.criteria || {},
          results: Array.isArray(result?.results) ? result.results : [],
        },
      ]);
    } catch (error) {
      const status = Number(error?.status || error?.payload?.status || 0);
      setAssistantError(
        status === 403
          ? "Smart Match Assistant is included with Premium Customer. You can still use regular Smart Match and book normally."
          : "Smart Match Assistant is temporarily unavailable. Regular Smart Match still works."
      );
    } finally {
      setAssistantLoading(false);
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

  const matches = useMemo(
    () => (Array.isArray(state.matchResults) ? state.matchResults : []),
    [state.matchResults]
  );
  const displayedMatches = useMemo(
    () => sortMatches(matches, sortMode, localProviderById),
    [matches, sortMode, localProviderById]
  );
  const showPremiumPromotion = showStandardSmartMatch && !premiumActive && state.step === "matches";
  const premiumPromotion = showPremiumPromotion ? (
    <aside
      className="smart-match-help smart-match-premium-assistant"
      aria-label="Premium Smart Match Assistant"
      data-testid="smart-match-premium-promotion"
    >
      <strong>Want help describing what you need?</strong>
      <p>Premium Smart Match can guide you through your request in a conversation and refine your matches as you go.</p>
      {pendingCustomerSubscriptionPayment?.reference ? (
        <div className="smart-match-pending">
          <strong>Payments Coming Soon</strong>
          <span>Customer Premium payments are not active yet.</span>
        </div>
      ) : null}
      <div className="smart-match-lock-list">
        {["Natural-language requests", "Provider comparisons", "Real provider cards", "Images and map actions"].map((item) => (
          <span key={item}><FiCheck /> {item}</span>
        ))}
      </div>
      <div className="smart-match-price"><FiCreditCard /> Customer Premium: UGX {CUSTOMER_PREMIUM_PLAN.monthlyPrice.toLocaleString("en-UG")}/month - Coming Soon</div>
      <div className="smart-match-subscription-message" role="status">{PAYMENTS_COMING_SOON_MESSAGE}</div>
      {customerSubscriptionMessage ? <div className={customerSubscriptionMessageClass(customerSubscriptionMessage)} role="status">{customerSubscriptionMessage}</div> : null}
    </aside>
  ) : null;

  return (
    <div className="smart-match-page">
      <header className="smart-match-header">
        <button type="button" onClick={goBack} aria-label="Back" data-testid="smart-match-back"><FiArrowLeft /></button>
        <img src={logo} alt="Queless" />
        <button
          type="button"
          aria-label={showHelp ? "Close Smart Match help" : "Smart Match help"}
          aria-expanded={showHelp}
          aria-controls="smart-match-help"
          data-testid="smart-match-help-toggle"
          onClick={() => setShowHelp((visible) => !visible)}
        >
          {showHelp ? <FiX /> : <FiHelpCircle />}
        </button>
      </header>

      {showStandardSmartMatch ? <SmartMatchStepper currentStep={state.step} /> : null}

      <main className="smart-match-content">
        {showHelp ? (
          <aside id="smart-match-help" className="smart-match-help" aria-label="How Smart Match works">
            <strong>How Smart Match works</strong>
            <p>Choose a service, timing, and location. Queless ranks suitable providers using fit, distance, availability, rating, and reliability signals.</p>
            <span>You stay in control—review a provider before you book.</span>
          </aside>
        ) : null}

        {includedButUnavailable ? (
          <section className="smart-match-lock-panel">
            <div className="smart-match-lock-icon"><FiShield /></div>
            <h1>Smart Match</h1>
            <p>Smart Match is included in your plan, but it is temporarily unavailable.</p>
            <button type="button" className="smart-match-secondary-button" onClick={onContinueManualSearch || onBack}>Continue with Manual Search</button>
          </section>
        ) : null}

        {showPremiumAssistant ? (
          <SmartMatchAssistantPanel
            messages={assistantMessages}
            draft={assistantDraft}
            loading={assistantLoading}
            error={assistantError}
            onDraftChange={setAssistantDraft}
            onSubmit={submitAssistantRequest}
            onOpenProvider={onOpenProvider}
            onAsk={onAsk}
            onViewOnMap={onViewOnMap}
          />
        ) : null}

        {showStandardSmartMatch && state.error ? (
          <section className="smart-match-error smart-match-error-card" role="alert">
            <strong>We couldn't finish the match</strong>
            <span>{state.error}</span>
            <div className="smart-match-error-actions">
              <button type="button" onClick={loadMatches} disabled={state.loading}>
                {state.loading ? "Trying again…" : "Try again"}
              </button>
              <button type="button" onClick={() => updateState({ step: "where" })}>Review location</button>
            </div>
          </section>
        ) : null}

        {showStandardSmartMatch ? (
          <div className="smart-match-plan-label" data-testid="smart-match-free-label">
            <FiZap aria-hidden="true" />
            <span>You're using Free Smart Match</span>
          </div>
        ) : null}

        {showStandardSmartMatch && state.step === "need" ? (
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
                  <button type="button" key={item.key} className={active ? "smart-match-tile is-selected" : "smart-match-tile"} data-testid="smart-match-category-option" style={{ "--cat-color": item.primaryColor, "--cat-bg": item.softBg }} onClick={() => updateState({ selectedService: item })}>
                    <span className="smart-match-icon-box" style={{ background: item.softBg, color: item.primaryColor }}><Icon /></span>
                    <span className="smart-match-label">{item.label}</span>
                    {active ? <FiCheck className="smart-match-check" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {showStandardSmartMatch && state.step === "when" ? (
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
                  <button type="button" key={item.key} className={active ? "smart-match-option is-selected" : "smart-match-option"} data-testid="smart-match-when-option" onClick={() => updateState({ selectedWhen: item.key })}>
                    <span className="smart-match-icon-box"><Icon /></span>
                    <span><strong>{item.label}</strong><small>{item.helper}</small></span>
                    {active ? <FiCheck /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {showStandardSmartMatch && state.step === "where" ? (
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
                    data-testid="smart-match-location-option"
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
            <div className="smart-match-filter-panel" aria-label="Optional Smart Match filters">
              <label className="smart-match-address-field">
                <span>Budget (optional)</span>
                <input
                  value={budgetInput}
                  inputMode="numeric"
                  data-testid="smart-match-budget-input"
                  onChange={(event) => setBudgetInput(event.target.value.replace(/[^\d,]/g, "").slice(0, 12))}
                  placeholder="Example: 30000"
                />
              </label>
              <label className="smart-match-toggle-row">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  data-testid="smart-match-verified-toggle"
                  onChange={(event) => setVerifiedOnly(event.target.checked)}
                />
                <span>Only show verified providers</span>
              </label>
            </div>
          </section>
        ) : null}

        {showStandardSmartMatch && state.step === "matches" ? (
          <section className="smart-match-step">
            <div className="smart-match-title">
              <h1>Best matches for you</h1>
              <p>Ranked using your service, timing, and location choices.</p>
            </div>
            <div className="smart-match-summary-card compact">{smartMatchSummary(state)}</div>
            {(state.budgetMax || state.verifiedOnly) ? (
              <div className="smart-match-filter-row" aria-label="Active Smart Match filters">
                {state.budgetMax ? (
                  <button type="button" className="smart-match-filter-chip is-active" data-testid="smart-match-active-filter" onClick={() => {
                    setBudgetInput("");
                    updateState({ step: "where", budgetMax: null });
                  }}>
                    Budget up to UGX {Number(state.budgetMax).toLocaleString()} ×
                  </button>
                ) : null}
                {state.verifiedOnly ? (
                  <button type="button" className="smart-match-filter-chip is-active" data-testid="smart-match-active-filter" onClick={() => {
                    setVerifiedOnly(false);
                    updateState({ step: "where", verifiedOnly: false });
                  }}>
                    Verified only ×
                  </button>
                ) : null}
              </div>
            ) : null}
            {matches.length ? (
              <div className="smart-match-why-card">
                <strong>Why these matches?</strong>
                <span>We ranked providers based on service fit, distance, availability, rating, and reliability.</span>
              </div>
            ) : null}
            {matches.length > 1 ? (
              <div className="smart-match-filter-row" role="group" aria-label="Sort matches">
                {SMART_MATCH_SORTS.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={sortMode === option.key ? "smart-match-filter-chip is-active" : "smart-match-filter-chip"}
                    data-testid="smart-match-sort-filter"
                    aria-pressed={sortMode === option.key}
                    onClick={() => setSortMode(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {state.loading ? <LoadingResults /> : displayedMatches.length ? (
              <div className="smart-match-results">
                {displayedMatches.map((match) => {
                  const provider = localProviderById?.get?.(String(match.providerId || match.businessId || "")) || match.provider || null;
                  return (
                    <MatchProviderCard
                      key={`${match.providerId || match.businessId}-${match.serviceId || match.serviceName}`}
                      match={match}
                      provider={provider}
                      onOpenProvider={onOpenProvider}
                      onAsk={onAsk}
                      onViewOnMap={onViewOnMap}
                    />
                  );
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

        {premiumPromotion}
      </main>

      {showStandardSmartMatch ? (
        <footer className="smart-match-footer">
          {state.step === "matches" ? (
            <button type="button" className="smart-match-secondary-button" onClick={() => updateState({ step: "need" })}>Adjust choices</button>
          ) : (
            <button type="button" className="smart-match-primary-button" onClick={goNext} disabled={!canContinue || state.loading}>
              {state.step === "where" ? state.loading ? "Finding matches..." : "Show best matches" : "Continue"}
            </button>
          )}
        </footer>
      ) : null}
    </div>
  );
}
