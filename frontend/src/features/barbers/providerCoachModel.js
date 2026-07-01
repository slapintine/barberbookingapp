const FALLBACK_CATEGORIES = [
  {
    id: "profile_trust",
    label: "Profile improvement",
    questions: [
      { id: "improve_stand", question: "How can I improve my stand?", focus: "profile" },
      { id: "profile_views", question: "Why am I not getting enough profile views?", focus: "visibility" },
      { id: "trust_profile", question: "How can I make customers trust me?", focus: "trust" },
      { id: "photos_to_upload", question: "What photos should I upload?", focus: "photos" },
    ],
  },
  {
    id: "reviews_reputation",
    label: "Reviews & trust",
    questions: [
      { id: "get_reviews", question: "How can I get more reviews?", focus: "reviews" },
      { id: "bad_review_response", question: "How should I respond to a bad review?", focus: "bad_reviews" },
      { id: "improve_rating", question: "How can I improve my rating?", focus: "rating" },
    ],
  },
  {
    id: "bookings_customers",
    label: "Bookings & conversion",
    questions: [
      { id: "get_more_bookings", question: "How can I get more bookings?", focus: "bookings" },
      { id: "views_no_booking", question: "Why are customers not booking after viewing my stand?", focus: "conversion" },
      { id: "repeat_bookings", question: "How can I bring back repeat customers?", focus: "retention" },
      { id: "reduce_cancellations", question: "How can I reduce cancelled bookings?", focus: "cancellations" },
    ],
  },
  {
    id: "pricing_services",
    label: "Services & pricing",
    questions: [
      { id: "clear_prices", question: "Are my prices clear enough?", focus: "pricing" },
      { id: "more_services", question: "Should I add more services?", focus: "services" },
      { id: "package_services", question: "How should I package my services?", focus: "packages" },
    ],
  },
  {
    id: "promotions",
    label: "Visibility & growth",
    questions: [
      { id: "run_promotion", question: "What promotion should I run?", focus: "promotion" },
      { id: "promote_slow_days", question: "How can I promote slow days?", focus: "slow_days" },
      { id: "first_time_customers", question: "How can I attract first-time customers?", focus: "first_time" },
    ],
  },
];

const CATEGORY_LABELS = {
  profile_trust: "Profile improvement",
  reviews_reputation: "Reviews & trust",
  bookings_customers: "Bookings & conversion",
  pricing_services: "Services & pricing",
  promotions: "Visibility & growth",
};

function normalizeQuestion(item, category) {
  return {
    id: String(item?.id || "").trim(),
    question: String(item?.question || "").trim(),
    focus: String(item?.focus || "").trim(),
    category: String(item?.category || category?.id || "general").trim(),
    categoryLabel: String(item?.categoryLabel || category?.label || "Growth questions").trim(),
  };
}

export function normalizeCoachCategories(questionsData) {
  const source = Array.isArray(questionsData?.categories) && questionsData.categories.length
    ? questionsData.categories
    : FALLBACK_CATEGORIES;

  return source
    .map((category) => {
      const resolvedCategory = {
        id: String(category?.id || "general"),
        label: CATEGORY_LABELS[String(category?.id || "")] || String(category?.label || "Growth questions"),
      };
      return {
        ...resolvedCategory,
        questions: (category?.questions || [])
          .map((item) => normalizeQuestion(item, resolvedCategory))
          .filter((item) => item.id && item.question),
      };
    })
    .filter((category) => category.questions.length);
}

function missingChecklistLabels(insights) {
  return (insights?.setupChecklist || [])
    .filter((item) => !item?.complete)
    .map((item) => String(item?.label || "").toLowerCase());
}

function includesSignal(labels, terms) {
  return labels.some((label) => terms.some((term) => label.includes(term)));
}

