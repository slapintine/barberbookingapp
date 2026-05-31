import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiArrowRight,
  FiBarChart2,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiLock,
  FiMessageCircle,
  FiRefreshCw,
  FiStar,
  FiTrendingUp,
  FiUserCheck,
  FiZap,
} from "react-icons/fi";
import { getAiCoachInsights } from "../../api/aiCoachApi.js";
import "./AiCoachScreen.css";

function isFutureOrUnset(value) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function isActivePlatinum(subscription = {}, barber = {}) {
  const tier = String(subscription.tier || barber.subscription?.tier || barber.subscription_tier || barber.selected_plan || "").toUpperCase();
  if (tier !== "PLATINUM") return false;

  const status = String(subscription.status || barber.subscription?.status || barber.subscription_status || "").toLowerCase();
  const trialStatus = String(subscription.trial_status || barber.subscription?.trial_status || barber.trial_status || "").toLowerCase();
  const isActive = status === "active" || status === "trialing" || Number(subscription.is_active || barber.subscription?.is_active || 0) === 1;
  const isTrial = trialStatus === "active" || trialStatus === "trialing" || status === "trialing" || subscription.is_trial;
  const expiry = subscription.expires_at || barber.subscription?.expires_at || barber.subscription_expires_at;
  const trialExpiry = subscription.trial_ends_at || barber.subscription?.trial_ends_at || barber.trial_ends_at;

  if (isTrial) return isFutureOrUnset(trialExpiry || expiry);
  if (isActive) return isFutureOrUnset(expiry);
  return false;
}

function RecommendationCard({ title, icon, item, actionHandler }) {
  if (!item) return null;
  return (
    <article className="ai-coach-card-v1">
      <div className="ai-coach-card-head-v1">
        <span>{icon}</span>
        <small>{title}</small>
      </div>
      <h3>{item.headline}</h3>
      <p><strong>Recommendation:</strong> {item.recommendation}</p>
      <p><strong>Why:</strong> {item.why}</p>
      <p><strong>Benefit:</strong> {item.benefit}</p>
      {item.actionLabel ? (
        <button type="button" className="ai-coach-link-btn-v1" onClick={() => actionHandler?.(item.actionTarget)}>
          {item.actionLabel} <FiArrowRight />
        </button>
      ) : null}
    </article>
  );
}

function RecommendationList({ title, icon, items = [], emptyText, actionHandler }) {
  return (
    <section className="ai-coach-section-v1">
      <div className="ai-coach-section-title-v1">
        {icon}
        <span>{title}</span>
      </div>
      <div className="ai-coach-grid-v1">
        {items.length ? (
          items.map((item, index) => (
            <RecommendationCard
              key={`${title}-${index}-${item.headline}`}
              title={title}
              icon={icon}
              item={item}
              actionHandler={actionHandler}
            />
          ))
        ) : (
          <div className="ai-coach-empty-card-v1">{emptyText}</div>
        )}
      </div>
    </section>
  );
}

function getPlanLabel(subscription = {}, barber = {}) {
  const tier = String(subscription.tier || barber.subscription?.tier || barber.subscription_tier || barber.selected_plan || "No active plan").toUpperCase();
  const status = String(subscription.status || barber.subscription?.status || barber.subscription_status || "inactive").replace(/_/g, " ");
  return `${tier} - ${status}`;
}

