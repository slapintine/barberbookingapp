import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiArrowRight,
  FiBarChart2,
  FiBriefcase,
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
import { getAiCoachInsights, getProviderCoachQuestions, requestProviderCoachAdvice } from "../../api/aiCoachApi.js";
import "./AiCoachScreen.css";

// Derive the stand's readiness level from the barber prop fields.
// This is the source of truth for gating coach access — never rely solely on the API response.
function getStandStatus(barber) {
  if (!barber) return "none";
  const publishedVal = barber.is_published ?? barber.isPublished ?? barber.published;
  const isPublished = [true, 1, "1", "true", "yes"].includes(publishedVal);
  if (!isPublished) return "draft";
  // Published stands are live — visibility is not gated on verification or subscription status.
  return "live";
}

function StandBlockedState({ icon, title, description, buttonLabel, onAction }) {
  return (
    <div className="ai-coach-stand-blocked-v1">
      <div className="ai-coach-stand-blocked-icon-v1">{icon}</div>
      <strong>{title}</strong>
      <span>{description}</span>
      <button type="button" className="ai-coach-cta-btn-v1" onClick={onAction}>
        {buttonLabel}
      </button>
    </div>
  );
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

function getUsageText(usage) {
  if (!usage) return "";
  if (usage.unlimited) return "";
  if (usage.plan === "premium") return `${usage.remainingThisMonth} of ${usage.limit} tips remaining this month`;
  return "Upgrade to use coach advice";
}

function UpgradeLock({ usage, onUpgradePlan }) {
  const limitReached = usage?.plan === "premium" && Number(usage.remainingThisMonth || 0) <= 0;
  return (
    <section className="ai-coach-lock-v1">
      <div className="ai-coach-lock-icon-v1"><FiLock /></div>
      <div>
        <div className="ai-coach-eyebrow-v1">{limitReached ? "Monthly tips used" : "Platinum feature"}</div>
        <h1>{limitReached ? "Upgrade to Platinum for unlimited guidance" : "Grow faster with Queless Provider Coach"}</h1>
        <p>
          {limitReached
            ? "You've used your monthly coach tips. Upgrade to Platinum for unlimited guidance."
            : "Get smart tips on improving your stand, pricing, reviews, services, and bookings."}
        </p>
      </div>
      <div className="ai-coach-lock-grid-v1">
        <span><FiTrendingUp /> Improve bookings</span>
        <span><FiStar /> Strengthen reviews</span>
        <span><FiUserCheck /> Build trust</span>
        <span><FiDollarSign /> Clarify pricing</span>
      </div>
      <button type="button" className="ai-coach-cta-btn-v1" onClick={() => onUpgradePlan?.("PLATINUM")}>
        Upgrade to Platinum
      </button>
    </section>
  );
}

function CoachQuestionPanel({ questionsState, selectedAdvice, loadingAdvice, adviceError, onSelectQuestion, onAction, onUpgradePlan }) {
  const categories = questionsState.data?.categories || [];
  const questions = questionsState.data?.questions || [];
  const usage = selectedAdvice?.usage || questionsState.data?.usage;
  const upgradeRequired = adviceError?.code === "UPGRADE_REQUIRED" || questionsState.data?.access?.upgradeRequired;
  const monthlyLimitReached =
    adviceError?.code === "MONTHLY_LIMIT_REACHED" ||
    adviceError?.code === "DAILY_LIMIT_REACHED" ||
    (usage?.plan === "premium" && Number(usage.remainingThisMonth || 0) <= 0);
  const canUseAdvice = !upgradeRequired && !monthlyLimitReached;
  const categoriesToRender = categories.length ? categories : [{ id: "all", label: "Ask the coach", questions }];

  return (
    <section className="ai-coach-chat-v1" aria-labelledby="coach-questions-title">
      <div className="ai-coach-chat-head-v1">
        <div>
          <div className="ai-coach-section-title-v1" id="coach-questions-title">
            <FiMessageCircle /> Choose a question
          </div>
          <p>Select a topic and get practical guidance based on your Queless stand.</p>
        </div>
        {usage && !usage.unlimited ? (
          <span className="ai-coach-usage-pill-v1">{getUsageText(usage)}</span>
        ) : null}
      </div>

      {questionsState.loading ? (
        <div className="ai-coach-loading-v1 compact">
          <FiRefreshCw className="ai-coach-spin-icon-v1" />
          <strong>Loading questions...</strong>
        </div>
      ) : questionsState.error ? (
        <div className="ai-coach-chat-error-v1" role="alert">
          <FiAlertCircle /> {questionsState.error}
        </div>
      ) : (
        <div className="ai-coach-category-list-v1">
          {categoriesToRender.map((category) => (
            <section className="ai-coach-category-v1" key={category.id}>
              {categoriesToRender.length > 1 ? <h3>{category.label}</h3> : null}
              <div className="ai-coach-question-grid-v1">
                {(category.questions || []).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={selectedAdvice?.question === item.question ? "active" : ""}
                    onClick={() => onSelectQuestion(item.id)}
                    disabled={!canUseAdvice || loadingAdvice}
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {upgradeRequired || monthlyLimitReached ? (
        <UpgradeLock usage={monthlyLimitReached ? usage : { plan: "free" }} onUpgradePlan={onUpgradePlan} />
      ) : null}

      {loadingAdvice ? (
        <div className="ai-coach-loading-v1 compact">
          <FiRefreshCw className="ai-coach-spin-icon-v1" />
          <strong>Reading your stand signals...</strong>
          <span>Checking profile, reviews, bookings, services, and visibility.</span>
        </div>
      ) : null}

      {adviceError && !upgradeRequired && !monthlyLimitReached ? (
        <div className="ai-coach-chat-error-v1" role="alert">
          <FiAlertCircle /> {adviceError.message || "Could not answer that question. Please try again."}
        </div>
      ) : null}

      {selectedAdvice ? (
        <article className="ai-coach-answer-v1">
          <div className="ai-coach-card-head-v1">
            <span><FiZap /></span>
            <small>Coach answer</small>
          </div>
          <div className="ai-coach-answer-title-row-v1">
            <h3>{selectedAdvice.title || selectedAdvice.question}</h3>
            {selectedAdvice.priority ? (
              <span className={`ai-coach-priority-v1 ${String(selectedAdvice.priority).toLowerCase()}`}>
                {selectedAdvice.priority} priority
              </span>
            ) : null}
          </div>
          <p>{selectedAdvice.summary || selectedAdvice.advice}</p>
          {selectedAdvice.insights?.length ? (
            <div className="ai-coach-answer-list-v1">
              <strong>Insights</strong>
              {selectedAdvice.insights.map((item) => (
                <span key={item}><FiCheckCircle /> {item}</span>
              ))}
            </div>
          ) : null}
          {(selectedAdvice.actionSteps || selectedAdvice.recommendedActions)?.length ? (
            <div className="ai-coach-answer-list-v1">
              <strong>Do this next</strong>
              {(selectedAdvice.actionSteps || selectedAdvice.recommendedActions).map((item) => (
                <span key={item}><FiArrowRight /> {item}</span>
              ))}
            </div>
          ) : null}
          {(selectedAdvice.recommendedNextAction?.label || selectedAdvice.actionLabel) ? (
            <button
              type="button"
              className="ai-coach-link-btn-v1"
              onClick={() => onAction(selectedAdvice.recommendedNextAction?.target || selectedAdvice.actionTarget)}
            >
              {selectedAdvice.recommendedNextAction?.label || selectedAdvice.actionLabel} <FiArrowRight />
            </button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

export default function AiCoachScreen({
  barber,
  onUpgradePlan,
  onEditProfile,
  onOpenReports,
  onOpenBookings,
  onOpenDashboard,
  onShowActionHint,
}) {
  const [insightsState, setInsightsState] = useState({ loading: true, error: "", data: null });
  const [questionsState, setQuestionsState] = useState({ loading: false, error: "", data: null });
  const [selectedAdvice, setSelectedAdvice] = useState(null);
  const [adviceError, setAdviceError] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Source of truth: derive from barber prop, not API response
  const standStatus = useMemo(() => getStandStatus(barber), [barber]);

  const currentPlan = String(
    barber?.subscription_tier || barber?.selected_plan || barber?.current_plan || ""
  ).toUpperCase();
  const isPlatinum = currentPlan === "PLATINUM";
  const isPremium = currentPlan === "PREMIUM";
  const isCoachEnabled = isPlatinum || isPremium;

  useEffect(() => {
    if (standStatus !== "live") return; // don't fetch if stand isn't live

    let cancelled = false;

    async function loadInsights() {
      setInsightsState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const val = await getAiCoachInsights();
        if (cancelled) return;
        if (val?.businessFound === false) {
          // API can't find business by owner — show data-unavailable state, not "create stand"
          setInsightsState({ loading: false, error: "", data: null, apiNotFound: true });
        } else {
          setInsightsState({
            loading: false,
            error: "",
            data: {
              ...(val.insights || {}),
              weeklyGrowthFocus: val.weeklyGrowthFocus,
              plan: val.plan,
              access: val.access,
            },
            apiNotFound: false,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setInsightsState({ loading: false, error: err?.message || "Insights could not load.", data: null });
      }
    }

    loadInsights();
    return () => { cancelled = true; };
  }, [standStatus, reloadKey]);

  // Load questions only when user clicks "Open Coach"
  useEffect(() => {
    if (!coachOpen || standStatus !== "live") return;

    let cancelled = false;

    async function loadQuestions() {
      setQuestionsState((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const val = await getProviderCoachQuestions();
        if (cancelled) return;
        setQuestionsState({ loading: false, error: "", data: val?.businessFound === false ? null : val });
      } catch (err) {
        if (cancelled) return;
        setQuestionsState({ loading: false, error: err?.message || "Questions could not load.", data: null });
      }
    }

    loadQuestions();
    return () => { cancelled = true; };
  }, [coachOpen, standStatus, reloadKey]);

  const checklist = insightsState.data?.setupChecklist || [];
  const dataQuality = insightsState.data?.dataQuality || {};
  const weeklyGrowthFocus =
    insightsState.data?.weeklyGrowthFocus || insightsState.data?.weeklyInsight?.recommendation || "";
  const usage = questionsState.data?.usage;
  const coachStatusLabel =
    isPlatinum || usage?.unlimited ? "Platinum" :
    isPremium || usage?.plan === "premium" ? "Premium — 5 tips/month" :
    "Platinum feature";
  const completion = useMemo(() => {
    if (!checklist.length) return 0;
    return Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100);
  }, [checklist]);
  const needsSetup = insightsState.data && !dataQuality.enoughData;

  const handleAction = (target) => {
    const normalized = String(target || "profile").toLowerCase();
    const msgs = {
      schedule: "Opening your business editor — update your hours.",
      services: "Opening your business editor — update your service listing.",
      prices: "Opening your business editor — review your service pricing.",
      pricing: "Opening your business editor — review your service pricing.",
      profile: "Opening your business editor — complete missing fields.",
      photos: "Opening your business editor — add service or portfolio photos.",
      bookings: "Opening bookings — confirm, follow up, and message customers.",
      retention: "Opening bookings — find recent customers and follow up.",
      customers: "Opening bookings — find recent customers and follow up.",
      offers: "Opening reports — use the promotion suggestion to shape your next offer.",
      reports: "Opening reports — compare this insight with booking and revenue trends.",
      reviews: "Opening reports — review rating patterns and feedback.",
    };
    onShowActionHint?.(msgs[normalized] || "Opening the best place to act on this insight.");
    if (["reports", "reviews", "offers"].includes(normalized)) onOpenReports?.();
    else if (["bookings", "customers", "retention"].includes(normalized)) onOpenBookings?.();
    else if (normalized === "dashboard") onOpenDashboard?.();
    else onEditProfile?.(normalized);
  };

  async function handleQuestion(questionId) {
    if (loadingAdvice) return;
    setLoadingAdvice(true);
    setAdviceError(null);
    try {
      const response = await requestProviderCoachAdvice(questionId, barber?.id || null);
      setSelectedAdvice(response);
      setQuestionsState((prev) =>
        prev.data ? { ...prev, data: { ...prev.data, usage: response.usage } } : prev
      );
    } catch (error) {
      setAdviceError({
        code: error?.code || error?.payload?.code || "",
        message: error?.userMessage || error?.message || "Provider Coach could not answer that question.",
        usage: error?.payload?.usage,
      });
      if (error?.payload?.usage) {
        setQuestionsState((prev) =>
          prev.data ? { ...prev, data: { ...prev.data, usage: error.payload.usage } } : prev
        );
      }
    } finally {
      setLoadingAdvice(false);
    }
  }

  // ─── Render: stand not ready ──────────────────────────────────────────────────
  if (standStatus === "none") {
    return (
      <div className="content-v4 app-page-v4 ai-coach-page-v1">
        <CoachHeader coachStatusLabel={null} onRefresh={null} />
        <StandBlockedState
          icon={<FiBriefcase />}
          title="Create your business stand first"
          description="Provider Coach unlocks automatically once your business stand is set up on Queless."
          buttonLabel="Create business stand"
          onAction={() => onEditProfile?.("profile")}
        />
      </div>
    );
  }

  if (standStatus === "draft") {
    return (
      <div className="content-v4 app-page-v4 ai-coach-page-v1">
        <CoachHeader coachStatusLabel={null} onRefresh={null} />
        <StandBlockedState
          icon={<FiClock />}
          title="Your business stand is not live yet"
          description="Finish your stand setup and publish it before the coach can give useful advice."
          buttonLabel="Continue stand setup"
          onAction={() => onEditProfile?.("profile")}
        />
      </div>
    );
  }

  if (standStatus === "pending") {
    return (
      <div className="content-v4 app-page-v4 ai-coach-page-v1">
        <CoachHeader coachStatusLabel={null} onRefresh={null} />
        <StandBlockedState
          icon={<FiCheckCircle />}
          title="Publish your stand to start coaching"
          description="Publish your stand from the dashboard to unlock coaching insights and recommendations."
          buttonLabel="Go to dashboard"
          onAction={() => onOpenDashboard?.()}
        />
      </div>
    );
  }

  // ─── Render: stand is live ────────────────────────────────────────────────────
  return (
    <div className="content-v4 app-page-v4 ai-coach-page-v1">
      <CoachHeader
        coachStatusLabel={coachStatusLabel}
        plan={currentPlan.toLowerCase()}
        onRefresh={() => setReloadKey((v) => v + 1)}
      />

      {weeklyGrowthFocus ? (
        <section className="ai-coach-weekly-focus-v1">
          <div>
            <small>This week's focus</small>
            <p>{weeklyGrowthFocus}</p>
          </div>
          <button type="button" className="ai-coach-link-btn-v1 muted" onClick={() => handleAction("profile")}>
            Improve stand <FiArrowRight />
          </button>
        </section>
      ) : null}

      {/* Subscription gate for Free providers */}
      {!isCoachEnabled ? (
        <UpgradeLock usage={{ plan: "free" }} onUpgradePlan={onUpgradePlan} />
      ) : (
        <>
          {/* Insights summary */}
          {insightsState.loading ? (
            <div className="ai-coach-loading-v1">
              <FiRefreshCw className="ai-coach-spin-icon-v1" />
              <strong>Reading your business signals...</strong>
              <span>Checking bookings, prices, reviews, and profile completeness.</span>
            </div>
          ) : insightsState.error ? (
            <div className="ai-coach-error-v1">
              <FiAlertCircle />
              <strong>Insights could not load</strong>
              <span>{insightsState.error}</span>
              <button type="button" className="ai-coach-secondary-btn-v1" onClick={() => setReloadKey((v) => v + 1)}>
                <FiRefreshCw /> Retry
              </button>
            </div>
          ) : insightsState.data ? (
            <>
              <section className="ai-coach-summary-v1">
                <RecommendationCard
                  title="This Week's Insight"
                  icon={<FiTrendingUp />}
                  item={insightsState.data.weeklyInsight}
                  actionHandler={handleAction}
                />
                <div className="ai-coach-readiness-v1">
                  <div>
                    <small>Profile readiness</small>
                    <strong>{completion}%</strong>
                  </div>
                  <div className="ai-coach-progress-v1">
                    <span style={{ width: `${completion}%` }} />
                  </div>
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
                    <div className="ai-coach-section-title-v1"><FiCheckCircle /> Setup checklist</div>
                    <p>Complete these items so the coach can give you better, data-driven advice.</p>
                    <div className="ai-coach-setup-actions-v1">
                      <button type="button" className="ai-coach-link-btn-v1" onClick={() => handleAction("profile")}>
                        Improve profile <FiArrowRight />
                      </button>
                      <button type="button" className="ai-coach-link-btn-v1 muted" onClick={() => handleAction("bookings")}>
                        Review bookings <FiArrowRight />
                      </button>
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
                items={insightsState.data.bookingOpportunities}
                emptyText="More booking opportunities will appear after customers start booking your services."
                actionHandler={handleAction}
              />
              <RecommendationList
                title="Pricing Suggestions"
                icon={<FiDollarSign />}
                items={insightsState.data.pricingSuggestions}
                emptyText="Add service prices or ranges to unlock pricing suggestions."
                actionHandler={handleAction}
              />
              <RecommendationCard
                title="Review Summary"
                icon={<FiMessageCircle />}
                item={insightsState.data.reviewSummary}
                actionHandler={handleAction}
              />
              <RecommendationList
                title="Profile Fixes"
                icon={<FiUserCheck />}
                items={insightsState.data.profileFixes}
                emptyText="Your core profile fields look complete. Keep photos and hours fresh."
                actionHandler={handleAction}
              />
              <RecommendationList
                title="Customer Retention"
                icon={<FiStar />}
                items={insightsState.data.customerRetentionIdeas}
                emptyText="Retention ideas appear after completed customer bookings."
                actionHandler={handleAction}
              />
            </>
          ) : insightsState.apiNotFound ? (
            <div className="ai-coach-error-v1">
              <FiAlertCircle />
              <strong>Business data not yet available</strong>
              <span>The coach could not read your business profile. Make sure your stand is fully saved.</span>
              <button type="button" className="ai-coach-secondary-btn-v1" onClick={() => setReloadKey((v) => v + 1)}>
                <FiRefreshCw /> Retry
              </button>
            </div>
          ) : null}

          {/* Coach question panel — gated behind "Open Coach" click */}
          {!coachOpen ? (
            <div className="ai-coach-open-cta-v1">
              <div className="ai-coach-section-title-v1"><FiMessageCircle /> Ask the Coach</div>
              <p>Get answers to practical questions about your bookings, stand quality, reviews, and growth.</p>
              <button type="button" className="ai-coach-cta-btn-v1" onClick={() => setCoachOpen(true)}>
                Open Coach <FiArrowRight />
              </button>
            </div>
          ) : (
            <CoachQuestionPanel
              questionsState={questionsState}
              selectedAdvice={selectedAdvice}
              loadingAdvice={loadingAdvice}
              adviceError={adviceError}
              onSelectQuestion={handleQuestion}
              onAction={handleAction}
              onUpgradePlan={onUpgradePlan}
            />
          )}
        </>
      )}
    </div>
  );
}

function CoachHeader({ coachStatusLabel, plan, onRefresh }) {
  return (
    <header className="ai-coach-hero-v1">
      <div>
        <div className="ai-coach-eyebrow-v1"><FiZap /> Provider Coach</div>
        <h1>Queless Provider Coach</h1>
        <p>Practical tips to improve your stand, attract customers, and grow bookings.</p>
      </div>
      <div className="ai-coach-hero-actions-v1">
        {coachStatusLabel ? (
          <span className={`ai-coach-status-pill-v1 ${plan || "free"}`}>{coachStatusLabel}</span>
        ) : null}
        {onRefresh ? (
          <button type="button" className="ai-coach-secondary-btn-v1" onClick={onRefresh}>
            <FiRefreshCw /> Refresh
          </button>
        ) : null}
      </div>
    </header>
  );
}
