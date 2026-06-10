import { all, get, transaction } from "../db/query.js";
import { buildRuleBasedInsights } from "./insightRules.js";
import { getProviderCoachPlan, getLatestProviderSubscription } from "./providerSubscriptionAccess.js";

export const PREMIUM_MONTHLY_COACH_LIMIT = 5;

export const PROVIDER_COACH_CATEGORIES = [
  {
    id: "profile_trust",
    label: "Profile & Trust",
    questions: [
      { id: "improve_stand", question: "How can I improve my stand?", focus: "profile" },
      { id: "profile_views", question: "Why am I not getting enough profile views?", focus: "visibility" },
      { id: "trust_profile", question: "How can I make customers trust me?", focus: "trust" },
      { id: "photos_to_upload", question: "What photos should I upload?", focus: "photos" },
    ],
  },
  {
    id: "bookings_customers",
    label: "Bookings & Customers",
    questions: [
      { id: "get_more_bookings", question: "How can I get more bookings?", focus: "bookings" },
      { id: "views_no_booking", question: "Why are customers not booking after viewing my stand?", focus: "conversion" },
      { id: "repeat_bookings", question: "How can I bring back repeat customers?", focus: "retention" },
      { id: "reduce_cancellations", question: "How can I reduce cancelled bookings?", focus: "cancellations" },
    ],
  },
  {
    id: "pricing_services",
    label: "Pricing & Services",
    questions: [
      { id: "clear_prices", question: "Are my prices clear enough?", focus: "pricing" },
      { id: "more_services", question: "Should I add more services?", focus: "services" },
      { id: "package_services", question: "How should I package my services?", focus: "packages" },
      { id: "promote_service", question: "What service should I promote this week?", focus: "service_promotion" },
    ],
  },
  {
    id: "reviews_reputation",
    label: "Reviews & Reputation",
    questions: [
      { id: "get_reviews", question: "How can I get more reviews?", focus: "reviews" },
      { id: "bad_review_response", question: "How should I respond to a bad review?", focus: "bad_reviews" },
      { id: "improve_rating", question: "How can I improve my rating?", focus: "rating" },
    ],
  },
  {
    id: "promotions",
    label: "Promotions",
    questions: [
      { id: "run_promotion", question: "What promotion should I run?", focus: "promotion" },
      { id: "promote_slow_days", question: "How can I promote slow days?", focus: "slow_days" },
      { id: "first_time_customers", question: "How can I attract first-time customers?", focus: "first_time" },
    ],
  },
];

export const PROVIDER_COACH_QUESTIONS = PROVIDER_COACH_CATEGORIES.flatMap((category) =>
  category.questions.map((question) => ({ ...question, category: category.id, categoryLabel: category.label }))
);

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function getQuestion(questionId) {
  const id = String(questionId || "").trim();
  return PROVIDER_COACH_QUESTIONS.find((item) => item.id === id) || null;
}

function formatUsage(access, usedThisMonth = 0) {
  if (access.plan === "platinum") {
    return {
      plan: "platinum",
      limit: null,
      usedThisMonth: 0,
      remainingThisMonth: null,
      unlimited: true,
    };
  }

  if (access.plan === "premium") {
    const used = Number(usedThisMonth || 0);
    return {
      plan: "premium",
      limit: PREMIUM_MONTHLY_COACH_LIMIT,
      usedThisMonth: used,
      remainingThisMonth: Math.max(PREMIUM_MONTHLY_COACH_LIMIT - used, 0),
      unlimited: false,
    };
  }

  return {
    plan: "free",
    limit: 0,
    usedThisMonth: 0,
    remainingThisMonth: 0,
    unlimited: false,
  };
}

