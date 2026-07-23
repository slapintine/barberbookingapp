import { renderToStaticMarkup } from "react-dom/server";
import { getCategoryDef, CATEGORY_FALLBACK } from "../../utils/categoryRegistry.jsx";
import { normalizeMapIconType } from "../../utils/mapIconCategories.js";

export function getCategoryIconComponent(iconType = "default") {
  const resolvedType = normalizeMapIconType(iconType) || "default";
  return getCategoryDef(resolvedType).Icon || CATEGORY_FALLBACK.Icon;
}

function CrownBadge() {
  return (
    <span className="service-map-marker__tier-badge service-map-marker__tier-badge--crown" aria-hidden="true">
      <svg viewBox="0 0 20 18" focusable="false">
        <path d="M2 5.5 6.2 9 10 2.5 13.8 9 18 5.5 16.4 15H3.6L2 5.5Z" />
        <circle cx="2" cy="4.5" r="1.4" />
        <circle cx="10" cy="1.8" r="1.4" />
        <circle cx="18" cy="4.5" r="1.4" />
      </svg>
    </span>
  );
}

function DiamondBadge() {
  return (
    <span className="service-map-marker__tier-badge service-map-marker__tier-badge--diamond" aria-hidden="true">
      <svg viewBox="0 0 20 18" focusable="false">
        <path d="m10 1 7 6-7 10L3 7l7-6Z" />
        <path d="m3 7 7 2 7-2M10 1v16" />
      </svg>
    </span>
  );
}

export function ServiceMapMarker({
  iconType = "default",
  selected = false,
  tier = "FREE",
  closed = false,
  own = false,
}) {
  const resolvedIconType = normalizeMapIconType(iconType) || "default";
  const Icon = getCategoryIconComponent(resolvedIconType);
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
    <div className={className} data-icon-type={resolvedIconType} data-tier={tierKey} aria-hidden="true">
      <span className="service-map-marker__shadow" />
      <span className="service-map-marker__tail" />
      <span className="service-map-marker__bubble">
        <Icon className="service-map-marker__icon" />
      </span>
      {tierKey === "premium" ? <CrownBadge /> : null}
      {tierKey === "platinum" ? <DiamondBadge /> : null}
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
