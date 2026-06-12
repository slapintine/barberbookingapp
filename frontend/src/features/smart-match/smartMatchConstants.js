import {
  FiCalendar,
  FiClock,
  FiHome,
  FiMapPin,
  FiNavigation,
  FiZap,
} from "react-icons/fi";
import { MARKETPLACE_CATEGORIES } from "../../utils/serviceCatalog.js";
import { getCategoryDef } from "../../utils/categoryRegistry.jsx";

export const SMART_MATCH_STEPS = [
  { key: "need", label: "Need" },
  { key: "when", label: "When" },
  { key: "where", label: "Where" },
  { key: "matches", label: "Matches" },
];

export const SERVICE_CATEGORIES = MARKETPLACE_CATEGORIES
  .filter((category) => category.active !== false)
  .map((category) => {
    const def = getCategoryDef(category.id);
    return {
      key: category.id,
      label: category.name,
      helper: category.description,
      icon: def.Icon,
      primaryColor: def.primaryColor,
      softBg: def.softBg,
    };
  });

export const WHEN_OPTIONS = [
  { key: "now", label: "Now", helper: "Best for urgent needs", icon: FiZap },
  { key: "today", label: "Today", helper: "Good for same-day appointments", icon: FiCalendar },
  { key: "this_week", label: "This week", helper: "Best for more availability", icon: FiClock },
];

export const LOCATION_OPTIONS = [
  {
    key: "use_current_location",
    label: "Use my current location",
    helper: "We'll use your phone/browser location to find nearby providers.",
    icon: FiNavigation,
  },
  {
    key: "enter_address",
    label: "Enter an address or area",
    helper: "Type where the service should happen, such as Nakwero A, Wakiso.",
    icon: FiHome,
  },
];

export const AI_REASON_SETS = {
  use_current_location: [
    { title: "Faster nearby results", body: "We can find providers closest to where you are now.", icon: FiClock },
    { title: "Better ETA accuracy", body: "Your current location helps estimate travel time more accurately.", icon: FiMapPin },
    { title: "More relevant matches", body: "Nearby providers are ranked higher when they fit your service and timing.", icon: FiZap },
    { title: "Less travel hassle", body: "Smart Match reduces unnecessary movement for both you and the provider.", icon: FiNavigation },
  ],
  enter_address: [
    { title: "Better address precision", body: "A specific address helps us match providers to the exact service area.", icon: FiMapPin },
    { title: "Better on-site matching", body: "Home-service providers can confirm whether they can come to you.", icon: FiHome },
    { title: "Clearer travel planning", body: "Providers can estimate travel time more accurately.", icon: FiNavigation },
    { title: "More relevant results", body: "Smart Match can rank providers based on the area you entered.", icon: FiZap },
  ],
};

export const SMART_MATCH_SESSION_KEY = "queless_smart_match_draft_v2";
