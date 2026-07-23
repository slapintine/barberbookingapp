export const PROVIDER_COACH_INTENTS = Object.freeze([
  "unclear",
  "bookings_help",
  "description_help",
  "pricing_help",
  "services_help",
  "photos_trust_help",
  "location_hours_help",
  "customer_message_help",
  "promo_help",
  "plan_help",
  "today_bookings",
  "tomorrow_schedule",
  "attention_bookings",
  "weekly_comparison",
  "best_service",
  "cancellation_summary",
  "busiest_hours",
  "low_demand_days",
  "returning_customers",
  "schedule_gaps",
  "visibility_help",
  "general_audit",
  "follow_up_question",
]);

const INTENT_SET = new Set(PROVIDER_COACH_INTENTS);
const CLARIFICATION_CHIPS = Object.freeze([
  "Get more bookings",
  "Improve my description",
  "Check my prices",
  "Add services",
  "Reply to customer",
  "Promo ideas",
]);

const INTENT_CHIPS = Object.freeze({
  bookings_help: ["Audit my stand", "Check my prices", "Improve customer trust", "Promo ideas"],
  description_help: ["Rewrite my welcome", "Improve service wording", "Audit my stand"],
  pricing_help: ["Check service clarity", "Explain starting prices", "Audit my stand"],
  services_help: ["Improve service wording", "Check my prices", "What service details are missing?"],
  photos_trust_help: ["What photos should I add?", "Improve customer trust", "Audit my stand"],
  location_hours_help: ["Check my working hours", "Improve location details", "Audit my stand"],
  customer_message_help: ["Write a booking reply", "Write a follow-up", "Handle a price question"],
  promo_help: ["Write this week's promo", "Promote my top service", "Improve my welcome"],
  plan_help: ["What should I improve first?", "Audit my stand", "Explain my plan"],
  general_audit: ["Get more bookings", "Improve my description", "Check my prices", "Improve customer trust"],
});

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  if (!valid.length) return 0;
  return clampScore(valid.reduce((sum, value) => sum + Number(value), 0) / valid.length);
}

function isProvided(value, missingValue = "not provided") {
  const text = normalizedText(value);
  return Boolean(text && text !== missingValue && text !== "not set" && text !== "unnamed stand");
}

function isPriceClear(service) {
  const price = normalizedText(service?.price);
  return Boolean(price && price !== "price missing");
}

function serviceDescriptionIsClear(service) {
  const description = normalizedText(service?.description);
  return Boolean(description && description !== "description missing" && description.length >= 24);
}

