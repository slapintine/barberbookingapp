import { useMemo, useState } from "react";
import {
  FiBarChart2,
  FiCalendar,
  FiDownload,
  FiFlag,
  FiLock,
  FiMessageCircle,
  FiPieChart,
  FiShield,
  FiStar,
  FiTrendingUp,
  FiZap,
  FiX,
} from "react-icons/fi";
import { getPlanFeatures } from "../../utils/subscriptionPlans.js";

const PLAN_RANKS = {
  PRO: 1,
  PREMIUM: 2,
  PLATINUM: 3,
};

const DATE_FILTERS = ["Today", "This week", "This month", "Last 30 days"];
const REVIEW_FILTERS = ["All", 5, 4, 3, 2, 1];
const REVIEW_SORTS = ["Newest", "Oldest", "Highest", "Lowest"];

const POSITIVE_PATTERNS = [
  { label: "Friendly service", terms: ["friendly", "kind", "welcoming", "nice", "respectful"] },
  { label: "Clean environment", terms: ["clean", "hygienic", "fresh", "neat", "organized"] },
  { label: "Good results", terms: ["great", "excellent", "perfect", "sharp", "beautiful", "good results"] },
];

const NEGATIVE_PATTERNS = [
  { label: "Long waiting time", terms: ["late", "delay", "wait", "slow", "waiting"] },
  { label: "Pricing issues", terms: ["expensive", "price", "pricing", "cost", "overcharged"] },
  { label: "Poor communication", terms: ["communication", "rude", "unclear", "reply", "respond"] },
];

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString()}`;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBookingDate(booking) {
  return toDate(booking.dateValue || booking.date || booking.createdAt);
}

function getAverageRating(reviews = []) {
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
  return Number((total / reviews.length).toFixed(1));
}

function getPlanRank(tier) {
  return PLAN_RANKS[String(tier || "").trim().toUpperCase()] || 0;
}

function getEffectivePlan(subscription = {}, barber = {}) {
  const tier = subscription.tier || barber.subscription?.tier || barber.subscription_tier || "";
  const status = String(subscription.status || barber.subscription_status || "").toLowerCase();
  const isTrial = Boolean((subscription.is_trial || status === "trialing" || status === "trial") && (subscription.expires_at || barber.trial_ends_at));
  const trialDaysLeft = Number(subscription.trial_days_left || 0);
  const isActive = status === "active";
  const isExpired = status === "expired" || status === "trial_expired";
  return {
    tier: isTrial ? "TRIAL" : String(tier || "").toUpperCase(),
    paidTier: String(tier || "").toUpperCase(),
    isTrial,
    isActive,
    isExpired,
    status,
    trialDaysLeft,
    rank: isTrial ? 2 : getPlanRank(tier),
    isLocked: !isTrial && getPlanRank(tier) === 0,
  };
}

function filterBookingsByDate(bookings, filter) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30Start = new Date(todayStart);
  last30Start.setDate(todayStart.getDate() - 30);

  return bookings.filter((booking) => {
    const date = getBookingDate(booking);
    if (!date) return false;
    if (filter === "Today") return date >= todayStart && date < todayEnd;
    if (filter === "This week") return date >= weekStart && date <= now;
    if (filter === "This month") return date >= monthStart && date <= now;
    return date >= last30Start && date <= now;
  });
}

function getPaymentType(booking) {
  const method = String(booking.paymentMethod || booking.payment_method || "").toLowerCase();
  if (method.includes("cash")) return "cash";
  if (method.includes("deposit")) return "deposit";
  if (method.includes("mtn") || method.includes("airtel") || method.includes("mobile")) return "mobileMoney";
  return "mobileMoney";
}

function getRatingBreakdown(reviews = []) {
  return [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Math.round(Number(review.rating || 0)) === rating).length,
  }));
}

function scorePatterns(reviews = [], patterns = []) {
  const text = reviews.map((review) => String(review.text || "")).join(" ").toLowerCase();
  return patterns
    .map((pattern) => ({
      label: pattern.label,
      count: pattern.terms.reduce((sum, term) => sum + (text.split(term).length - 1), 0),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function filterAndSortReviews(reviews = [], filter, sort) {
  const filtered = filter === "All"
    ? reviews
    : reviews.filter((review) => Math.round(Number(review.rating || 0)) === Number(filter));

  return [...filtered].sort((a, b) => {
    if (sort === "Oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (sort === "Highest") return Number(b.rating || 0) - Number(a.rating || 0);
    if (sort === "Lowest") return Number(a.rating || 0) - Number(b.rating || 0);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

function MetricCard({ label, value }) {
  return (
    <div className="simple-card-v4 stat-card-v4 reports-metric-v11">
      <div className="stat-value-v4">{value}</div>
      <div className="stat-label-v4">{label}</div>
    </div>
  );
}

function LockedCard({ title, text, onUpgradePlan }) {
  return (
    <section className="simple-card-v4 reports-locked-card-v11">
      <FiLock />
      <strong>{title}</strong>
      <span>{text}</span>
      <button type="button" className="secondary-btn-v4" onClick={onUpgradePlan}>
        {text?.includes("Platinum") ? "Upgrade to Platinum" : "Upgrade to Premium"}
      </button>
    </section>
  );
}

function ReportSection({ title, icon, children, locked, lockText, onUpgradePlan }) {
  if (locked) {
    return <LockedCard title={title} text={lockText || "Unlock advanced insights with Premium."} onUpgradePlan={onUpgradePlan} />;
  }

  return (
    <section className="simple-card-v4 reports-section-v11">
      <div className="profile-section-title-v4">
        {icon} {title}
      </div>
      {children}
    </section>
  );
}

function ReviewCard({ review, reportedReviews, setReportedReviews }) {
  return (
    <div className="profile-review-card-v4 reports-review-card-v10">
      <div className="profile-review-head-v4">
        <strong>{Number(review.rating || 0).toFixed(1)} stars</strong>
        <span className="profile-review-rating-v4">{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : "Recent"}</span>
      </div>
      <div className="profile-review-text-v4">{review.text || "No written review."}</div>
      <div className="reports-review-meta-v10">{review.service || review.serviceName || review.bookingService || "Service not specified"}</div>
      <button
        type="button"
        className="review-report-btn-v7"
        onClick={() => setReportedReviews((prev) => ({ ...prev, [review.id]: true }))}
        disabled={reportedReviews[review.id]}
      >
        <FiFlag /> {reportedReviews[review.id] ? "Reported for moderation" : "Report abuse"}
      </button>
    </div>
  );
}

function buildCoachSuggestions({ profileViews, filteredBookings, completedBookings, cancelledBookings, averageRating, reviews, totalEarnings }) {
  if (!filteredBookings.length) {
    return "Start by adding attractive photos, clear prices, and a promotion to help customers trust your business.";
  }
  if (profileViews > filteredBookings.length * 4) {
    return "Your profile is getting attention, but customers are not booking yet. Add clearer service photos, improve service descriptions, or try a small promotion.";
  }
  if (averageRating && averageRating < 3.5) {
    return "Your rating needs attention. Review customer feedback and improve the areas mentioned most often.";
  }
  if (cancelledBookings.length > completedBookings.length / 2) {
    return "You have several cancelled bookings. Check your availability, response time, and pricing clarity.";
  }
  if (reviews.some((review) => Number(review.rating || 0) >= 4)) {
    return "Customers seem happy with your service. Promote your best-reviewed service this week.";
  }
  if (totalEarnings < 50000) {
    return "Try creating a package offer or highlighting your most popular service.";
  }
  return "Your business has healthy activity. Keep your availability fresh and use a featured promotion to convert more repeat bookings.";
}

export default function ReportsScreen({ barber, reviews = [], bookings = [], subscription: subscriptionProp, onUpgradePlan }) {
  const [dateFilter, setDateFilter] = useState("This month");
  const [showReviews, setShowReviews] = useState(false);
  const [reviewFilter, setReviewFilter] = useState("All");
  const [reviewSort, setReviewSort] = useState("Newest");
  const [reportedReviews, setReportedReviews] = useState({});
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachPrompt, setCoachPrompt] = useState("How can I get more bookings?");

  const subscription = subscriptionProp || barber?.subscription || {};
  const plan = getEffectivePlan(subscription, barber);
  const planFeatures = getPlanFeatures(plan.paidTier || plan.tier);

  const barberBookings = useMemo(
    () => (bookings || []).filter((item) => Number(item.barberId) === Number(barber?.id)),
    [bookings, barber?.id]
  );
  const filteredBookings = useMemo(
    () => filterBookingsByDate(barberBookings, dateFilter),
    [barberBookings, dateFilter]
  );

  if (!barber) {
    return (
      <div className="content-v4 standard-page-v4 reports-page-v9">
        <div className="empty-state-v7">
          <FiStar />
          <strong>No business profile found</strong>
          <span>Create a business before checking reports.</span>
        </div>
      </div>
    );
  }

  if (plan.isLocked) {
    return (
      <div className="content-v4 standard-page-v4 reports-page-v9">
        <section className="simple-card-v4 reports-upgrade-wall-v11">
          <FiLock />
          <div>
            <div className="panel-title-v4">{plan.isExpired ? "Trial expired" : "No active plan"}</div>
            <div className="profile-sub-v4">Choose a plan to activate your business and unlock Business Insights.</div>
          </div>
          <div className="reports-plan-grid-v11">
            <div><strong>PRO</strong><span>UGX 6,000/month</span><small>Basic stats and reviews</small></div>
            <div><strong>PREMIUM</strong><span>UGX 12,000/month</span><small>Full analytics and insights</small></div>
            <div><strong>PLATINUM</strong><span>UGX 24,000/month</span><small>Advanced BI and alerts</small></div>
          </div>
          <button type="button" className="primary-btn-v4" onClick={onUpgradePlan}>Upgrade Plan</button>
        </section>
      </div>
    );
  }

  const completedBookings = filteredBookings.filter((item) => String(item.status || "").toLowerCase() === "completed");
  const cancelledBookings = filteredBookings.filter((item) => ["cancelled", "rejected"].includes(String(item.status || "").toLowerCase()));
  const activeBookings = filteredBookings.filter((item) => !["completed", "cancelled", "rejected"].includes(String(item.status || "").toLowerCase()));
  const totalEarnings = completedBookings.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const averageBookingValue = completedBookings.length ? totalEarnings / completedBookings.length : 0;
  const averageRating = getAverageRating(reviews);
  const profileViews = Number(barber.profile_views || barber.profileViews || barber.views || 0);

  const serviceRows = Object.values(
    filteredBookings.reduce((acc, booking) => {
      const service = booking.service || "Service";
      if (!acc[service]) acc[service] = { service, bookings: 0, earnings: 0, ratingTotal: 0, ratingCount: 0 };
      acc[service].bookings += 1;
      acc[service].earnings += Number(booking.price || 0);
      const serviceReviews = reviews.filter((review) => String(review.service || review.serviceName || "").toLowerCase() === service.toLowerCase());
      serviceReviews.forEach((review) => {
        acc[service].ratingTotal += Number(review.rating || 0);
        acc[service].ratingCount += 1;
      });
      return acc;
    }, {})
  ).sort((a, b) => b.bookings - a.bookings);

  const bestEarningService = [...serviceRows].sort((a, b) => b.earnings - a.earnings)[0];
  const paymentBreakdown = filteredBookings.reduce(
    (acc, booking) => {
      acc[getPaymentType(booking)] += Number(booking.price || 0);
      return acc;
    },
    { cash: 0, mobileMoney: 0, deposit: 0 }
  );
  const ratingBreakdown = getRatingBreakdown(reviews);
  const positives = scorePatterns(reviews, POSITIVE_PATTERNS);
  const complaints = scorePatterns(reviews, NEGATIVE_PATTERNS);
  const reviewList = filterAndSortReviews(reviews, reviewFilter, reviewSort);
  const lowRatings = reviews.filter((review) => Number(review.rating || 0) <= 2).length;
  const weekendBookings = filteredBookings.filter((booking) => {
    const date = getBookingDate(booking);
    return date && [0, 6].includes(date.getDay());
  }).length;

  const suggestions = [
    complaints.some((item) => item.label === "Long waiting time") ? "Reduce waiting time" : null,
    complaints.some((item) => item.label === "Poor communication") ? "Improve communication" : null,
    complaints.some((item) => item.label === "Pricing issues") ? "Adjust pricing" : null,
    activeBookings.length > completedBookings.length ? "Add more service slots" : null,
    profileViews > filteredBookings.length * 4 ? "Improve service descriptions/photos" : null,
  ].filter(Boolean);

  const growthTips = [
    bestEarningService ? `Your top service is ${bestEarningService.service} - promote it` : null,
    profileViews > filteredBookings.length * 4 ? "You have many views but few bookings - improve photos" : null,
    lowRatings ? "Your rating dropped this period - check complaints" : null,
    weekendBookings > filteredBookings.length / 2 ? "Weekend bookings are higher - add more slots" : null,
  ].filter(Boolean);
  const coachSuggestion = buildCoachSuggestions({
    profileViews,
    filteredBookings,
    completedBookings,
    cancelledBookings,
    averageRating,
    reviews,
    totalEarnings,
  });
  const repeatCustomers = new Set(
    filteredBookings
      .map((booking) => booking.customerUsername || booking.customer_username || booking.customerName || booking.customer_name)
      .filter(Boolean)
  );
  const promotionSuggestion = bestEarningService
    ? `Feature ${bestEarningService.service} with a small discount this week.`
    : "Create a starter offer for your most bookable service.";
  const coachPrompts = [
    "How can I get more bookings?",
    "What should I improve this week?",
    "How can I improve my reviews?",
    "How should I price my services?",
    "What promotion should I run?",
  ];

  return (
    <div className="content-v4 standard-page-v4 reports-page-v9 reports-page-v11">
      <header className="reports-header-v11">
        <div>
          <div className="panel-title-v4">Business Insights</div>
          <div className="profile-sub-v4">Track bookings, earnings, reviews, and performance</div>
          {plan.isTrial ? <div className="reports-trial-badge-v11">Trial ends in {plan.trialDaysLeft} days</div> : null}
          <div className="reports-plan-badge-v15">{plan.paidTier || plan.tier} plan</div>
        </div>
        {plan.rank >= 3 ? (
          <button type="button" className="secondary-btn-v4 compact-btn-v4">
            <FiDownload /> Export
          </button>
        ) : (
          <button type="button" className="secondary-btn-v4 compact-btn-v4" onClick={onUpgradePlan}>
            Upgrade
          </button>
        )}
      </header>

      <div className="reports-date-tabs-v11">
        {DATE_FILTERS.map((filter) => (
          <button key={filter} type="button" className={dateFilter === filter ? "filter-btn active" : "filter-btn"} onClick={() => setDateFilter(filter)}>
            {filter}
          </button>
        ))}
      </div>

      <ReportSection title="Performance Summary" icon={<FiTrendingUp />}>
        <div className="dashboard-stats-v4 reports-summary-grid-v11">
          <MetricCard label="Total bookings" value={filteredBookings.length} />
          <MetricCard label="Completed" value={completedBookings.length} />
          <MetricCard label="Cancelled" value={cancelledBookings.length} />
          <MetricCard label="Total earnings" value={formatMoney(totalEarnings)} />
          <MetricCard label="Average rating" value={averageRating ? averageRating.toFixed(1) : "New"} />
          {plan.rank >= 3 ? <MetricCard label="Profile views" value={profileViews || "--"} /> : null}
        </div>
      </ReportSection>

      <ReportSection title="Booking Status" icon={<FiPieChart />}>
        <div className="reports-bars-v9">
          <span style={{ "--bar": `${filteredBookings.length ? (activeBookings.length / filteredBookings.length) * 100 : 0}%` }}>Active <strong>{activeBookings.length}</strong></span>
          <span style={{ "--bar": `${filteredBookings.length ? (completedBookings.length / filteredBookings.length) * 100 : 0}%` }}>Completed <strong>{completedBookings.length}</strong></span>
          <span style={{ "--bar": `${filteredBookings.length ? (cancelledBookings.length / filteredBookings.length) * 100 : 0}%` }}>Cancelled <strong>{cancelledBookings.length}</strong></span>
        </div>
      </ReportSection>

      <ReportSection title="Revenue Insights" icon={<FiBarChart2 />} locked={plan.rank < 2} lockText="Unlock revenue insights with Premium." onUpgradePlan={onUpgradePlan}>
        <div className="reports-info-grid-v11">
          <div><strong>Earnings this month</strong><span>{formatMoney(totalEarnings)}</span></div>
          <div><strong>Average booking value</strong><span>{formatMoney(averageBookingValue)}</span></div>
          <div><strong>Best earning service</strong><span>{bestEarningService?.service || "Not enough data"}</span></div>
        </div>
        <div className="reports-bars-v9">
          <span style={{ "--bar": `${totalEarnings ? (paymentBreakdown.cash / totalEarnings) * 100 : 0}%` }}>Cash <strong>{formatMoney(paymentBreakdown.cash)}</strong></span>
          <span style={{ "--bar": `${totalEarnings ? (paymentBreakdown.mobileMoney / totalEarnings) * 100 : 0}%` }}>Mobile money <strong>{formatMoney(paymentBreakdown.mobileMoney)}</strong></span>
          <span style={{ "--bar": `${totalEarnings ? (paymentBreakdown.deposit / totalEarnings) * 100 : 0}%` }}>Deposit <strong>{formatMoney(paymentBreakdown.deposit)}</strong></span>
        </div>
      </ReportSection>

      <ReportSection title="Service Performance" icon={<FiBarChart2 />} locked={plan.rank < 2} lockText="Unlock service performance insights with Premium." onUpgradePlan={onUpgradePlan}>
        <div className="reports-service-table-v11">
          {serviceRows.slice(0, plan.rank >= 3 ? 12 : 8).map((row) => (
            <div key={row.service}>
              <span>{row.service}</span>
              <strong>{row.bookings} bookings</strong>
              <small>{formatMoney(row.earnings)}</small>
              <small>{row.ratingCount ? `${(row.ratingTotal / row.ratingCount).toFixed(1)} rating` : "No rating"}</small>
            </div>
          ))}
          {!serviceRows.length ? <div className="profile-sub-v4">Service performance appears after bookings are created.</div> : null}
        </div>
      </ReportSection>

      <ReportSection title="Review Summary" icon={<FiStar />}>
        <div className="reports-review-summary-v11">
          <div>
            <div className="reports-rating-hero-v11">
              <FiStar />
              <div>
                <div className="reports-score-v4">{averageRating ? averageRating.toFixed(1) : "0.0"}</div>
                <div className="reports-count-v4">{reviews.length} total reviews</div>
              </div>
            </div>
          </div>
          <div className="reports-bars-v9">
            {ratingBreakdown.map((item) => (
              <span key={item.rating} style={{ "--bar": `${reviews.length ? (item.count / reviews.length) * 100 : 0}%` }}>{item.rating} stars <strong>{item.count}</strong></span>
            ))}
          </div>
          <button type="button" className="secondary-btn-v4 reports-view-reviews-btn-v10" onClick={() => setShowReviews(true)}>
            View All Reviews
          </button>
        </div>
      </ReportSection>

      <ReportSection title="Customer Feedback Insights" icon={<FiStar />} locked={!planFeatures.reviewInsights} lockText="Unlock Review Insights with Premium." onUpgradePlan={onUpgradePlan}>
        <div className="reports-info-grid-v11">
          <div><strong>Most common positives</strong><span>{positives.length ? positives.map((item) => item.label).join(", ") : "Friendly service, Clean environment, Good results"}</span></div>
          <div><strong>Most common complaints</strong><span>{complaints.length ? complaints.map((item) => item.label).join(", ") : "No strong complaint pattern yet"}</span></div>
          <div><strong>Suggested improvement</strong><span>{complaints[0]?.label || "Ask happy customers to mention what they liked most."}</span></div>
          <div><strong>Rating trend</strong><span>{averageRating >= 4 ? "Positive" : averageRating ? "Needs attention" : "Waiting for reviews"}</span></div>
        </div>
        {plan.rank >= 3 ? <p className="reports-ai-note-v15">Customers often mention speed, cleanliness, friendliness, or pricing. Use this to improve your service.</p> : null}
      </ReportSection>

      <ReportSection title="Improvement Suggestions" icon={<FiTrendingUp />} locked={plan.rank < 3} lockText="Unlock improvement suggestions with Platinum." onUpgradePlan={onUpgradePlan}>
        <div className="reports-chip-list-v11">
          {(suggestions.length ? suggestions : ["Improve service descriptions/photos"]).map((item) => <span key={item}>{item}</span>)}
        </div>
      </ReportSection>

      <ReportSection title="Growth Tips" icon={<FiCalendar />} locked={plan.rank < 2} lockText="Unlock growth tips with Premium." onUpgradePlan={onUpgradePlan}>
        <div className="reports-chip-list-v11">
          {(growthTips.length ? growthTips : ["Collect more completed bookings to generate growth tips"]).map((item) => <span key={item}>{item}</span>)}
        </div>
      </ReportSection>

      <ReportSection title="Promotions Performance" icon={<FiTrendingUp />} locked={!planFeatures.promotions} lockText="Unlock promotions with Premium." onUpgradePlan={onUpgradePlan}>
        <div className="reports-info-grid-v11">
          <div><strong>Promotion suggestion</strong><span>{promotionSuggestion}</span></div>
          <div><strong>Best service to promote</strong><span>{bestEarningService?.service || "Not enough booking data yet"}</span></div>
          <div><strong>Repeat customers</strong><span>{repeatCustomers.size} customer{repeatCustomers.size === 1 ? "" : "s"} in this period</span></div>
        </div>
      </ReportSection>

      <ReportSection title="Customer Retention Insights" icon={<FiCalendar />} locked={plan.rank < 2} lockText="Unlock repeat customer insights with Premium." onUpgradePlan={onUpgradePlan}>
        <div className="reports-chip-list-v11">
          <span>{repeatCustomers.size ? "Send repeat-booking reminders to recent customers." : "Collect more bookings to identify repeat customers."}</span>
          <span>{completedBookings.length > 2 ? "Package your most completed services for faster rebooking." : "Complete more bookings to unlock stronger retention signals."}</span>
          {plan.rank >= 3 ? <span>Platinum AI can turn these insights into weekly growth actions.</span> : null}
        </div>
      </ReportSection>

      <ReportSection title="Visibility Boost" icon={<FiZap />} locked={plan.rank < 3} lockText="Unlock Visibility Boost with Platinum." onUpgradePlan={onUpgradePlan}>
        <div className="reports-premium-card-v15">
          <FiShield />
          <div>
            <strong>Platinum Visibility Active</strong>
            <span>Your business is eligible for homepage features, category boosts, map highlights, and top search placement.</span>
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Queless AI Business Coach" icon={<FiMessageCircle />} locked={!planFeatures.aiBusinessCoach} lockText="Unlock AI Business Coach with Platinum." onUpgradePlan={onUpgradePlan}>
        <div className="reports-coach-card-v15">
          <div>
            <strong>Weekly growth focus</strong>
            <span>{coachSuggestion}</span>
          </div>
          <button type="button" className="primary-btn-v4" onClick={() => setCoachOpen(true)}>Ask Queless Coach</button>
          <div className="reports-chip-list-v11">
            {coachPrompts.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </ReportSection>

      {plan.rank < 3 ? (
        <div className="reports-locked-grid-v15">
          {plan.rank < 2 ? <LockedCard title="Advanced Analytics" text="Upgrade to Premium for deeper booking and earnings analytics." onUpgradePlan={onUpgradePlan} /> : null}
          <LockedCard title="AI Weekly Growth Report" text="Unlock weekly AI growth reports with Platinum." onUpgradePlan={onUpgradePlan} />
          <LockedCard title="Homepage Feature" text="Unlock homepage feature placement with Platinum." onUpgradePlan={onUpgradePlan} />
          <LockedCard title="Verified Badge" text="Unlock the Verified badge with Platinum." onUpgradePlan={onUpgradePlan} />
        </div>
      ) : null}

      {showReviews ? (
        <>
          <div className="booking-overlay-v4 open" onClick={() => setShowReviews(false)} />
          <div className="reports-reviews-sheet-v10 open">
            <div className="reports-reviews-card-v10">
              <div className="barber-profile-topbar-v4">
                <button type="button" className="profile-back-btn-v4" onClick={() => setShowReviews(false)}><FiX /></button>
                <div className="profile-top-title-v4">All Reviews</div>
                <span className="profile-back-btn-v4 ghost-spacer-v10" />
              </div>
              <div className="reports-review-controls-v10">
                <div className="filters-v4">
                  {REVIEW_FILTERS.map((filter) => (
                    <button key={filter} type="button" className={reviewFilter === filter ? "filter-btn active" : "filter-btn"} onClick={() => plan.rank >= 2 && setReviewFilter(filter)} disabled={plan.rank < 2 && filter !== "All"}>
                      {filter === "All" ? "All" : `${filter} stars`}
                    </button>
                  ))}
                </div>
                <select className="field-input-v4 profile-input-v4 reports-sort-v10" value={reviewSort} onChange={(event) => setReviewSort(event.target.value)} disabled={plan.rank < 2}>
                  {REVIEW_SORTS.map((sort) => <option key={sort} value={sort}>{sort}</option>)}
                </select>
              </div>
              <div className="reports-review-list-v10">
                {(plan.rank === 1 ? reviewList.slice(0, 8) : reviewList).map((review) => (
                  <ReviewCard key={review.id} review={review} reportedReviews={reportedReviews} setReportedReviews={setReportedReviews} />
                ))}
                {!reviewList.length ? (
                  <div className="empty-state-v7 compact">
                    <FiStar />
                    <strong>No reviews found</strong>
                    <span>Try another rating filter.</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {coachOpen ? (
        <>
          <div className="booking-overlay-v4 open" onClick={() => setCoachOpen(false)} />
          <div className="reports-coach-sheet-v15 open">
            <div className="reports-coach-modal-v15">
              <div className="barber-profile-topbar-v4">
                <button type="button" className="profile-back-btn-v4" onClick={() => setCoachOpen(false)}><FiX /></button>
                <div className="profile-top-title-v4">Queless AI Business Coach</div>
                <span className="profile-back-btn-v4 ghost-spacer-v10" />
              </div>
              <div className="reports-coach-chat-v15">
                <div className="reports-coach-bubble-v15 coach">
                  <strong>Queless Coach</strong>
                  <span>{coachSuggestion}</span>
                </div>
                <div className="reports-chip-list-v11">
                  {coachPrompts.map((prompt) => (
                    <button type="button" key={prompt} onClick={() => setCoachPrompt(prompt)} className={coachPrompt === prompt ? "active" : ""}>
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="reports-coach-bubble-v15 user">
                  <strong>{coachPrompt}</strong>
                  <span>{coachPrompt === "What promotion should I run?" ? promotionSuggestion : coachSuggestion}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
