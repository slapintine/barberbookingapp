export const CUSTOMER_PLAN = Object.freeze({
  FREE: "FREE",
  PREMIUM: "PREMIUM",
});

export const PROVIDER_PLAN = Object.freeze({
  FREE: "FREE",
  PREMIUM: "PREMIUM",
  PLATINUM: "PLATINUM",
});

export const CAPABILITY = Object.freeze({
  CUSTOMER_DISCOVERY_PUBLIC: "customer.discovery.public",
  CUSTOMER_BOOKING_STANDARD: "customer.booking.standard",
  CUSTOMER_SMART_MATCH_STANDARD: "customer.smartMatch.standard",
  CUSTOMER_SMART_MATCH_CONVERSATIONAL: "customer.smartMatch.conversational",
  CUSTOMER_SMART_MATCH_SAVED_PREFERENCES: "customer.smartMatch.savedPreferences",
  CUSTOMER_SMART_MATCH_REBOOKING: "customer.smartMatch.rebooking",
  CUSTOMER_EARLIER_SLOT_ALERTS: "customer.earlierSlotAlerts",
  CUSTOMER_NOTIFICATIONS_STANDARD: "customer.notifications.standard",

  PROVIDER_STAND_CORE: "provider.stand.core",
  PROVIDER_SERVICES_CORE: "provider.services.core",
  PROVIDER_SCHEDULE_CORE: "provider.schedule.core",
  PROVIDER_BOOKINGS_CORE: "provider.bookings.core",
  PROVIDER_ASSISTANT_BASIC: "provider.assistant.basic",
  PROVIDER_ASSISTANT_ANALYTICS: "provider.assistant.analytics",
  PROVIDER_ASSISTANT_FORECASTING: "provider.assistant.forecasting",
  PROVIDER_ASSISTANT_DRAFTING: "provider.assistant.drafting",
  PROVIDER_REPORTS_BASIC: "provider.reports.basic",
  PROVIDER_REPORTS_ADVANCED: "provider.reports.advanced",
  PROVIDER_INSIGHTS_PROACTIVE: "provider.insights.proactive",
  PROVIDER_STAFF_MULTI_USER: "provider.staff.multiUser",
});

const CUSTOMER_CAPABILITIES = Object.freeze({
  [CUSTOMER_PLAN.FREE]: Object.freeze([
    CAPABILITY.CUSTOMER_DISCOVERY_PUBLIC,
    CAPABILITY.CUSTOMER_BOOKING_STANDARD,
    CAPABILITY.CUSTOMER_SMART_MATCH_STANDARD,
    CAPABILITY.CUSTOMER_NOTIFICATIONS_STANDARD,
  ]),
  [CUSTOMER_PLAN.PREMIUM]: Object.freeze([
    CAPABILITY.CUSTOMER_DISCOVERY_PUBLIC,
    CAPABILITY.CUSTOMER_BOOKING_STANDARD,
    CAPABILITY.CUSTOMER_SMART_MATCH_STANDARD,
    CAPABILITY.CUSTOMER_SMART_MATCH_CONVERSATIONAL,
    CAPABILITY.CUSTOMER_SMART_MATCH_REBOOKING,
    CAPABILITY.CUSTOMER_EARLIER_SLOT_ALERTS,
    CAPABILITY.CUSTOMER_NOTIFICATIONS_STANDARD,
  ]),
});