function detectBaseIntent(message) {
  const text = normalizedText(message);
  if (/\b(today).*\b(bookings?|appointments?)\b|\b(bookings?|appointments?).*\b(today)\b/.test(text)) return "today_bookings";
  if (/\b(tomorrow).*\b(schedule|hours|availability|bookings?)\b|\b(schedule|hours|availability|bookings?).*\b(tomorrow)\b/.test(text)) return "tomorrow_schedule";
  if (/\b(need attention|pending|confirm|unconfirmed|requests?)\b/.test(text)) return "attention_bookings";
  if (/\b(compare).*\b(this week|week).*\b(last week|previous week)\b|\b(last week).*\b(this week)\b/.test(text)) return "weekly_comparison";
  if (/\b(best|top|performing|performance).*\b(service)\b|\b(service).*\b(best|top|performing)\b/.test(text)) return "best_service";
  if (/\b(cancel|cancelled|canceled|cancellation|cancellations|no show|no-show)\b/.test(text)) return "cancellation_summary";
  if (/\b(busiest|busy|peak).*\b(hour|hours|time|times)\b|\b(hour|hours|time|times).*\b(busiest|busy|peak)\b/.test(text)) return "busiest_hours";
  if (/\b(low demand|quiet|slow).*\b(day|days)\b|\b(day|days).*\b(low demand|quiet|slow)\b/.test(text)) return "low_demand_days";
  if (/\b(returning|repeat).*\b(customer|customers)\b/.test(text)) return "returning_customers";
  if (/\b(gap|gaps|free slot|open slot|available gap)\b/.test(text)) return "schedule_gaps";
  if (/\b(not visible|publicly visible|not public|hidden|published|discoverable)\b/.test(text)) return "visibility_help";
  if (/\b(reply|respond|response|message|customer text|client text|whatsapp)\b/.test(text)) return "customer_message_help";
  if (/\b(description|bio|about|welcome|introduction|wording)\b/.test(text)) return "description_help";
  if (/\b(price|pricing|cost|charge|charges|expensive|cheap|ugx)\b/.test(text)) return "pricing_help";
  if (/\b(service|services|offer|offering|package|add)\b/.test(text)) return "services_help";
  if (/\b(photo|photos|image|images|gallery|portfolio|trust|review|reviews|rating|verified)\b/.test(text)) return "photos_trust_help";
  if (/\b(location|address|area|travel|remote|online|hours|hour|schedule|availability|open|close)\b/.test(text)) return "location_hours_help";
  if (/\b(promo|promote|promotion|post|social|caption|advert|marketing|today)\b/.test(text)) return "promo_help";
  if (/\b(plan|platinum|premium|free plan|upgrade|subscription)\b/.test(text)) return "plan_help";
  if (/\b(booking|bookings|booked|customer|customers|attract|conversion|views|requests)\b/.test(text)) return "bookings_help";
  if (/\b(audit|diagnose|health|score|everything|overall|improve my stand|what should i improve)\b/.test(text)) return "general_audit";
  return "";
}

export function isUnclearCoachMessage(message) {
  const text = normalizedText(message);
  if (!text || !/[a-z0-9]/i.test(text)) return true;
  if (/^(eh+|h+m+|um+|uh+|ok(?:ay)?|k+|yes|no|maybe|\?+|\.{1,3})[!?.,\s]*$/i.test(text)) return true;
  if (text.length <= 3 && !detectBaseIntent(text)) return true;
  const compact = text.replace(/[^a-z]/g, "");
  return Boolean(compact.length >= 2 && compact.length <= 6 && !/[aeiou]/.test(compact) && !detectBaseIntent(text));
}

function isFollowUpMessage(message) {
  const text = normalizedText(message).replace(/[?!.,]+$/g, "");
  return /^(why|how|how so|what do i do|what next|explain|explain more|again|tell me more|can you explain|show me how)$/.test(text);
}

function normalizedIntent(value) {
  const intent = normalizedText(value);
  return INTENT_SET.has(intent) ? intent : "";
}

export function findRecentCoachTopic(history = []) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index] || {};
    const metadataIntent = normalizedIntent(item.topic || item.intent);
    if (metadataIntent && !["unclear", "follow_up_question"].includes(metadataIntent)) return metadataIntent;
    if (item.role === "user") {
      const inferred = detectBaseIntent(item.content);
      if (inferred) return inferred;
    }
  }
  return "";
}

export function detectProviderCoachIntent(message, history = []) {
  if (isUnclearCoachMessage(message)) {
    return {
      detectedIntent: "unclear",
      resolvedIntent: "unclear",
      previousTopic: findRecentCoachTopic(history),
      isFollowUp: false,
    };
  }

  if (isFollowUpMessage(message)) {
    const previousTopic = findRecentCoachTopic(history);
    return {
      detectedIntent: "follow_up_question",
      resolvedIntent: previousTopic || "unclear",
      previousTopic,
      isFollowUp: Boolean(previousTopic),
    };
  }

  const detectedIntent = detectBaseIntent(message) || "general_audit";
  return {
    detectedIntent,
    resolvedIntent: detectedIntent,
    previousTopic: findRecentCoachTopic(history),
    isFollowUp: false,
  };
}