export function rankProviderCoachQuestions({ questionsData, insights, barber, recentQuestionIds = [] } = {}) {
  const categories = normalizeCoachCategories(questionsData);
  const questions = categories.flatMap((category) => category.questions);
  const missing = missingChecklistLabels(insights);
  const dataQuality = insights?.dataQuality || {};
  const bookings = Number(dataQuality.bookingsCount || 0);
  const completedBookings = Number(dataQuality.completedBookingsCount || 0);
  const reviews = Number(dataQuality.reviewsCount || 0);
  const services = Number(dataQuality.servicesCount || 0);
  const views = Number(barber?.profile_views || barber?.profileViews || barber?.views || 0);
  const rating = Number(barber?.average_rating || barber?.averageRating || barber?.rating || 0);
  const recent = new Set(recentQuestionIds.map(String));
  const servicesMissing = missing.some((label) => label.includes("service") && !label.includes("photo") && !label.includes("price"));

  const score = (item) => {
    let value = 10;
    const reasons = [];
    const boost = (amount, reason) => {
      value += amount;
      if (reason) reasons.push(reason);
    };

    if (recent.has(item.id)) value -= 12;
    if (includesSignal(missing, ["photo", "image"]) && ["photos", "trust", "profile"].includes(item.focus)) {
      boost(item.focus === "photos" ? 50 : 32, "Your stand needs stronger visual trust signals.");
    }
    if (includesSignal(missing, ["price"]) && item.focus === "pricing") {
      boost(36, "Clear prices can remove booking hesitation.");
    }
    if (servicesMissing && ["services", "profile"].includes(item.focus)) {
      boost(32, "Your service list needs attention.");
    }
    if (includesSignal(missing, ["hour", "location"]) && ["profile", "visibility"].includes(item.focus)) {
      boost(30, "Complete availability and location details first.");
    }
    if (reviews < 3 && item.focus === "reviews") {
      boost(34, reviews ? "A few more reviews would strengthen trust." : "Your stand needs its first customer reviews.");
    }
    if (rating > 0 && rating < 4 && ["rating", "bad_reviews"].includes(item.focus)) {
      boost(42, "Your rating needs focused follow-up.");
    }
    if (bookings < 3 && ["bookings", "first_time", "conversion"].includes(item.focus)) {
      boost(30, "Build early booking momentum.");
    }
    if (views >= 8 && views > Math.max(bookings, 1) * 4 && item.focus === "conversion") {
      boost(46, "Customers are viewing your stand without booking.");
    }
    if (completedBookings >= 3 && item.focus === "retention") {
      boost(28, "Recent customers are an opportunity for repeat bookings.");
    }
    if (!services && item.focus === "services") boost(44, "Customers need services they can understand and book.");

    return { ...item, score: value, reason: reasons[0] || "A practical next step for growing your stand." };
  };

  const ranked = questions.map(score).sort((a, b) => b.score - a.score || a.question.localeCompare(b.question));
  return {
    recommended: ranked.slice(0, 3),
    categories,
    all: ranked,
  };
}

export function getCoachFocusAction(focusText) {
  const text = String(focusText || "").toLowerCase();
  if (text.includes("photo") || text.includes("image")) return { label: "Add photos", target: "photos" };
  if (text.includes("price") || text.includes("cost")) return { label: "Review prices", target: "prices" };
  if (text.includes("hour") || text.includes("availability") || text.includes("slot")) return { label: "Update availability", target: "schedule" };
  if (text.includes("review") || text.includes("rating")) return { label: "Review feedback", target: "reviews" };
  if (text.includes("cancel") || text.includes("booking")) return { label: "Review bookings", target: "bookings" };
  if (text.includes("service")) return { label: "Improve services", target: "services" };
  return { label: "Improve stand", target: "profile" };
}

export function getCoachPlanState({ subscription, barber, questionsData } = {}) {
  const apiPlan = String(questionsData?.usage?.plan || "").toUpperCase();
  const tier = apiPlan || String(
    subscription?.tier ||
    subscription?.plan ||
    barber?.subscription?.tier ||
    barber?.subscription_tier ||
    barber?.selected_plan ||
    barber?.current_plan ||
    "FREE"
  ).toUpperCase();
  const status = String(subscription?.status || barber?.subscription_status || "").toLowerCase();
  const explicitlyInactive = ["expired", "cancelled", "inactive", "suspended", "failed"].includes(status);
  const apiAllowed = questionsData?.access?.allowed;
  const paidTier = tier === "PREMIUM" || tier === "PLATINUM";
  const enabled = typeof apiAllowed === "boolean" ? apiAllowed : paidTier && !explicitlyInactive;
  const unlimited = Boolean(questionsData?.usage?.unlimited) || tier === "PLATINUM";
  return {
    tier,
    plan: tier.toLowerCase(),
    enabled,
    unlimited,
    label: unlimited ? "Platinum unlocked" : tier === "PREMIUM" ? "Premium Coach" : "Premium feature",
  };
}

export function getCoachUsageText(usage) {
  if (!usage) return "";
  if (usage.unlimited) return "Unlimited coaching";
  if (usage.plan === "premium") {
    return `${Math.max(Number(usage.remainingThisMonth || 0), 0)} of ${Number(usage.limit || 5)} tips remaining`;
  }
  return "Upgrade to unlock coach advice";
}

export function getProfileCompletion(checklist = []) {
  if (!checklist.length) return 0;
  return Math.round((checklist.filter((item) => item?.complete).length / checklist.length) * 100);
}
