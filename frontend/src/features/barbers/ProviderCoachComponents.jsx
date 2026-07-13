import { useState } from "react";
import {
  FiArrowRight,
  FiBarChart2,
  FiCamera,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiDollarSign,
  FiGrid,
  FiLock,
  FiMessageCircle,
  FiRefreshCw,
  FiStar,
  FiTrendingUp,
  FiUserCheck,
  FiZap,
} from "react-icons/fi";
import { getCoachUsageText } from "./providerCoachModel.js";
import "./AiCoachScreen.css";

const CATEGORY_ICONS = {
  profile_trust: FiUserCheck,
  reviews_reputation: FiStar,
  bookings_customers: FiBarChart2,
  pricing_services: FiDollarSign,
  promotions: FiTrendingUp,
};

export function CoachStateCard({ icon, title, description, actionLabel, onAction, tone = "neutral" }) {
  return (
    <section className={`provider-coach-state provider-coach-state--${tone}`} role={tone === "error" ? "alert" : undefined}>
      <span className="provider-coach-state-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel ? (
        <button type="button" className="provider-coach-secondary" onClick={onAction}>
          {actionLabel} <FiArrowRight />
        </button>
      ) : null}
    </section>
  );
}

export function CoachBusinessSection({
  planState,
  usage,
  locked,
  loading,
  focus,
  action,
  onOpen,
  onUpgrade,
  onRefresh,
  onAction,
}) {
  const usageText = getCoachUsageText(usage);

  return (
    <section className="qpc-business-section" aria-labelledby="qpc-business-title">
      <div className="qpc-business-pill">
        <FiZap /> Built for your business
      </div>

      <article className="qpc-business-card qpc-business-card--coach">
        <span className="qpc-business-icon" aria-hidden="true">
          <FiZap />
        </span>
        <div className="qpc-business-copy">
          <h1 id="qpc-business-title">Queless Provider Coach</h1>
          <p>Get practical guidance to improve your stand, attract more customers, and turn attention into bookings.</p>
        </div>
        <div className="qpc-business-actions">
          <button type="button" className="qpc-business-primary" onClick={locked ? onUpgrade : onOpen}>
            {locked ? "Upgrade to Platinum" : "Open Coach"} <FiArrowRight />
          </button>
          {onRefresh ? (
            <button type="button" className="qpc-business-secondary" onClick={onRefresh} disabled={loading}>
              <FiRefreshCw className={loading ? "provider-coach-spin" : ""} /> Refresh insights
            </button>
          ) : null}
        </div>
        <div className="qpc-business-plan">
        <span className="qpc-business-chip">
            <FiCheck /> {planState?.label || "Platinum feature"}
          </span>
          <strong>{planState?.unlimited ? "Unlimited guidance" : usageText || "Personalized growth guidance"}</strong>
          <small>{planState?.unlimited ? "Ask the coach whenever you need a next step." : "Provider Coach is included with Platinum Provider."}</small>
        </div>
      </article>

      <article className="qpc-business-card qpc-business-card--recommendation">
        <span className="qpc-business-icon" aria-hidden="true">
          <FiTrendingUp />
        </span>
        <div className="qpc-business-copy">
          <span className="qpc-business-label">Recommended Next Step</span>
          <h2>
            {locked
              ? "Unlock guidance tailored to your stand"
              : loading
              ? "Reading your stand signals…"
              : focus || "Keep your profile, availability, and services fresh this week."}
          </h2>
          <p>{locked ? "Provider Coach is included with Platinum Provider." : "One focused improvement is easier to complete—and easier to measure."}</p>
        </div>
        {!locked && !loading && action ? (
          <button type="button" className="qpc-business-review" onClick={() => onAction?.(action.target)}>
            {action.label} <FiArrowRight />
          </button>
        ) : null}
      </article>
    </section>
  );
}

