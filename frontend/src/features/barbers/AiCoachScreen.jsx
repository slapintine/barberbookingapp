import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiArrowRight,
  FiBriefcase,
  FiClock,
  FiMessageCircle,
  FiRefreshCw,
} from "react-icons/fi";
import { getAiCoachInsights, getProviderCoachQuestions, requestProviderCoachAdvice } from "../../api/aiCoachApi.js";
import {
  CoachAnswerCard,
  CoachBusinessSection,
  CoachOpportunitySection,
  CoachProgressCard,
  CoachSetupCard,
  CoachStateCard,
  CoachTopicBrowser,
  LockedFeatureCard,
} from "./ProviderCoachComponents.jsx";
import {
  getCoachFocusAction,
  getCoachPlanState,
  getCoachUsageText,
  getProfileCompletion,
  rankProviderCoachQuestions,
} from "./providerCoachModel.js";

function getStandStatus(barber) {
  if (!barber) return "none";
  const publishedValue = barber.is_published ?? barber.isPublished ?? barber.published;
  return [true, 1, "1", "true", "yes"].includes(publishedValue) ? "live" : "draft";
}

function readRecentQuestions(businessId) {
  if (!businessId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`queless-provider-coach-recent:${businessId}`) || "[]");
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeRecentQuestions(businessId, ids) {
  if (!businessId) return;
  try {
    localStorage.setItem(`queless-provider-coach-recent:${businessId}`, JSON.stringify(ids.slice(0, 5)));
  } catch {
    // Coaching remains fully usable when local storage is unavailable.
  }
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
  const standStatus = useMemo(() => getStandStatus(barber), [barber]);
  const [insightsState, setInsightsState] = useState({ loading: true, error: "", data: null, noBusiness: false });
  const [questionsState, setQuestionsState] = useState({ loading: true, error: "", data: null });
  const [selectedAdvice, setSelectedAdvice] = useState(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [adviceError, setAdviceError] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [recentQuestionIds, setRecentQuestionIds] = useState(() => readRecentQuestions(barber?.id));

  useEffect(() => {
    if (standStatus !== "live") return undefined;
    let cancelled = false;

    setInsightsState((current) => ({ ...current, loading: true, error: "" }));
    setQuestionsState((current) => ({ ...current, loading: true, error: "" }));

    Promise.allSettled([getAiCoachInsights(), getProviderCoachQuestions()]).then(([insightsResult, questionsResult]) => {
      if (cancelled) return;

      if (insightsResult.status === "fulfilled") {
        const value = insightsResult.value;
        setInsightsState({
          loading: false,
          error: "",
          data: value?.businessFound === false ? null : value,
          noBusiness: value?.businessFound === false,
        });
      } else {
        setInsightsState({ loading: false, error: insightsResult.reason?.message || "Insights could not load.", data: null, noBusiness: false });
      }

      if (questionsResult.status === "fulfilled") {
        const value = questionsResult.value;
        setQuestionsState({ loading: false, error: "", data: value?.businessFound === false ? null : value });
      } else {
        setQuestionsState({ loading: false, error: questionsResult.reason?.message || "Coach topics could not load.", data: null });
      }
    });

    return () => { cancelled = true; };
  }, [standStatus, reloadKey]);

  const insights = insightsState.data?.insights || {};
  const dataQuality = insights.dataQuality || {};
  const checklist = insights.setupChecklist || [];
  const completion = getProfileCompletion(checklist);
  const views = Number(barber?.profile_views || barber?.profileViews || barber?.views || 0);
  const focus = insightsState.data?.weeklyGrowthFocus || insights.weeklyInsight?.recommendation || "";
  const focusAction = getCoachFocusAction(focus);
  const usage = selectedAdvice?.usage || questionsState.data?.usage;
  const planState = getCoachPlanState({ subscription, barber, questionsData: questionsState.data });
  const limitReached = usage?.plan === "premium" && Number(usage.remainingThisMonth || 0) <= 0;
  const locked = !planState.enabled;
  const questionModel = useMemo(
    () => rankProviderCoachQuestions({ questionsData: questionsState.data, insights, barber, recentQuestionIds }),
    [questionsState.data, insights, barber, recentQuestionIds]
  );

  const handleAction = (target) => {
    const normalized = String(target || "profile").toLowerCase();
    const messages = {
      schedule: "Opening your business editor to update availability.",
      services: "Opening your business editor to improve services.",
      prices: "Opening your business editor to review service pricing.",
      pricing: "Opening your business editor to review service pricing.",
      profile: "Opening your business editor to complete your stand.",
      photos: "Opening your business editor to add stronger photos.",
      bookings: "Opening bookings to review customer activity.",
      retention: "Opening bookings to find follow-up opportunities.",
      customers: "Opening bookings to find follow-up opportunities.",
      offers: "Opening reports to shape your next offer.",
      reports: "Opening reports to compare performance signals.",
      reviews: "Opening reports to review customer feedback.",
    };
    onShowActionHint?.(messages[normalized] || "Opening the best place to act on this recommendation.");
    if (["reports", "reviews", "offers"].includes(normalized)) onOpenReports?.();
    else if (["bookings", "customers", "retention"].includes(normalized)) onOpenBookings?.();
    else if (normalized === "dashboard") onOpenDashboard?.();
    else onEditProfile?.(normalized);
  };

  const openCoach = () => {
    if (locked || limitReached) {
      onUpgradePlan?.(limitReached ? "PLATINUM" : "PREMIUM");
      return;
    }
    setCoachOpen(true);
    setAdviceError(null);
  };

  async function handleQuestion(questionId) {
    if (loadingAdvice || locked || limitReached) return;
    setCoachOpen(true);
    setSelectedQuestionId(questionId);
    setLoadingAdvice(true);
    setAdviceError(null);
    try {
      const response = await requestProviderCoachAdvice(questionId, barber?.id || null);
      setSelectedAdvice(response);
      setQuestionsState((current) => current.data
        ? { ...current, data: { ...current.data, usage: response.usage } }
        : current);
      setRecentQuestionIds((current) => {
        const next = [String(questionId), ...current.filter((id) => id !== String(questionId))].slice(0, 5);
        writeRecentQuestions(barber?.id, next);
        return next;
      });
    } catch (error) {
      const nextError = {
        code: error?.code || error?.payload?.code || "",
        message: error?.userMessage || error?.message || "Provider Coach could not answer that question.",
      };
      setAdviceError(nextError);
      if (error?.payload?.usage) {
        setQuestionsState((current) => current.data
          ? { ...current, data: { ...current.data, usage: error.payload.usage } }
          : current);
      }
    } finally {
      setLoadingAdvice(false);
    }
  }

  if (standStatus === "none") {
    return (
      <div className="content-v4 app-page-v4 provider-coach-page">
        <CoachStateCard
          icon={<FiBriefcase />}
          title="Create your business stand first"
          description="Provider Coach becomes useful once Queless can read your services, profile, and customer signals."
          actionLabel="Create business stand"
          onAction={() => onEditProfile?.("profile")}
        />
      </div>
    );
  }

  if (standStatus === "draft") {
    return (
      <div className="content-v4 app-page-v4 provider-coach-page">
        <CoachStateCard
          icon={<FiClock />}
          title="Publish your stand to start coaching"
          description="Finish the stand basics and publish it before the coach recommends growth actions."
          actionLabel="Continue stand setup"
          onAction={() => onEditProfile?.("profile")}
        />
      </div>
    );
  }

  return (
    <div className="content-v4 app-page-v4 provider-coach-page">
      <CoachBusinessSection
        planState={planState}
        usage={usage}
        locked={locked}
        loading={insightsState.loading || questionsState.loading}
        focus={focus}
        action={focusAction}
        onOpen={openCoach}
        onUpgrade={() => onUpgradePlan?.(limitReached ? "PLATINUM" : "PREMIUM")}
        onRefresh={() => setReloadKey((value) => value + 1)}
        onAction={handleAction}
      />

      {locked || limitReached ? (
        <LockedFeatureCard limitReached={limitReached} onUpgrade={onUpgradePlan} />
      ) : (
        <>
          {insightsState.loading ? (
            <CoachStateCard
              icon={<FiRefreshCw className="provider-coach-spin" />}
              title="Reading your business signals"
              description="Checking profile quality, bookings, services, reviews, and availability."
            />
          ) : insightsState.error ? (
            <CoachStateCard
              icon={<FiAlertCircle />}
              title="Insights could not load"
              description={insightsState.error}
              actionLabel="Try again"
              onAction={() => setReloadKey((value) => value + 1)}
              tone="error"
            />
          ) : insightsState.noBusiness ? (
            <CoachStateCard
              icon={<FiBriefcase />}
              title="Business data is not available yet"
              description="Save your stand details, then refresh the coach."
              actionLabel="Improve profile"
              onAction={() => handleAction("profile")}
            />
          ) : (
            <>
              <CoachProgressCard completion={completion} dataQuality={dataQuality} views={views} />
              <CoachSetupCard checklist={checklist} onAction={handleAction} />
              <CoachOpportunitySection insights={insights} onAction={handleAction} />
            </>
          )}

          {!coachOpen ? (
            <section className="provider-coach-launch" aria-labelledby="provider-coach-launch-title">
              <div className="provider-coach-launch-copy">
                <span className="provider-coach-kicker"><FiMessageCircle /> Ask the coach</span>
                <h2 id="provider-coach-launch-title">Turn an insight into your next action</h2>
                <p>Start with a recommended question, or open the coach to browse every growth topic.</p>
                <button type="button" className="provider-coach-primary" onClick={openCoach}>
                  Open Coach <FiArrowRight />
                </button>
              </div>
              <div className="provider-coach-launch-prompts">
                {questionModel.recommended.map((item, index) => (
                  <button type="button" key={item.id} onClick={() => handleQuestion(item.id)} disabled={questionsState.loading}>
                    <span>{index === 0 ? "Recommended first" : item.categoryLabel}</span>
                    <strong>{item.question}</strong>
                    <FiArrowRight />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="provider-coach-conversation" aria-labelledby="provider-coach-conversation-title">
              <div className="provider-coach-conversation-head">
                <div>
                  <span className="provider-coach-kicker"><FiMessageCircle /> Coach workspace</span>
                  <h2 id="provider-coach-conversation-title">What would you like to improve?</h2>
                  <p>Choose a focused question. The coach will use the Queless signals currently available for your stand.</p>
                </div>
                {usage ? <span className="provider-coach-usage">{getCoachUsageText(usage)}</span> : null}
              </div>

              {questionsState.error ? (
                <CoachStateCard
                  icon={<FiAlertCircle />}
                  title="Coach topics could not load"
                  description={questionsState.error}
                  actionLabel="Try again"
                  onAction={() => setReloadKey((value) => value + 1)}
                  tone="error"
                />
              ) : (
                <CoachTopicBrowser
                  model={questionModel}
                  selectedQuestionId={selectedQuestionId}
                  recentQuestionIds={recentQuestionIds}
                  disabled={questionsState.loading || loadingAdvice}
                  onSelectQuestion={handleQuestion}
                />
              )}

              <CoachAnswerCard advice={selectedAdvice} loading={loadingAdvice} error={adviceError} onAction={handleAction} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