function UpgradeLock({ barber, subscription, onUpgradePlan }) {
  return (
    <div className="content-v4 app-page-v4 ai-coach-page-v1">
      <section className="ai-coach-lock-v1">
        <div className="ai-coach-lock-icon-v1"><FiLock /></div>
        <div>
          <div className="ai-coach-eyebrow-v1">Platinum feature</div>
          <h1>Unlock AI Business Coach with Platinum</h1>
          <p>AI Coach is included only with an active Platinum provider plan. Your current provider access is {getPlanLabel(subscription, barber)}.</p>
        </div>
        <div className="ai-coach-lock-grid-v1">
          <span><FiTrendingUp /> Increase bookings</span>
          <span><FiStar /> Improve ratings</span>
          <span><FiUserCheck /> Understand customers</span>
          <span><FiDollarSign /> Improve pricing</span>
        </div>
        <button type="button" className="primary-btn-v4" onClick={() => onUpgradePlan?.("PLATINUM")}>
          Upgrade to Platinum
        </button>
        <small className="ai-coach-lock-note-v1">After payment or trial activation, this page unlocks automatically and the backend verifies your business ownership.</small>
      </section>
    </div>
  );
}

export default function AiCoachScreen({
  barber,
  subscription,
  onUpgradePlan,
  onEditProfile,
  onOpenReports,
  onOpenBookings,
  onOpenDashboard,
  onShowActionHint,
}) {
  const [state, setState] = useState({ loading: true, error: "", data: null, locked: false });
  const [reloadKey, setReloadKey] = useState(0);
  const platinumReady = isActivePlatinum(subscription, barber);

  useEffect(() => {
    let cancelled = false;

    async function loadInsights() {
      if (!barber?.id) {
        setState({ loading: false, error: "", data: null, locked: false });
        return;
      }
      if (!platinumReady) {
        setState({ loading: false, error: "", data: null, locked: true });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: "", locked: false }));
      try {
        const response = await getAiCoachInsights(barber.id);
        if (!cancelled) setState({ loading: false, error: "", data: response.insights, locked: false });
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error: error?.status === 403 ? "" : error.message || "AI Coach could not load right now.",
          data: null,
          locked: error?.status === 403,
        });
      }
    }

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, [barber?.id, platinumReady, reloadKey]);

  const checklist = state.data?.setupChecklist || [];
  const dataQuality = state.data?.dataQuality || {};
  const needsSetup = state.data && !dataQuality.enoughData;
  const completion = useMemo(() => {
    if (!checklist.length) return 0;
    return Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100);
  }, [checklist]);

  const handleAction = (target) => {
    const normalized = String(target || "profile").toLowerCase();
    const actionMessages = {
      schedule: "Opening your business editor. Update the hours section so customers can book your best times.",
      services: "Opening your business editor. Go to services to update the listing the coach highlighted.",
      prices: "Opening your business editor. Review service pricing and save clear fixed, range, starting, or quote pricing.",
      profile: "Opening your business editor. Complete the profile fields the coach marked as missing.",
      photos: "Opening your business editor. Add service or portfolio photos for stronger customer trust.",
      bookings: "Opening bookings so you can confirm, follow up, and message customers.",
      customers: "Opening bookings so you can find recent customers and follow up.",
      offers: "Opening reports. Use the promotion suggestion there to shape your next customer offer.",
      reports: "Opening reports so you can compare this insight with booking and revenue trends.",
      reviews: "Opening reports so you can review rating patterns and feedback.",
    };
    onShowActionHint?.(actionMessages[normalized] || "Opening the best place to act on this insight.");

    if (["reports", "reviews", "offers"].includes(normalized)) onOpenReports?.();
    else if (["bookings", "customers"].includes(normalized)) onOpenBookings?.();
    else if (normalized === "dashboard") onOpenDashboard?.();
    else onEditProfile?.(normalized);
  };

  if (!barber) {
    return (
      <div className="content-v4 app-page-v4 ai-coach-page-v1">
        <div className="empty-state-v7">
          <FiZap />
          <strong>No business profile found</strong>
          <span>Create your business profile before using AI Coach.</span>
        </div>
      </div>
    );
  }

  if (state.locked || !platinumReady) {
    return <UpgradeLock barber={barber} subscription={subscription} onUpgradePlan={onUpgradePlan} />;
  }

  return (
    <div className="content-v4 app-page-v4 ai-coach-page-v1">
      <header className="ai-coach-hero-v1">
        <div>
          <div className="ai-coach-eyebrow-v1"><FiZap /> Platinum AI feature</div>
          <h1>Queless AI Coach</h1>
          <p>Business recommendations based on your real bookings, services, reviews, prices, and profile setup.</p>
        </div>
        <button type="button" className="secondary-btn-v4 compact-btn-v4" onClick={() => setReloadKey((value) => value + 1)}>
          <FiRefreshCw /> Refresh
        </button>
      </header>

      {state.loading ? (
        <div className="ai-coach-loading-v1">
          <FiRefreshCw />
          <strong>Reading your business signals...</strong>
          <span>Checking bookings, prices, reviews, and profile completeness.</span>
        </div>
      ) : state.error ? (
        <div className="ai-coach-error-v1">
          <FiAlertCircle />
          <strong>AI Coach could not load</strong>
          <span>{state.error}</span>
        </div>
      ) : state.data ? (
        <>
          <section className="ai-coach-summary-v1">
            <RecommendationCard
              title="This Week's Insight"
              icon={<FiTrendingUp />}
              item={state.data.weeklyInsight}
              actionHandler={handleAction}
            />
            <div className="ai-coach-readiness-v1">
              <div>
                <small>Profile readiness</small>
                <strong>{completion}%</strong>
              </div>
              <div className="ai-coach-progress-v1"><span style={{ width: `${completion}%` }} /></div>
              <div className="ai-coach-metrics-v1">
                <span><FiClock /> {dataQuality.bookingsCount || 0} bookings</span>
                <span><FiStar /> {dataQuality.reviewsCount || 0} reviews</span>
                <span><FiBarChart2 /> {dataQuality.servicesCount || 0} services</span>
              </div>
            </div>
          </section>

          {needsSetup ? (
            <section className="ai-coach-setup-v1">
              <div>
                <div className="ai-coach-section-title-v1"><FiCheckCircle /> Setup advice</div>
                <p>Your AI Coach is active, but it has limited booking history to learn from. Complete the setup items below, then use bookings and reports to build stronger signals.</p>
                <div className="ai-coach-setup-actions-v1">
                  <button type="button" className="ai-coach-link-btn-v1" onClick={() => handleAction("profile")}>Improve profile <FiArrowRight /></button>
                  <button type="button" className="ai-coach-link-btn-v1 muted" onClick={() => handleAction("bookings")}>Review bookings <FiArrowRight /></button>
                </div>
              </div>
              <div className="ai-coach-checklist-v1">
                {checklist.map((item) => (
                  <span key={item.label} className={item.complete ? "complete" : ""}>
                    <FiCheckCircle /> {item.label}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <RecommendationList
            title="Booking Opportunities"
            icon={<FiBarChart2 />}
            items={state.data.bookingOpportunities}
            emptyText="More booking opportunities will appear after customers start booking your services."
            actionHandler={handleAction}
          />
          <RecommendationList
            title="Pricing Suggestions"
            icon={<FiDollarSign />}
            items={state.data.pricingSuggestions}
            emptyText="Add service prices or ranges to unlock pricing suggestions."
            actionHandler={handleAction}
          />
          <RecommendationCard
            title="Review Summary"
            icon={<FiMessageCircle />}
            item={state.data.reviewSummary}
            actionHandler={handleAction}
          />
          <RecommendationList
            title="Profile Fixes"
            icon={<FiUserCheck />}
            items={state.data.profileFixes}
            emptyText="Your core profile fields look complete. Keep photos and hours fresh."
            actionHandler={handleAction}
          />
          <RecommendationList
            title="Customer Retention Ideas"
            icon={<FiStar />}
            items={state.data.customerRetentionIdeas}
            emptyText="Retention ideas appear after completed customer bookings."
            actionHandler={handleAction}
          />
        </>
      ) : null}
    </div>
  );
}
