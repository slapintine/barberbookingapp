import { renderToStaticMarkup } from "react-dom/server";
import {
  BriefcaseBusiness,
  Camera,
  Car,
  Droplets,
  GraduationCap,
  HeartPulse,
  Home,
  MapPin,
  Navigation,
  Scissors,
  Sparkles,
  Wrench,
} from "lucide-react";

const ICONS = {
  beauty: Sparkles,
  salon: Scissors,
  barber: Scissors,
  grooming: Sparkles,

  "home-services": Home,
  home: Home,

  "auto-services": Car,
  auto: Car,
  mechanics: Car,
  transport: Car,

  "events-photography": Camera,
  events: Camera,
  photography: Camera,

  "education-tutoring": GraduationCap,
  education: GraduationCap,
  tutoring: GraduationCap,

  "health-fitness": HeartPulse,
  health: HeartPulse,
  fitness: HeartPulse,

  "repairs-maintenance": Wrench,
  repairs: Wrench,
  maintenance: Wrench,

  "business-services": BriefcaseBusiness,
  business: BriefcaseBusiness,

  "cleaning-services": Droplets,
  cleaning: Droplets,

  "delivery-errands": Navigation,
  delivery: Navigation,
  errands: Navigation,

  default: MapPin,
};

function MultiServiceIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-marker-icon="multi"
      focusable="false"
      {...props}
    >
      <rect x="4.7" y="4.7" width="5.7" height="5.7" rx="1.75" />
      <rect x="13.6" y="4.7" width="5.7" height="5.7" rx="1.75" />
      <rect x="4.7" y="13.6" width="5.7" height="5.7" rx="1.75" />
      <rect x="13.6" y="13.6" width="5.7" height="5.7" rx="1.75" />
    </svg>
  );
}

export function getCategoryIconComponent(iconType = "default") {
  if (iconType === "multi" || iconType === "multi-service") return MultiServiceIcon;
  return ICONS[iconType] || ICONS.default;
}

export function ServiceMapMarker({
  iconType = "default",
  selected = false,
  tier = "FREE",
  verified = false,
  closed = false,
  own = false,
}) {
  const Icon = getCategoryIconComponent(iconType);
  const tierKey = String(tier || "FREE").toLowerCase();
  const className = [
    "service-map-marker",
    `service-map-marker--tier-${tierKey}`,
    selected ? "service-map-marker--selected" : "",
    closed ? "service-map-marker--closed" : "",
    own ? "service-map-marker--own" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} data-icon-type={iconType} data-tier={tierKey} aria-hidden="true">
      <span className="service-map-marker__shadow" />
      <span className="service-map-marker__tail" />
      <span className="service-map-marker__bubble">
        <Icon className="service-map-marker__icon" />
        {tierKey === "platinum" ? <span className="service-map-marker__crown">★</span> : null}
      </span>
      {verified ? <span className="service-map-marker__verified" aria-hidden="true">✓</span> : null}
    </div>
  );
}

export function ServiceMapPopupIcon({ iconType = "default" }) {
  const Icon = getCategoryIconComponent(iconType);

  return (
    <span className="queless-map-popup-icon" aria-hidden="true">
      <Icon />
    </span>
  );
}

export function ServiceMapCluster({ count = 0 }) {
  return (
    <div className="queless-cluster" aria-hidden="true">
      <strong>{count > 99 ? "99+" : count}</strong>
      <span>providers</span>
    </div>
  );
}

export function renderServiceMarkerHtml(iconType, selected = false, status = {}) {
  return renderToStaticMarkup(
    <ServiceMapMarker
      iconType={iconType || "default"}
      selected={selected}
      tier={status.tier}
      verified={status.verified}
      closed={status.closed}
      own={status.own}
    />
  );
}

export function renderServicePopupIconHtml(iconType) {
  return renderToStaticMarkup(<ServiceMapPopupIcon iconType={iconType || "default"} />);
}

export function renderServiceClusterHtml(count) {
  return renderToStaticMarkup(<ServiceMapCluster count={count} />);
}