function actionForScoreKey(key, context) {
  const services = Array.isArray(context?.services) ? context.services : [];
  const missingPrices = services.filter((service) => !isPriceClear(service));
  const weakDescriptions = services.filter((service) => !serviceDescriptionIsClear(service));
  const actionMap = {
    serviceClarityScore: weakDescriptions.length
      ? `Rewrite the descriptions for ${weakDescriptions.slice(0, 3).map((item) => item.name).join(", ")}.`
      : "Rewrite your top 3 service descriptions around the result customers receive.",
    pricingClarityScore: missingPrices.length
      ? `Add a clear price or quote label to ${missingPrices.slice(0, 3).map((item) => item.name).join(", ")}.`
      : "Make each price clearer by stating what it includes.",
    trustScore: "Add 3 real photos of your work and keep every claim on your stand verifiable.",
    bookingReadinessScore: "Complete the strongest missing booking detail before promoting your stand.",
    photoCompletenessScore: "Add 3 real photos of your work.",
    locationClarityScore: "Add clear working hours and explain where or how customers receive the service.",
    responseReadinessScore: "Prepare one clear reply that confirms service, date, location, and price.",
    profileCompletenessScore: `Complete ${context?.stand?.missingFields?.[0] || "the first missing stand field"}.`,
  };
  return actionMap[key] || "Complete the first missing stand detail.";
}

export function buildProviderStandDiagnosis(context = {}) {
  const stand = context.stand || {};
  const services = Array.isArray(context.services) ? context.services : [];
  const availability = Array.isArray(context.availability) ? context.availability : [];
  const signals = context.signals || {};
  const missingFields = Array.isArray(stand.missingFields) ? stand.missingFields : [];
  const availableServices = services.filter((service) => service.available !== false);
  const describedServices = services.filter(serviceDescriptionIsClear);
  const pricedServices = services.filter(isPriceClear);
  const durationServices = services.filter((service) => Number(service.durationMinutes || 0) > 0);
  const servicePhotos = services.filter((service) => service.hasPhoto).length;
  const photoCount = Math.max(Number(signals.photoCount || 0), servicePhotos);
  const openDays = availability.filter((day) => day.open && day.start && day.end).length;
  const hasLocation = isProvided(stand.location);
  const delivery = normalizedText(stand.delivery);
  const hasDelivery = Boolean(
    delivery &&
    delivery !== "customer visits provider location" &&
    delivery !== "not provided"
  );
  const hasDescription = isProvided(stand.description) && normalizedText(stand.description).length >= 45;
  const phonePresent = !missingFields.includes("phone number");
  const published = normalizedText(stand.status) === "published";

  const profileCompletenessScore = clampScore(
    Number.isFinite(Number(stand.profileCompleteness))
      ? Number(stand.profileCompleteness)
      : average([
          isProvided(stand.name) ? 100 : 0,
          isProvided(stand.category) ? 100 : 0,
          hasDescription ? 100 : 0,
          hasLocation || hasDelivery ? 100 : 0,
          services.length ? 100 : 0,
          openDays ? 100 : 0,
          photoCount ? 100 : 0,
          phonePresent ? 100 : 0,
        ])
  );
  const serviceClarityScore = services.length
    ? average([
        (availableServices.length / services.length) * 100,
        (describedServices.length / services.length) * 100,
        (durationServices.length / services.length) * 100,
      ])
    : 0;
  const pricingClarityScore = services.length ? clampScore((pricedServices.length / services.length) * 100) : 0;
  const photoCompletenessScore = clampScore((photoCount / 3) * 100);
  const locationClarityScore = average([
    hasLocation || hasDelivery ? 100 : 0,
    openDays ? 100 : 0,
  ]);
  const trustScore = average([
    photoCompletenessScore,
    hasDescription ? 100 : 30,
    signals.reviewsAvailable ? 100 : 45,
    normalizedText(stand.verification).includes("verified") ? 100 : 55,
  ]);
  const responseReadinessScore = average([
    phonePresent ? 100 : 0,
    openDays ? 100 : 40,
    availableServices.length ? 100 : 0,
    pricingClarityScore,
  ]);
  const bookingReadinessScore = average([
    published ? 100 : 35,
    serviceClarityScore,
    pricingClarityScore,
    photoCompletenessScore,
    locationClarityScore,
    responseReadinessScore,
  ]);
  const scores = {
    profileCompletenessScore,
    serviceClarityScore,
    pricingClarityScore,
    trustScore,
    bookingReadinessScore,
    photoCompletenessScore,
    locationClarityScore,
    responseReadinessScore,
  };
  const overallStandHealthScore = average(Object.values(scores));
  const weakAreas = Object.entries(scores)
    .sort((left, right) => left[1] - right[1])
    .slice(0, 3)
    .map(([key, score]) => ({ key, score, nextAction: actionForScoreKey(key, context) }));

  return {
    ...scores,
    overallStandHealthScore,
    weakAreas,
    missingFields,
    facts: {
      servicesCount: services.length,
      describedServicesCount: describedServices.length,
      pricedServicesCount: pricedServices.length,
      photoCount,
      openDaysCount: openDays,
      published,
      bookingsAvailable: Boolean(signals.bookingsAvailable),
      totalBookings: signals.bookingsAvailable ? Number(signals.totalBookings || 0) : null,
      reviewsAvailable: Boolean(signals.reviewsAvailable),
      reviewCount: signals.reviewsAvailable ? Number(signals.reviewCount || 0) : null,
    },
  };
}