function getPortfolioCount(business) {
  try {
    const parsed = JSON.parse(business?.portfolio_json || "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function getServicePriceLabel(service) {
  const fixed = Number(service?.price_extra || service?.price || 0);
  const min = Number(service?.min_price || 0);
  const max = Number(service?.max_price || 0);
  const starting = Number(service?.starting_price || 0);
  const pricingType = String(service?.pricing_type || "").toLowerCase();
  if (pricingType === "quote") return "Quote required";
  if (min > 0 && max >= min) return "range";
  if (starting > 0) return "starting";
  if (fixed > 0) return "fixed";
  return "";
}

function reviewThemes(reviews, terms) {
  const text = reviews.map((review) => String(review.review_text || "")).join(" ").toLowerCase();
  return terms
    .map((item) => ({
      label: item.label,
      count: item.terms.reduce((sum, term) => sum + (text.split(term).length - 1), 0),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function buildCoachStats({ business, services, schedule, bookings, reviews }) {
  const completedBookings = bookings.filter((booking) => String(booking.status || "").toLowerCase() === "completed");
  const cancelledBookings = bookings.filter((booking) => ["cancelled", "rejected", "no_show"].includes(String(booking.status || "").toLowerCase()));
  const averageRating = reviews.length
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1))
    : 0;
  const portfolioCount = getPortfolioCount(business);
  const pricedServices = services.filter((service) => getServicePriceLabel(service));
  const servicesWithDescriptions = services.filter((service) => String(service.description || "").trim().length >= 20);
  const servicePhotos = services.filter((service) => service.image).length;
  const openDays = schedule.filter((day) => Number(day.is_open ?? day.open ?? 0) === 1);
  const hasLocation = Boolean(business.location && (business.latitude || business.longitude));
  const hasBusinessPhoto = Boolean(business.image);
  const hasHours = openDays.length > 0;
  const visibility = String(business.business_status || "").toLowerCase() === "active" && Number(business.is_published || 0) === 1
    ? "published"
    : "limited";
  const checklist = [
    hasBusinessPhoto,
    hasLocation,
    hasHours,
    services.length >= 3,
    pricedServices.length === services.length && services.length > 0,
    servicePhotos > 0 || portfolioCount >= 3,
  ];
  const profileCompleteness = Math.round((checklist.filter(Boolean).length / checklist.length) * 100);
  const positives = reviewThemes(reviews, [
    { label: "friendly service", terms: ["friendly", "kind", "welcoming", "nice", "respectful"] },
    { label: "fast service", terms: ["fast", "quick", "speed", "on time"] },
    { label: "clean work", terms: ["clean", "neat", "fresh", "hygienic"] },
  ]);
  const negatives = reviewThemes(reviews, [
    { label: "waiting time", terms: ["wait", "late", "delay", "slow"] },
    { label: "pricing concern", terms: ["price", "expensive", "cost", "overcharged"] },
    { label: "communication", terms: ["reply", "respond", "communication", "rude"] },
  ]);

  return {
    bookingsCount: bookings.length,
    completedBookingsCount: completedBookings.length,
    cancelledBookingsCount: cancelledBookings.length,
    reviewsCount: reviews.length,
    averageRating,
    servicesCount: services.length,
    pricedServicesCount: pricedServices.length,
    servicesWithDescriptionsCount: servicesWithDescriptions.length,
    photosCount: Number(Boolean(business.image)) + portfolioCount + servicePhotos,
    portfolioCount,
    servicePhotosCount: servicePhotos,
    hasBusinessPhoto,
    hasLocation,
    hasHours,
    profileCompleteness,
    visibility,
    positives,
    negatives,
  };
}

async function getCoachData(business) {
  const businessId = Number(business?.id || 0);
  const [services, schedule, bookings, reviews] = await Promise.all([
    all(`SELECT * FROM barber_services WHERE barber_id = ? ORDER BY category ASC, service_name ASC LIMIT 80`, [businessId]),
    all(`SELECT * FROM barber_schedule WHERE barber_id = ? ORDER BY day_of_week ASC`, [businessId]),
    all(`SELECT * FROM bookings WHERE barber_id = ? ORDER BY booking_date DESC, booking_time DESC, id DESC LIMIT 250`, [businessId]),
    all(`SELECT * FROM reviews WHERE barber_id = ? AND COALESCE(blocked_from_public, 0) = 0 ORDER BY created_at DESC, id DESC LIMIT 100`, [businessId]),
  ]);

  return {
    business,
    services,
    schedule,
    bookings,
    reviews,
    stats: buildCoachStats({ business, services, schedule, bookings, reviews }),
  };
}

export async function getAiCoachInsightsForBusiness(business) {
  const data = await getCoachData(business);
  return {
    mode: "rules",
    weeklyGrowthFocus: getWeeklyGrowthFocusFromStats(data.stats),
    insights: buildRuleBasedInsights(data),
  };
}

export async function getOwnedAiCoachBusiness(userId, requestedBusinessId = null) {
  const ownerId = Number(userId || 0);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    const error = new Error("Please log in to use Queless Provider Coach.");
    error.statusCode = 401;
    throw error;
  }

  // A stand is only treated as genuinely deleted when it was hidden by the
  // owner (business_status = 'deleted' AND is_published = 0). A still-published
  // stand must always be reachable here, even if a stale deleted_at timestamp
  // lingers from an earlier delete/re-publish cycle — otherwise the coach
  // wrongly reports "Business data not yet available" for a live stand.
  const notGenuinelyDeleted =
    "NOT (LOWER(COALESCE(business_status, '')) = 'deleted' AND COALESCE(is_published, 0) = 0)";
  const businessId = Number(requestedBusinessId || 0);
  const business = Number.isInteger(businessId) && businessId > 0
    ? await get(
        `SELECT * FROM barbers WHERE id = ? AND owner_user_id = ? AND ${notGenuinelyDeleted}`,
        [businessId, ownerId]
      )
    : await get(
        `SELECT * FROM barbers
         WHERE owner_user_id = ? AND ${notGenuinelyDeleted}
         ORDER BY COALESCE(is_published, 0) DESC, id DESC
         LIMIT 1`,
        [ownerId]
      );

  if (!business) {
    const error = new Error("Create your provider profile before using Queless Provider Coach.");
    error.statusCode = 404;
    throw error;
  }

  return business;
}

export async function getProviderCoachAccess(business) {
  const subscription = await getLatestProviderSubscription(business.id);
  const access = getProviderCoachPlan(business, subscription);
  return { subscription, access };
}

export async function getProviderCoachQuestions({ business }) {
  const { access } = await getProviderCoachAccess(business);
  const range = monthRange();
  const usedThisMonth = access.plan === "premium"
    ? Number((await get(
        `SELECT COUNT(*) AS count FROM provider_coach_usage WHERE barber_id = ? AND usage_date >= ? AND usage_date < ?`,
        [business.id, range.start, range.end]
      ))?.count || 0)
    : 0;

  return {
    questions: PROVIDER_COACH_QUESTIONS,
    categories: PROVIDER_COACH_CATEGORIES,
    access: {
      allowed: access.plan !== "free" && access.active,
      upgradeRequired: access.plan === "free" || !access.active,
    },
    usage: formatUsage(access, usedThisMonth),
  };
}

function addUnique(list, item) {
  if (item && !list.includes(item)) list.push(item);
}

function buildDefaultAdvice(stats) {
  const insights = [];
  const actions = [];

  if (!stats.bookingsCount) {
    addUnique(insights, "No recent booking history is available yet, so this advice uses Queless profile best practices.");
    addUnique(actions, "Complete the stand basics before promoting: location, hours, services, prices, and photos.");
  }
  if (!stats.reviewsCount) {
    addUnique(insights, "No public reviews are available yet.");
    addUnique(actions, "After completed bookings, ask happy customers to leave honest reviews.");
  }
  if (stats.profileCompleteness < 80) {
    addUnique(insights, `Your profile readiness is about ${stats.profileCompleteness}%.`);
    addUnique(actions, "Improve the incomplete profile items first because customers decide quickly from the stand page.");
  }

  return { insights, actions };
}

function getPriority(stats, focus) {
  if (!stats.hasBusinessPhoto || stats.photosCount < 3 || !stats.servicesCount || stats.pricedServicesCount < stats.servicesCount) return "High";
  if (!stats.hasLocation || !stats.hasHours || stats.reviewsCount < 3 || stats.bookingsCount < 3) return "Medium";
  if (focus === "cancellations" && stats.cancelledBookingsCount > Math.max(1, stats.completedBookingsCount / 2)) return "High";
  if (stats.averageRating > 0 && stats.averageRating < 4) return "High";
  return "Low";
}

function getRecommendedNextAction(question, stats) {
  if (!stats.hasBusinessPhoto || stats.photosCount < 3 || question.focus === "photos") return { label: "Add Photos", target: "photos" };
  if (!stats.servicesCount || question.focus === "services") return { label: "Add Services", target: "services" };
  if (stats.pricedServicesCount < stats.servicesCount || question.focus === "pricing") return { label: "Update Service Prices", target: "prices" };
  if (!stats.hasLocation) return { label: "Update Location", target: "profile" };
  if (!stats.hasHours) return { label: "Update Opening Hours", target: "schedule" };
  if (["reviews", "bad_reviews", "rating"].includes(question.focus)) return { label: "Review Customer Feedback", target: "reviews" };
  if (["promotion", "slow_days", "first_time", "service_promotion"].includes(question.focus)) return { label: "Create a Promotion", target: "offers" };
  if (["retention", "cancellations"].includes(question.focus)) return { label: "Review Bookings", target: "bookings" };
  return { label: "Improve My Stand", target: "profile" };
}

export function getWeeklyGrowthFocusFromStats(stats) {
  if (!stats.hasBusinessPhoto) return "Add a clear main photo so customers can quickly see that your stand is real and active.";
  if (stats.photosCount < 3) return "Upload at least 3 real photos of your work, shop, team, or tools to build customer trust.";
  if (!stats.servicesCount) return "Add your main services so customers know exactly what they can book.";
  if (stats.pricedServicesCount < stats.servicesCount) return "Add clear service prices so customers can decide without guessing the cost.";
  if (!stats.hasLocation) return "Add your location or service area so nearby customers can find and trust your stand.";
  if (!stats.hasHours) return "Complete your opening hours so customers know when they can book you.";
  if (stats.reviewsCount < 3) return "Ask happy customers for short reviews and reply politely to every new review.";
  if (stats.completedBookingsCount < 3) return "Create a simple first-time customer promotion to increase bookings this week.";
  if (stats.cancelledBookingsCount > Math.max(1, stats.completedBookingsCount / 2)) return "Review your availability and confirm bookings quickly to reduce cancellations.";
  return "Keep prices, photos, hours, and review replies fresh, then promote your strongest service this week.";
}

function buildQuestionAdvice(question, data, access) {
  const { stats, services } = data;
  const insights = [];
  const recommendedActions = [];
  const defaults = buildDefaultAdvice(stats);

  defaults.insights.forEach((item) => addUnique(insights, item));
  defaults.actions.forEach((item) => addUnique(recommendedActions, item));

  if (stats.averageRating > 0) addUnique(insights, `Your average rating is ${stats.averageRating.toFixed(1)} from ${stats.reviewsCount} review${stats.reviewsCount === 1 ? "" : "s"}.`);
  if (stats.bookingsCount) addUnique(insights, `Recent booking sample: ${stats.bookingsCount} total, ${stats.completedBookingsCount} completed, ${stats.cancelledBookingsCount} cancelled/rejected/no-show.`);
  if (stats.negatives.length) addUnique(insights, `Negative review theme detected: ${stats.negatives[0].label}.`);
  if (stats.positives.length) addUnique(insights, `Positive review theme detected: ${stats.positives[0].label}.`);

  switch (question.focus) {
    case "bookings":
    case "conversion":
      if (stats.bookingsCount < 3 && stats.profileCompleteness < 80) {
        addUnique(recommendedActions, "Finish profile completeness before changing prices or running promotions.");
      }
      if (stats.bookingsCount < 3 && stats.reviewsCount >= 2 && stats.averageRating >= 4) {
        addUnique(recommendedActions, "Your reviews are strong, so improve visibility with accurate hours, more service categories, and fresh photos.");
      }
      if (!stats.hasHours) addUnique(recommendedActions, "Add accurate opening and closing hours so customers know when they can book.");
      if (stats.servicesCount < 3) addUnique(recommendedActions, "Add complete service options with clear names and prices.");
      addUnique(recommendedActions, "Create a simple first-time customer offer and share your stand link on WhatsApp or social media.");
      break;
    case "profile":
    case "trust":
    case "photos":
      if (!stats.hasBusinessPhoto) addUnique(recommendedActions, "Upload a clear business photo or logo so the stand looks active and trustworthy.");
      if (stats.photosCount < 3) addUnique(recommendedActions, "Add service or portfolio photos that show the actual work customers can expect.");
      if (stats.pricedServicesCount < stats.servicesCount) addUnique(recommendedActions, "Add fixed prices, ranges, starting prices, or quote-required labels to every service.");
      if (stats.servicesWithDescriptionsCount < stats.servicesCount) addUnique(recommendedActions, "Write short service descriptions that explain what is included and how long it takes.");
      break;
    case "visibility":
      if (stats.visibility !== "published") addUnique(recommendedActions, "Make sure the stand is published and active so customers can find it.");
      if (!stats.hasLocation) addUnique(recommendedActions, "Add location coverage and map details so nearby customers can discover you.");
      addUnique(recommendedActions, "Keep availability current and choose service categories customers actually search for.");
      break;
    case "reviews":
    case "bad_reviews":
    case "rating":
      if (stats.averageRating > 0 && stats.averageRating < 4) {
        addUnique(recommendedActions, "Focus on service quality, punctuality, and professional responses to complaints before asking for more reviews.");
      }
      if (stats.reviewsCount < 3) addUnique(recommendedActions, "Ask completed customers for reviews while the experience is still fresh.");
      if (question.focus === "bad_reviews") addUnique(recommendedActions, "Reply calmly, thank the customer for the feedback, explain the fix briefly, and invite them back without arguing.");
      if (stats.negatives[0]?.label === "waiting time") addUnique(recommendedActions, "Reduce delays by spacing bookings better and warning customers early if time changes.");
      if (stats.negatives[0]?.label === "pricing concern") addUnique(recommendedActions, "Make prices clearer before booking so customers do not feel surprised.");
      break;
    case "pricing":
    case "services":
    case "packages":
    case "service_promotion":
      if (stats.pricedServicesCount < stats.servicesCount) addUnique(recommendedActions, "Start by pricing every listed service clearly.");
      if (stats.servicesCount < 3) addUnique(recommendedActions, "Add your most requested services first before adding rare or complicated services.");
      addUnique(recommendedActions, "Compare similar services, then use a fixed price for simple services and a range or quote for custom work.");
      addUnique(recommendedActions, "Avoid very low prices that make quality look uncertain unless they are part of a short promotion.");
      if (question.focus === "packages") addUnique(recommendedActions, "Package related services together with one clear name, price, and expected duration.");
      break;
    case "retention":
      addUnique(recommendedActions, "After each completed booking, send a friendly follow-up and invite the customer to book their next visit.");
      addUnique(recommendedActions, "Protect your best time slots for repeat customers when you notice returning demand.");
      break;
    case "cancellations":
      addUnique(recommendedActions, "Keep opening hours accurate and remove slots you cannot honor.");
      addUnique(recommendedActions, "Confirm bookings quickly and message customers early if timing changes.");
      addUnique(recommendedActions, "Make prices and service duration clear before customers book.");
      break;
    case "promotion":
    case "slow_days":
    case "first_time":
      addUnique(recommendedActions, "Run one short, easy-to-understand promotion such as first-time customers getting UGX 2,000 off this week.");
      addUnique(recommendedActions, "Promote your clearest service with a visible price and a short deadline.");
      addUnique(recommendedActions, "Share the offer where customers already contact you, especially WhatsApp and social media.");
      break;
    case "priority":
      if (!stats.hasBusinessPhoto || stats.photosCount < 3) addUnique(recommendedActions, "Fix photos first because they affect trust immediately.");
      if (!stats.hasHours) addUnique(recommendedActions, "Add business hours next because missing availability blocks bookings.");
      if (stats.pricedServicesCount < stats.servicesCount) addUnique(recommendedActions, "Then fix service prices and descriptions.");
      if (stats.averageRating > 0 && stats.averageRating < 4) addUnique(recommendedActions, "Then address the review issues that are pulling trust down.");
      break;
    default:
      addUnique(recommendedActions, "Improve profile completeness, price clarity, photos, hours, and review follow-up.");
  }

  if (!recommendedActions.length) {
    addUnique(recommendedActions, "Keep your stand fresh weekly: update availability, refresh photos, and check reviews.");
  }

  const diagnosis = stats.profileCompleteness < 80
    ? "Your biggest opportunity is making the stand easier to trust and book."
    : stats.averageRating > 0 && stats.averageRating < 4
    ? "Your biggest opportunity is improving service quality signals from reviews."
    : stats.bookingsCount < 3
    ? "Your biggest opportunity is getting enough booking and review signals for customers to feel confident."
    : "Your stand has useful signals already; focus on the next action that removes customer hesitation.";

  const advice = [
    diagnosis,
    stats.bookingsCount || stats.reviewsCount
      ? "This answer uses your available Queless booking, review, service, hours, and profile data."
      : "Because there is limited stand data, this answer is based on general Queless best practices.",
  ].join(" ");

  const improveStand = ["profile", "visibility", "priority", "bookings"].includes(question.focus);
  const nextAction = getRecommendedNextAction(question, stats);
  const priority = getPriority(stats, question.focus);
  const title = stats.profileCompleteness < 80
    ? "Your stand needs stronger trust signals"
    : question.focus === "pricing"
    ? "Your services need clear prices"
    : ["reviews", "bad_reviews", "rating"].includes(question.focus)
    ? "Build trust with better review follow-up"
    : ["promotion", "slow_days", "first_time"].includes(question.focus)
    ? "Use a simple promotion to create booking momentum"
    : stats.bookingsCount < 3
    ? "Your stand needs a stronger booking push"
    : "Focus on the next action that removes customer hesitation";
  const platinumLine = access?.plan === "platinum"
    ? " Because you are on Platinum, keep testing one improvement each week and compare the result in your reports."
    : "";

  return {
    title,
    summary: `${diagnosis} ${stats.bookingsCount || stats.reviewsCount ? "This guidance uses your available Queless booking, review, service, hours, and profile data." : "Where your stand data is still missing, the coach points out what to add next."}${platinumLine}`,
    priority,
    actionSteps: recommendedActions.slice(0, 6),
    recommendedNextAction: nextAction,
    question: question.question,
    diagnosis,
    advice,
    insights: insights.slice(0, 6),
    recommendedActions: recommendedActions.slice(0, 6),
    actionTarget: nextAction.target || (improveStand ? "profile" : question.focus === "reviews" ? "reviews" : question.focus === "retention" ? "bookings" : "services"),
    actionLabel: nextAction.label || (improveStand ? "Improve my stand" : "Take action"),
  };
}

async function getPremiumUsedThisMonth(businessId, range) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM provider_coach_usage WHERE barber_id = ? AND usage_date >= ? AND usage_date < ?`,
    [businessId, range.start, range.end]
  );
  return Number(row?.count || 0);
}

export async function createProviderCoachAdvice({ business, questionId }) {
  const question = getQuestion(questionId);
  if (!question) {
    const error = new Error("Choose one of the available coach questions.");
    error.statusCode = 400;
    throw error;
  }

  const { access } = await getProviderCoachAccess(business);
  if (access.plan === "free" || !access.active) {
    const error = new Error("Upgrade to Premium or Platinum to use Provider Coach advice.");
    error.statusCode = 403;
    error.code = "UPGRADE_REQUIRED";
    error.usage = formatUsage(access);
    throw error;
  }

  const usageDate = dateKey();
  const range = monthRange();
  let usedThisMonth = 0;

  if (access.plan === "premium") {
    await transaction(async (client) => {
      usedThisMonth = Number((await client.get(
        `SELECT COUNT(*) AS count FROM provider_coach_usage WHERE barber_id = ? AND usage_date >= ? AND usage_date < ?`,
        [business.id, range.start, range.end]
      ))?.count || 0);

      if (usedThisMonth >= PREMIUM_MONTHLY_COACH_LIMIT) {
        const error = new Error("You've used your monthly coach tips. Upgrade to Platinum for unlimited Provider Coach guidance.");
        error.statusCode = 403;
        error.code = "MONTHLY_LIMIT_REACHED";
        error.usage = formatUsage(access, usedThisMonth);
        throw error;
      }

      await client.run(
        `INSERT INTO provider_coach_usage (barber_id, user_id, question_id, usage_date, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [business.id, business.owner_user_id, question.id, usageDate]
      );
      usedThisMonth += 1;
    });
  }

  if (access.plan === "platinum") {
    usedThisMonth = 0;
  } else if (access.plan === "premium" && usedThisMonth === 0) {
    usedThisMonth = await getPremiumUsedThisMonth(business.id, range);
  }

  const data = await getCoachData(business);
  return {
    ...buildQuestionAdvice(question, data, access),
    weeklyGrowthFocus: getWeeklyGrowthFocusFromStats(data.stats),
    usage: formatUsage(access, usedThisMonth),
  };
}