export function CoachProgressCard({ completion, dataQuality = {}, views = 0 }) {
  const metrics = [
    { label: "Bookings", value: Number(dataQuality.bookingsCount || 0), icon: FiClock },
    { label: "Reviews", value: Number(dataQuality.reviewsCount || 0), icon: FiStar },
    { label: "Services", value: Number(dataQuality.servicesCount || 0), icon: FiGrid },
    ...(views > 0 ? [{ label: "Stand views", value: views, icon: FiBarChart2 }] : []),
  ];
  return (
    <section className="provider-coach-progress" aria-labelledby="provider-coach-progress-title">
      <div className="provider-coach-section-heading">
        <div>
          <span>Your business signals</span>
          <h2 id="provider-coach-progress-title">Stand readiness</h2>
        </div>
        <strong>{completion}%</strong>
      </div>
      <div className="provider-coach-progress-track" aria-label={`${completion}% profile readiness`}>
        <span style={{ width: `${Math.min(Math.max(completion, 0), 100)}%` }} />
      </div>
      <div className="provider-coach-metric-grid">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <Icon />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CoachSetupCard({ checklist = [], onAction }) {
  const missing = checklist.filter((item) => !item?.complete);
  if (!missing.length) return null;
  return (
    <section className="provider-coach-setup">
      <div>
        <span className="provider-coach-kicker"><FiCheckCircle /> Profile foundation</span>
        <h2>Complete the basics for sharper advice</h2>
        <p>The coach becomes more useful as your stand collects complete profile and customer signals.</p>
        <button type="button" className="provider-coach-secondary" onClick={() => onAction?.("profile")}>
          Improve profile <FiArrowRight />
        </button>
      </div>
      <div className="provider-coach-checklist">
        {checklist.map((item) => (
          <span key={item.label} className={item.complete ? "is-complete" : ""}>
            {item.complete ? <FiCheckCircle /> : <FiCamera />} {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function OpportunityCard({ item, label, icon: Icon, onAction }) {
  if (!item) return null;
  return (
    <article className="provider-coach-opportunity">
      <div className="provider-coach-opportunity-top">
        <span><Icon /></span>
        <small>{label}</small>
      </div>
      <h3>{item.headline}</h3>
      <p>{String(item.recommendation || "").replace(/^Do this next:\s*/i, "")}</p>
      {item.actionLabel ? (
        <button type="button" onClick={() => onAction?.(item.actionTarget)}>
          {item.actionLabel} <FiArrowRight />
        </button>
      ) : null}
    </article>
  );
}

export function CoachOpportunitySection({ insights, onAction }) {
  const opportunities = [
    { item: insights?.weeklyInsight, label: "Priority insight", icon: FiTrendingUp },
    { item: insights?.profileFixes?.[0], label: "Profile improvement", icon: FiUserCheck },
    { item: insights?.reviewSummary, label: "Reviews & trust", icon: FiStar },
    { item: insights?.bookingOpportunities?.[0], label: "Booking opportunity", icon: FiBarChart2 },
    { item: insights?.pricingSuggestions?.[0], label: "Pricing clarity", icon: FiDollarSign },
  ].filter(({ item }) => item).slice(0, 3);

  if (!opportunities.length) return null;
  return (
    <section className="provider-coach-opportunities" aria-labelledby="provider-coach-opportunities-title">
      <div className="provider-coach-section-heading">
        <div>
          <span>Growth opportunities</span>
          <h2 id="provider-coach-opportunities-title">What deserves attention</h2>
        </div>
        <p>Prioritized from the signals currently available.</p>
      </div>
      <div className="provider-coach-opportunity-grid">
        {opportunities.map((entry) => (
          <OpportunityCard key={`${entry.label}-${entry.item.headline}`} {...entry} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}

export function LockedFeatureCard({ limitReached, onUpgrade }) {
  return (
    <section className="provider-coach-locked">
      <span className="provider-coach-locked-icon"><FiLock /></span>
      <div>
        <span className="provider-coach-kicker">{limitReached ? "Coach limit reached" : "Platinum growth tool"}</span>
        <h2>{limitReached ? "Keep coaching without limits" : "Turn business signals into clear next steps"}</h2>
        <p>{limitReached ? "Platinum keeps Provider Coach guidance available." : "Provider Coach is included with Platinum Provider."}</p>
      </div>
      <div className="provider-coach-locked-perks">
        <span><FiBarChart2 /> Booking opportunities</span>
        <span><FiStar /> Review strategy</span>
        <span><FiUserCheck /> Profile trust</span>
      </div>
      <button type="button" className="provider-coach-primary" onClick={() => onUpgrade?.("PLATINUM")}>
        Upgrade to Platinum <FiArrowRight />
      </button>
    </section>
  );
}

export function CoachTopicBrowser({ model, selectedQuestionId, recentQuestionIds = [], disabled, onSelectQuestion }) {
  const initialCategory = model?.recommended?.[0]?.category || model?.categories?.[0]?.id || "";
  const [openCategory, setOpenCategory] = useState(initialCategory);
  const recent = new Set(recentQuestionIds.map(String));

  return (
    <div className="provider-coach-topics">
      <section className="provider-coach-recommended" aria-labelledby="provider-coach-recommended-title">
        <div className="provider-coach-section-heading">
          <div>
            <span>Recommended for you</span>
            <h2 id="provider-coach-recommended-title">Start with one of these</h2>
          </div>
        </div>
        <div className="provider-coach-recommended-grid">
          {(model?.recommended || []).map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={selectedQuestionId === item.id ? "is-selected" : ""}
              onClick={() => onSelectQuestion?.(item.id)}
              disabled={disabled}
            >
              <span>{index === 0 ? "Best next question" : item.categoryLabel}</span>
              <strong>{item.question}</strong>
              <small>{item.reason}</small>
              <FiArrowRight />
            </button>
          ))}
        </div>
      </section>

      <section className="provider-coach-topic-library" aria-labelledby="provider-coach-topic-library-title">
        <div className="provider-coach-section-heading">
          <div>
            <span>More topics</span>
            <h2 id="provider-coach-topic-library-title">Explore by goal</h2>
          </div>
        </div>
        <div className="provider-coach-topic-groups">
          {(model?.categories || []).map((category) => {
            const Icon = CATEGORY_ICONS[category.id] || FiMessageCircle;
            const expanded = openCategory === category.id;
            return (
              <article className={`provider-coach-topic-group ${expanded ? "is-open" : ""}`} key={category.id}>
                <button
                  type="button"
                  className="provider-coach-topic-toggle"
                  onClick={() => setOpenCategory(expanded ? "" : category.id)}
                  aria-expanded={expanded}
                >
                  <span><Icon /></span>
                  <div><strong>{category.label}</strong><small>{category.questions.length} questions</small></div>
                  <FiChevronDown />
                </button>
                {expanded ? (
                  <div className="provider-coach-topic-questions">
                    {category.questions.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={selectedQuestionId === item.id ? "is-selected" : ""}
                        onClick={() => onSelectQuestion?.(item.id)}
                        disabled={disabled}
                      >
                        <span>{item.question}</span>
                        {recent.has(item.id) ? <small>Recent</small> : <FiArrowRight />}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function CoachAnswerCard({ advice, loading, error, onAction }) {
  if (loading) {
    return (
      <div className="provider-coach-answer provider-coach-answer--loading" role="status">
        <FiRefreshCw className="provider-coach-spin" />
        <div><strong>Building your recommendation…</strong><span>Reviewing your profile, bookings, reviews, and service signals.</span></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="provider-coach-answer provider-coach-answer--error" role="alert">
        <FiMessageCircle />
        <div><strong>Coach advice is unavailable</strong><span>{error.message || "Please try another question in a moment."}</span></div>
      </div>
    );
  }
  if (!advice) {
    return (
      <div className="provider-coach-answer provider-coach-answer--empty">
        <FiMessageCircle />
        <div><strong>Choose a question to begin</strong><span>Your answer will appear here with practical next steps.</span></div>
      </div>
    );
  }
  const actions = advice.actionSteps || advice.recommendedActions || [];
  return (
    <article className="provider-coach-answer provider-coach-answer--ready" aria-live="polite">
      <div className="provider-coach-answer-head">
        <span><FiZap /></span>
        <div>
          <small>Coach recommendation</small>
          <h2>{advice.title || advice.question}</h2>
        </div>
        {advice.priority ? <strong className={`provider-coach-priority provider-coach-priority--${String(advice.priority).toLowerCase()}`}>{advice.priority} priority</strong> : null}
      </div>
      <p>{advice.summary || advice.advice}</p>
      {advice.insights?.length ? (
        <div className="provider-coach-answer-list">
          <strong>What the coach noticed</strong>
          {advice.insights.slice(0, 4).map((item) => <span key={item}><FiCheck /> {item}</span>)}
        </div>
      ) : null}
      {actions.length ? (
        <div className="provider-coach-answer-list">
          <strong>Do this next</strong>
          {actions.slice(0, 5).map((item) => <span key={item}><FiArrowRight /> {item}</span>)}
        </div>
      ) : null}
      {(advice.recommendedNextAction?.label || advice.actionLabel) ? (
        <button type="button" className="provider-coach-primary" onClick={() => onAction?.(advice.recommendedNextAction?.target || advice.actionTarget)}>
          {advice.recommendedNextAction?.label || advice.actionLabel} <FiArrowRight />
        </button>
      ) : null}
    </article>
  );
}

export function ProviderCoachPreviewCard({ loading, focus, planState, usage, locked, limitReached, questionModel, onOpen, onUpgrade }) {
  return (
    <div className={`provider-coach-preview ${locked ? "is-locked" : ""}`}>
      <div className="provider-coach-preview-head">
        <div className="provider-coach-preview-brand"><span><FiZap /></span><div><strong>Queless Provider Coach</strong><small>Practical guidance for your next growth move</small></div></div>
        <span className={`provider-coach-plan-chip provider-coach-plan-chip--${planState?.plan || "free"}`}>{planState?.label}</span>
      </div>
      <div className="provider-coach-preview-focus">
        <span>{locked ? "Platinum coaching" : "Recommended next step"}</span>
        <h3>{locked ? "Turn your business signals into clear growth actions." : loading ? "Reading your stand signals…" : focus}</h3>
      </div>
      {!locked && !limitReached && questionModel?.recommended?.length ? (
        <div className="provider-coach-preview-topics">
          {questionModel.recommended.slice(0, 3).map((item) => (
            <button type="button" key={item.id} onClick={onOpen}>
              <small>{item.categoryLabel}</small><strong>{item.question}</strong><FiArrowRight />
            </button>
          ))}
        </div>
      ) : null}
      <div className="provider-coach-preview-actions">
        <button type="button" className="provider-coach-primary" onClick={locked || limitReached ? () => onUpgrade?.("PLATINUM") : onOpen}>
          {limitReached ? "Upgrade to Platinum" : locked ? "Upgrade to Platinum" : "Open Coach"} <FiArrowRight />
        </button>
        {!locked && usage?.plan === "premium" ? <span>{getCoachUsageText(usage)}</span> : null}
      </div>
    </div>
  );
}