const PROVIDER_CAPABILITIES_BY_PLAN = Object.freeze({
  [PROVIDER_PLAN.FREE]: Object.freeze([
    CAPABILITY.PROVIDER_STAND_CORE,
    CAPABILITY.PROVIDER_SERVICES_CORE,
    CAPABILITY.PROVIDER_SCHEDULE_CORE,
    CAPABILITY.PROVIDER_BOOKINGS_CORE,
    CAPABILITY.PROVIDER_ASSISTANT_BASIC,
    CAPABILITY.PROVIDER_REPORTS_BASIC,
  ]),
  [PROVIDER_PLAN.PREMIUM]: Object.freeze([
    CAPABILITY.PROVIDER_STAND_CORE,
    CAPABILITY.PROVIDER_SERVICES_CORE,
    CAPABILITY.PROVIDER_SCHEDULE_CORE,
    CAPABILITY.PROVIDER_BOOKINGS_CORE,
    CAPABILITY.PROVIDER_ASSISTANT_BASIC,
    CAPABILITY.PROVIDER_ASSISTANT_ANALYTICS,
    CAPABILITY.PROVIDER_ASSISTANT_DRAFTING,
    CAPABILITY.PROVIDER_REPORTS_BASIC,
    CAPABILITY.PROVIDER_REPORTS_ADVANCED,
    CAPABILITY.PROVIDER_INSIGHTS_PROACTIVE,
  ]),
  [PROVIDER_PLAN.PLATINUM]: Object.freeze([
    CAPABILITY.PROVIDER_STAND_CORE,
    CAPABILITY.PROVIDER_SERVICES_CORE,
    CAPABILITY.PROVIDER_SCHEDULE_CORE,
    CAPABILITY.PROVIDER_BOOKINGS_CORE,
    CAPABILITY.PROVIDER_ASSISTANT_BASIC,
    CAPABILITY.PROVIDER_ASSISTANT_ANALYTICS,
    CAPABILITY.PROVIDER_ASSISTANT_DRAFTING,
    CAPABILITY.PROVIDER_REPORTS_BASIC,
    CAPABILITY.PROVIDER_REPORTS_ADVANCED,
    CAPABILITY.PROVIDER_INSIGHTS_PROACTIVE,
  ]),
});

export const ASSISTANT_USAGE_LIMITS = Object.freeze({
  customer: Object.freeze({
    [CUSTOMER_PLAN.FREE]: Object.freeze({ conversationalSmartMatchDaily: 0 }),
    [CUSTOMER_PLAN.PREMIUM]: Object.freeze({ conversationalSmartMatchDaily: 25 }),
  }),
  provider: Object.freeze({
    [PROVIDER_PLAN.FREE]: Object.freeze({ assistantDaily: 5, analytics: false, forecasting: false }),
    [PROVIDER_PLAN.PREMIUM]: Object.freeze({ assistantDaily: 25, analytics: true, forecasting: false }),
    [PROVIDER_PLAN.PLATINUM]: Object.freeze({ assistantDaily: 60, analytics: true, forecasting: false }),
  }),
});

export function normalizeCustomerPlan(value = "") {
  const plan = String(value || "").trim().toUpperCase();
  return plan === CUSTOMER_PLAN.PREMIUM ? CUSTOMER_PLAN.PREMIUM : CUSTOMER_PLAN.FREE;
}

export function normalizeProviderPlanKey(value = "") {
  const plan = String(value || "").trim().toUpperCase();
  if (plan === PROVIDER_PLAN.PLATINUM) return PROVIDER_PLAN.PLATINUM;
  if (plan === PROVIDER_PLAN.PREMIUM) return PROVIDER_PLAN.PREMIUM;
  return PROVIDER_PLAN.FREE;
}

export function getCustomerCapabilityList(plan) {
  return CUSTOMER_CAPABILITIES[normalizeCustomerPlan(plan)] || CUSTOMER_CAPABILITIES[CUSTOMER_PLAN.FREE];
}

export function getProviderCapabilityList(plan) {
  return PROVIDER_CAPABILITIES_BY_PLAN[normalizeProviderPlanKey(plan)] || PROVIDER_CAPABILITIES_BY_PLAN[PROVIDER_PLAN.FREE];
}

export function hasCapability(capabilities, capability) {
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

export function capabilitiesToFlags(capabilities) {
  return Object.fromEntries((capabilities || []).map((capability) => [capability, true]));
}
