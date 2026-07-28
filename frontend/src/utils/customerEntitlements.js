export const CUSTOMER_ENTITLEMENTS = Object.freeze({
  SMART_MATCH_PREVIEW: "customer.smart_match.preview",
  SMART_MATCH_FULL: "customer.smart_match.full",
  PROVIDER_COMPARE: "customer.provider_compare",
  FAVOURITES_BASIC: "customer.favourites.basic",
  FAVOURITES_EXPANDED: "customer.favourites.expanded",
  SMART_REBOOKING: "customer.smart_rebooking",
  EARLIER_SLOT_ALERTS: "customer.earlier_slot_alerts",
  ADVANCED_REMINDERS: "customer.advanced_reminders",
  PRIORITY_SUPPORT: "customer.priority_support",
});

export const DEFAULT_CUSTOMER_ENTITLEMENT_SNAPSHOT = Object.freeze({
  plan: "FREE",
  premium: false,
  entitlements: {
    [CUSTOMER_ENTITLEMENTS.SMART_MATCH_PREVIEW]: true,
    [CUSTOMER_ENTITLEMENTS.SMART_MATCH_FULL]: false,
    [CUSTOMER_ENTITLEMENTS.PROVIDER_COMPARE]: false,
    [CUSTOMER_ENTITLEMENTS.FAVOURITES_BASIC]: true,
    [CUSTOMER_ENTITLEMENTS.FAVOURITES_EXPANDED]: false,
    [CUSTOMER_ENTITLEMENTS.SMART_REBOOKING]: false,
    [CUSTOMER_ENTITLEMENTS.EARLIER_SLOT_ALERTS]: false,
    [CUSTOMER_ENTITLEMENTS.ADVANCED_REMINDERS]: false,
    [CUSTOMER_ENTITLEMENTS.PRIORITY_SUPPORT]: false,
  },
  limits: {
    favourites: 3,
    comparisonProviders: 0,
    earlierSlotAlerts: 0,
  },
});

export function canUseCustomerEntitlement(snapshot, entitlementKey) {
  return Boolean(snapshot?.entitlements?.[entitlementKey]);
}

export function customerFavouriteLimit(snapshot) {
  return Math.max(0, Number(snapshot?.limits?.favourites || DEFAULT_CUSTOMER_ENTITLEMENT_SNAPSHOT.limits.favourites));
}
