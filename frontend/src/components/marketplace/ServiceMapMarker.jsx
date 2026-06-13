import { renderToStaticMarkup } from "react-dom/server";
import { getCategoryDef, CATEGORY_FALLBACK } from "../../utils/categoryRegistry.jsx";

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
  return getCategoryDef(iconType).Icon || CATEGORY_FALLBACK.Icon;
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
