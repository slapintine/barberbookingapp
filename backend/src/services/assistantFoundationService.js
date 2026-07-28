import { normalizeCategoryKey, serviceLabelForKey } from "./smartMatchService.js";

const CUSTOMER_ACTIONS = new Set([
  "smart_match.parse_preferences",
  "smart_match.find_matches",
  "smart_match.view_provider",
  "smart_match.start_booking",
]);

const PROVIDER_ACTIONS = new Set([
  "provider_coach.daily_briefing",
  "provider_coach.answer_question",
  "provider_coach.review_stand",
  "provider_coach.view_analytics",
  "provider_coach.suggest_schedule",
  "provider_coach.draft_response",
  "provider_coach.draft_promotion",
  "provider_coach.staff_availability",
  "provider_coach.branch_insights",
  "provider_coach.assignment_review",
  "provider_coach.report_export",
]);

const TIME_WORDS = [
  { pattern: /\b(now|asap|urgent|immediately)\b/i, when: "now" },
  { pattern: /\b(today|tomorrow|this afternoon|this evening|this morning)\b/i, when: "today" },
  { pattern: /\b(this week|next week|weekend|this saturday|next saturday|next few days)\b/i, when: "this_week" },
];

function compact(value = "", limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseBudget(text) {
  const match = String(text || "").match(/\b(?:ugx|ush)?\s*([0-9][0-9,\s]{2,})(?:\s*(?:ugx|shs|shillings))?\b/i);
  if (!match) return null;
  const amount = Number(String(match[1] || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseTime(text) {
  const value = String(text || "");
  if (/\bmorning\b/i.test(value)) return "09:00";
  if (/\bafternoon\b/i.test(value)) return "15:00";
  if (/\bevening\b/i.test(value)) return "18:00";
  const match = value.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))\s*(am|pm)?\b|\b([1-9]|1[0-2])\s*(am|pm)\b/i);
  if (!match) return "";
  let hour = Number(match[1] || match[4]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = String(match[3] || match[5] || "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function nextWeekday(baseDate, weekday) {
  const date = new Date(baseDate);
  const delta = (weekday + 7 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function parseDate(text, currentDate = new Date()) {
  const value = String(text || "");
  const explicit = String(text || "").match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return explicit[1];
  const base = Number.isFinite(new Date(currentDate).getTime()) ? new Date(currentDate) : new Date();
  if (/\btomorrow\b/i.test(value)) {
    const date = new Date(base);
    date.setDate(date.getDate() + 1);
    return formatDate(date);
  }
  if (/\b(?:this\s+)?saturday\b/i.test(value)) return formatDate(nextWeekday(base, 6));
  if (/\bnext week\b/i.test(value)) {
    const date = new Date(base);
    date.setDate(date.getDate() + 7);
    return formatDate(date);
  }
  return "";
}

function parseMinimumRating(text) {
  const value = String(text || "");
  const explicit = value.match(/\b([1-5](?:\.\d)?)\s*(?:\+|stars?|rating)\b/i);
  if (explicit) {
    const rating = Number(explicit[1]);
    return rating >= 1 && rating <= 5 ? rating : null;
  }
  if (/\b(highly rated|top rated|best rated|strong rating|good reviews)\b/i.test(value)) return 4.5;
  return null;
}

function parseWhen(text) {
  return TIME_WORDS.find((item) => item.pattern.test(text))?.when || "";
}

function parseLocation(text) {
  const value = String(text || "");
  const locationMatch = value.match(/\b(?:near|around|in|at)\s+([a-zA-Z][a-zA-Z0-9\s.'-]{2,60})(?:\s+(?:today|tomorrow|this week|at|by|under|for|with)\b|[,.]|$)/i);
  if (!locationMatch) return "";
  return compact(locationMatch[1], 80);
}

export function getAssistantAction(actionKey, role = "") {
  const key = compact(actionKey, 120);
  const set = String(role).toLowerCase() === "provider" ? PROVIDER_ACTIONS : CUSTOMER_ACTIONS;
  return {
    key,
    allowed: set.has(key),
    requiresConfirmation: key.endsWith("start_booking") || key.endsWith("draft_promotion") || key.endsWith("assignment_review") || key.endsWith("report_export"),
    writesData: key.endsWith("start_booking") || key.endsWith("draft_promotion") || key.endsWith("assignment_review") || key.endsWith("report_export"),
  };
}

export function parseSmartMatchPrompt(message = "", previous = {}) {
  const text = compact(message, 500);
  const serviceKey = normalizeCategoryKey(text || previous.serviceKey || previous.service || "");
  const serviceLabel = serviceKey && serviceKey !== "other" ? serviceLabelForKey(serviceKey) : "";
  const when = parseWhen(text) || previous.when || "";
  const budgetMax = parseBudget(text) ?? previous.budgetMax ?? null;
  const preferredTime = parseTime(text) || previous.preferredTime || "";
  const preferredDate = parseDate(text, previous.currentDate) || previous.preferredDate || "";
  const address = parseLocation(text) || previous.address || "";
  const minimumRating = parseMinimumRating(text) ?? previous.minimumRating ?? "";
  const notes = text ? text.slice(0, 300) : compact(previous.notes, 300);
  const entities = {
    serviceKey: serviceLabel ? serviceKey : "",
    serviceLabel,
    when,
    preferredDate,
    preferredTime,
    minimumRating,
    budgetMax,
    locationType: address ? "enter_address" : previous.locationType || "",
    address,
    notes,
  };
  const missing = [];
  if (!entities.serviceKey) missing.push("service");
  if (!entities.when && !entities.preferredDate && !entities.preferredTime) missing.push("timing");
  if (!entities.address && entities.locationType !== "use_current_location") missing.push("location");

  return {
    intent: "smart_match_preferences",
    confidence: missing.length === 0 ? 0.88 : missing.length === 1 ? 0.72 : 0.52,
    entities,
    missing,
    action: getAssistantAction("smart_match.parse_preferences", "customer"),
    summary: [
      serviceLabel || "service not clear yet",
      entities.preferredDate || entities.preferredTime || entities.when || "timing not set",
      address || "location not set",
    ].join(" | "),
  };
}

function addBriefingItem(items, item) {
  if (item?.title && !items.some((existing) => existing.id === item.id)) items.push(item);
}

export function buildProviderDailyBriefing(context = {}) {
  const stand = context.stand || {};
  const signals = context.signals || {};
  const items = [];
  const missing = Array.isArray(stand.missingFields) ? stand.missingFields : [];

  if (missing.length) {
    addBriefingItem(items, {
      id: "stand_missing_fields",
      severity: "high",
      title: "Finish the most important stand details",
      body: `Start with ${missing.slice(0, 3).join(", ")}.`,
      action: getAssistantAction("provider_coach.review_stand", "provider"),
    });
  }
  if (!signals.bookingsAvailable) {
    addBriefingItem(items, {
      id: "no_booking_history",
      severity: "medium",
      title: "No booking history to analyze yet",
      body: "Coach will use your saved stand, services, photos, hours, and reviews until real booking activity exists.",
      action: getAssistantAction("provider_coach.daily_briefing", "provider"),
    });
  } else if (Number(signals.cancelledBookings || 0) > Math.max(1, Number(signals.completedBookings || 0) / 2)) {
    addBriefingItem(items, {
      id: "cancellation_watch",
      severity: "high",
      title: "Review cancelled or missed bookings",
      body: "Your recent booking sample shows more cancellations or no-shows than expected. Check availability and confirmation habits.",
      action: getAssistantAction("provider_coach.daily_briefing", "provider"),
    });
  }
  if (!signals.reviewsAvailable) {
    addBriefingItem(items, {
      id: "no_reviews_yet",
      severity: "medium",
      title: "No public review signal yet",
      body: "After completed bookings, ask customers for honest reviews linked to the service they received.",
      action: getAssistantAction("provider_coach.daily_briefing", "provider"),
    });
  }
  if (Number(stand.profileCompleteness || 0) >= 80 && items.length < 3) {
    addBriefingItem(items, {
      id: "keep_profile_fresh",
      severity: "low",
      title: "Keep your stand fresh",
      body: "Your basics are mostly in place. Refresh photos, prices, services, and hours before promoting your stand.",
      action: getAssistantAction("provider_coach.daily_briefing", "provider"),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    standName: stand.name || "Your stand",
    plan: stand.plan || "free",
    profileCompleteness: Number(stand.profileCompleteness || 0),
    items: items.slice(0, 4),
    dataLimits: {
      bookingsAvailable: Boolean(signals.bookingsAvailable),
      reviewsAvailable: Boolean(signals.reviewsAvailable),
      revenueAvailable: false,
    },
  };
}