export function getProviderCoachSuggestions(intent) {
  if (intent === "unclear" || intent === "follow_up_question") return [...CLARIFICATION_CHIPS];
  return [...(INTENT_CHIPS[intent] || INTENT_CHIPS.general_audit)];
}

export function getProviderCoachNextAction(intent, diagnosis, context) {
  if (intent === "unclear") return "";
  const services = Array.isArray(context?.services) ? context.services : [];
  const actions = {
    description_help: services.length
      ? "Rewrite your top 3 service descriptions around the result customers receive."
      : "Write a clear stand description that says what you do, where you work, and how to book.",
    pricing_help: actionForScoreKey("pricingClarityScore", context),
    services_help: actionForScoreKey("serviceClarityScore", context),
    photos_trust_help: actionForScoreKey("photoCompletenessScore", context),
    location_hours_help: actionForScoreKey("locationClarityScore", context),
    customer_message_help: "Prepare one reply that confirms the service, preferred date, location, and price.",
    promo_help: "Create one short promo for your strongest available service this week.",
    plan_help: diagnosis?.missingFields?.length
      ? `Complete ${diagnosis.missingFields[0]} before focusing on plan extras.`
      : "Use your current plan features to strengthen your weakest stand area.",
    today_bookings: "Review today's active bookings and confirm any pending requests.",
    tomorrow_schedule: "Check tomorrow's opening hours and booked times before sharing availability.",
    attention_bookings: "Handle pending or time-sensitive bookings first.",
    weekly_comparison: "Compare current booking volume with the previous week using your own booking history.",
    best_service: "Promote the service with the strongest completed booking signal.",
    cancellation_summary: "Review cancelled bookings and keep availability accurate.",
    busiest_hours: "Use your busiest hours to protect your best slots.",
    low_demand_days: "Use quiet days for availability updates, promos, or admin work.",
    returning_customers: "Invite returning customers to book again with a short friendly message.",
    schedule_gaps: "Fill open gaps only when your schedule can support them.",
    visibility_help: "Publish your stand and complete location, hours, services, and photos.",
    bookings_help: diagnosis?.weakAreas?.[0]?.nextAction || "Complete the first missing booking detail.",
    general_audit: diagnosis?.weakAreas?.[0]?.nextAction || "Improve one stand area at a time.",
  };
  return actions[intent] || actions.general_audit;
}
