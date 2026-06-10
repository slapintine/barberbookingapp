import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import {
  FiBell,
  FiCalendar,
  FiCheck,
  FiClock,
  FiCompass,
  FiHeart,
  FiMap,
  FiMapPin,
  FiMessageCircle,
  FiNavigation,
  FiRefreshCw,
  FiSearch,
  FiSliders,
  FiStar,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi";
import quelessLogo from "../../assets/queless-logo-full.png";
import UserAvatar from "../ui/UserAvatar.jsx";
import { resolveProviderMapIconType } from "../../utils/mapIconCategories.js";
import {
  getProviderClosingTime,
  getProviderTier,
  isOwnProvider,
  isProviderOpenNow,
  isProviderVerified,
} from "../../utils/marketplaceServices.js";
import { resolveProviderImage, handleProviderImageError } from "../../utils/providerImage.js";
import {
  ClusteredProviderMarkers,
  GAYAZA_CENTER,
  MapRecenter,
  getDistanceKm,
  getMarkers,
  getProviderSearchText,
  resolveSearchCenter,
} from "./mapCore.jsx";
import { renderServicePopupIconHtml } from "./ServiceMapMarker.jsx";
import "./ServiceMapMarker.css";
import "./MapDashboard.css";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SIDEBAR_ITEMS = [
  { key: "discover", label: "Discover", tab: "home", Icon: FiCompass },
  { key: "map", label: "Map", tab: "map", Icon: FiMap, active: true },
  { key: "bookings", label: "Bookings", tab: "bookings", Icon: FiCalendar },
  { key: "messages", label: "Messages", tab: "inbox", Icon: FiMessageCircle },
  { key: "favorites", label: "Favorites", tab: "favorites", Icon: FiHeart },
  { key: "profile", label: "Profile", tab: "profile", Icon: FiUser },
];

// Category chips map to the same icon-type buckets used to draw markers, so a
// chip and the markers it filters always agree.
const CATEGORY_CHIPS = [
  { label: "Barber", icon: "barber" },
  { label: "Salon", icon: "salon" },
  { label: "Spa", icon: "spa" },
  { label: "Tutor", icon: "education-tutoring" },
  { label: "Repair", icon: "repairs-maintenance" },
  { label: "Cleaning", icon: "cleaning-services" },
  { label: "Fitness", icon: "health-fitness" },
];

const STATUS_CHIPS = [
  { key: "openNow", label: "Open Now" },
  { key: "verified", label: "Verified" },
  { key: "premium", label: "Premium" },
  { key: "platinum", label: "Platinum" },
];

const EMPTY_STATUS = { openNow: false, verified: false, premium: false, platinum: false };

function priceRangeLabel(provider = {}) {
  if (provider.price_range) return provider.price_range;
  const from = Number(provider.price_from || 0);
  const to = Number(provider.price_to || 0);
  if (from > 0 && to > 0) return `UGX ${from.toLocaleString()} – ${to.toLocaleString()}`;
  if (from > 0) return `From UGX ${from.toLocaleString()}`;
  return "";
}

function responseTimeLabel(provider = {}) {
  const value = provider.response_time || provider.responseTime || provider.typical_response || "";
  if (!value) return "";
  return String(value).toLowerCase().includes("repl") ? value : `Typically replies in ${value}`;
}

function serviceChips(provider = {}, limit = 4) {
  const services = Array.isArray(provider.services) ? provider.services : [];
  const names = services
    .map((service) => service.service_name || service.name || service.title)
    .filter(Boolean);
  const unique = [...new Set(names)];
  return { chips: unique.slice(0, limit), extra: Math.max(0, unique.length - limit) };
}

function MarketAtGlance({ stats }) {
  const cells = [
    { label: "Active providers", value: stats.active },
    { label: "Open now", value: stats.openNow },
    { label: "Premium", value: stats.premium },
    { label: "Platinum", value: stats.platinum },
  ];
  return (
    <section className="qmd-market" aria-label="Market at a glance">
      <header>
        <strong>Market at a glance</strong>
        <span>Live near you</span>
      </header>
      <div className="qmd-market-grid">
        {cells.map((cell) => (
          <div className="qmd-market-cell" key={cell.label}>
            <b>{cell.value}</b>
            <small>{cell.label}</small>
          </div>
        ))}
      </div>
      {/* TODO(backend): "Bookings today" and "New providers" need dedicated
          stats endpoints; omitted until real data is available. */}
    </section>
  );
}

function ProviderMarkerLegend() {
  const rows = [
    { className: "qmd-legend-dot qmd-legend-dot--normal", label: "Provider" },
    { className: "qmd-legend-dot qmd-legend-dot--verified", label: "Verified" },
    { className: "qmd-legend-dot qmd-legend-dot--premium", label: "Premium" },
    { className: "qmd-legend-dot qmd-legend-dot--platinum", label: "Platinum" },
    { className: "qmd-legend-dot qmd-legend-dot--closed", label: "Closed" },
  ];
  return (
    <section className="qmd-legend" aria-label="Map marker legend">
      <strong>Marker legend</strong>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span className={row.className} aria-hidden="true" />
            {row.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProviderPreviewPanel({
  marker,
  isOwner,
  isFavorite,
  onClose,
  onOpenProvider,
  onMessageProvider,
  onToggleFavorite,
  onNavigate,
}) {
  const provider = marker.provider || {};
  const open = isProviderOpenNow(provider);
  const verified = isProviderVerified(provider);
  const closing = getProviderClosingTime(provider);
  const price = priceRangeLabel(provider);
  const response = responseTimeLabel(provider);
  const { chips, extra } = serviceChips(provider);
  const distanceText = Number.isFinite(marker.distanceKm) ? `${marker.distanceKm.toFixed(1)} km` : "";
  const tier = getProviderTier(provider);

  return (
    <aside className="qmd-panel" aria-label="Provider preview">
      <button type="button" className="qmd-panel-close" onClick={onClose} aria-label="Close preview">
        <FiX />
      </button>
      <div className="qmd-panel-media">
        <img
          src={resolveProviderImage(provider)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleProviderImageError(provider)}
        />
        {tier !== "FREE" ? <span className={`qmd-tier-badge qmd-tier-badge--${tier.toLowerCase()}`}>{tier}</span> : null}
        {!isOwner ? (
          <button
            type="button"
            className={isFavorite ? "qmd-panel-fav is-active" : "qmd-panel-fav"}
            onClick={() => onToggleFavorite?.(provider.id)}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <FiHeart />
          </button>
        ) : null}
      </div>

      <div className="qmd-panel-body">
        <div className="qmd-panel-title">
          <strong>{provider.business_name || "Queless provider"}</strong>
          {verified ? (
            <span className="qmd-verified" title="Verified">
              <FiCheck />
            </span>
          ) : null}
        </div>

        {isOwner ? (
          <p className="qmd-owner-flag">Your stand is live</p>
        ) : (
          <span className="qmd-panel-category">{marker.category || marker.title || "Local services"}</span>
        )}

        <div className="qmd-panel-meta">
          <span><FiStar /> {marker.rating}{provider.reviewCount ? ` (${provider.reviewCount})` : ""}</span>
          {distanceText ? <span><FiMapPin /> {distanceText}</span> : null}
          <span className={open ? "qmd-open" : "qmd-closed"}>{open ? "Open now" : "Closed"}</span>
        </div>

        <div className="qmd-panel-info">
          {provider.location ? (
            <small><FiMapPin /> {provider.location}</small>
          ) : null}
          {open && closing ? (
            <small><FiClock /> Closes {closing}</small>
          ) : null}
          {response ? <small><FiMessageCircle /> {response}</small> : null}
        </div>

        {price ? <p className="qmd-panel-price">{price}</p> : null}

        {chips.length ? (
          <div className="qmd-service-chips">
            {chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
            {extra ? <span className="qmd-service-chips__more">+{extra}</span> : null}
          </div>
        ) : null}

        {isOwner ? (
          <>
            <p className="qmd-owner-copy">
              Customers can discover your business on the map. This is your public stand preview.
            </p>
            <div className="qmd-panel-actions qmd-panel-actions--owner">
              <button type="button" className="qmd-btn qmd-btn--primary" onClick={() => onNavigate?.("dashboard")}>
                Edit Stand
              </button>
              <button type="button" className="qmd-btn qmd-btn--ghost" onClick={() => onOpenProvider?.(provider)}>
                Preview Public Profile
              </button>
              <button type="button" className="qmd-btn qmd-btn--ghost" onClick={() => onNavigate?.("bookings")}>
                View Bookings
              </button>
              <button type="button" className="qmd-btn qmd-btn--ghost" onClick={() => onNavigate?.("upgrade")}>
                <FiZap /> Boost Visibility
              </button>
            </div>
          </>
        ) : (
          <div className="qmd-panel-actions">
            <button type="button" className="qmd-btn qmd-btn--ghost" onClick={() => onOpenProvider?.(provider)}>
              View Stand
            </button>
            <button type="button" className="qmd-btn qmd-btn--primary" onClick={() => onOpenProvider?.(provider)}>
              Book Now
            </button>
            <button
              type="button"
              className="qmd-btn qmd-btn--ghost qmd-btn--icon"
              onClick={() => onMessageProvider?.(provider)}
              aria-label="Message provider"
            >
              <FiMessageCircle /> Message
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function NearbyProviderCard({ marker, isFavorite, onOpenProvider, onToggleFavorite }) {
  const provider = marker.provider || {};
  const iconType = resolveProviderMapIconType(provider, marker);
  const open = isProviderOpenNow(provider);
  const price = priceRangeLabel(provider);
  const distanceText = Number.isFinite(marker.distanceKm) ? `${marker.distanceKm.toFixed(1)} km` : "";

  return (
    <article className="qmd-nearby-card">
      <div className="qmd-nearby-media">
        <img
          src={resolveProviderImage(provider)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleProviderImageError(provider)}
        />
        <span className="qmd-nearby-badge" dangerouslySetInnerHTML={{ __html: renderServicePopupIconHtml(iconType) }} />
        <button
          type="button"
          className={isFavorite ? "qmd-nearby-fav is-active" : "qmd-nearby-fav"}
          onClick={() => onToggleFavorite?.(provider.id)}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <FiHeart />
        </button>
      </div>
      <button type="button" className="qmd-nearby-body" onClick={() => onOpenProvider?.(provider)}>
        <strong>{provider.business_name || "Queless provider"}</strong>
        <small>{marker.category || marker.title || "Local services"}</small>
        <div className="qmd-nearby-meta">
          <span><FiStar /> {marker.rating}</span>
          {distanceText ? <span>{distanceText}</span> : null}
        </div>
        <div className="qmd-nearby-foot">
          <span className={open ? "qmd-open" : "qmd-closed"}>{open ? "Open now" : "Closed"}</span>
          {price ? <span className="qmd-nearby-price">{price}</span> : null}
        </div>
      </button>
    </article>
  );
}

export default function MapDashboard({
  theme = "light",
  currentUser = null,
  category = "All",
  providers,
  userLocation,
  locationLabel = "Kampala, Uganda",
  locationMessage = "",
  locationLoading = false,
  providersLoading = false,
  providersError = "",
  isBarber = false,
  myStand = null,
  favorites = [],
  unreadCount = 0,
  onClose,
  onOpenMenu,
  onNavigate,
  onUseCurrentLocation,
  onManualLocation,
  onRefreshProviders,
  onOpenProvider,
  onMessageProvider,
  onToggleFavorite,
  onOpenNotifications,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [activeCategoryIcon, setActiveCategoryIcon] = useState("");
  const [statusFilters, setStatusFilters] = useState(EMPTY_STATUS);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const autoLocationRequestedRef = useRef(false);

  // Seed the category chip from the launch category, mapped to an icon bucket.
  useEffect(() => {
    if (!category || category === "All") return;
    const match = CATEGORY_CHIPS.find(
      (chip) => resolveProviderMapIconType({ business_type: category, category_name: category }) === chip.icon
    );
    if (match) setActiveCategoryIcon(match.icon);
  }, [category]);

  useEffect(() => {
    if (userLocation?.latitude || autoLocationRequestedRef.current) return;
    autoLocationRequestedRef.current = true;
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state === "granted") onUseCurrentLocation?.();
      })
      .catch(() => {});
  }, [onUseCurrentLocation, userLocation]);

  const baseMarkers = useMemo(() => getMarkers(providers, "All"), [providers]);

  const marketStats = useMemo(() => {
    let openNow = 0;
    let premium = 0;
    let platinum = 0;
    baseMarkers.forEach(({ provider }) => {
      if (isProviderOpenNow(provider)) openNow += 1;
      const tier = getProviderTier(provider);
      if (tier === "PREMIUM") premium += 1;
      if (tier === "PLATINUM") platinum += 1;
    });
    return { active: baseMarkers.length, openNow, premium, platinum };
  }, [baseMarkers]);

  const cleanSearch = searchQuery.trim().toLowerCase();
  const tierSelected = [
    statusFilters.premium ? "PREMIUM" : null,
    statusFilters.platinum ? "PLATINUM" : null,
  ].filter(Boolean);

  const filteredMarkers = useMemo(() => {
    let list = baseMarkers;
    if (activeCategoryIcon) {
      list = list.filter((marker) => resolveProviderMapIconType(marker.provider, marker) === activeCategoryIcon);
    }
    if (cleanSearch) {
      list = list.filter((marker) => getProviderSearchText(marker.provider, marker).includes(cleanSearch));
    }
    if (statusFilters.openNow) list = list.filter((marker) => isProviderOpenNow(marker.provider));
    if (statusFilters.verified) list = list.filter((marker) => isProviderVerified(marker.provider));
    if (tierSelected.length) list = list.filter((marker) => tierSelected.includes(getProviderTier(marker.provider)));

    return list
      .map((marker) => ({ ...marker, distanceKm: getDistanceKm(userLocation, marker) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [activeCategoryIcon, baseMarkers, cleanSearch, statusFilters, tierSelected.join(","), userLocation]);

  const activeSelectedMarker = selectedMarker && filteredMarkers.some((m) => m.id === selectedMarker.id)
    ? filteredMarkers.find((m) => m.id === selectedMarker.id)
    : null;

  const center = userLocation?.latitude && userLocation?.longitude
    ? [Number(userLocation.latitude), Number(userLocation.longitude)]
    : resolveSearchCenter(searchQuery || locationLabel) || (filteredMarkers[0]
      ? [filteredMarkers[0].latitude, filteredMarkers[0].longitude]
      : GAYAZA_CENTER);
  const mapZoom = userLocation?.latitude && userLocation?.longitude ? 14 : 13;

  const hasActiveFilters = Boolean(activeCategoryIcon || cleanSearch || Object.values(statusFilters).some(Boolean));
  const clearFilters = () => {
    setActiveCategoryIcon("");
    setStatusFilters(EMPTY_STATUS);
    setSearchDraft("");
    setSearchQuery("");
    setSelectedMarker(null);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setSearchQuery(searchDraft.trim());
    setSelectedMarker(null);
  };

  const sidebarCard = (() => {
    if (isBarber && myStand) {
      const live = ["active", "approved", "live"].includes(
        String(myStand.business_status || myStand.status || "").toLowerCase()
      ) && (myStand.is_published === 1 || myStand.is_published === true || myStand.is_published === "1" || myStand.published === true);
      if (live) {
        return {
          title: "Your stand is live",
          text: "View how customers see your business.",
          cta: "Preview Stand",
          onClick: () => onOpenProvider?.(myStand),
        };
      }
      return {
        title: "Complete your stand",
        text: "Add your location, services, and photos to appear on the map.",
        cta: "Complete Setup",
        onClick: () => onNavigate?.("dashboard"),
      };
    }
    return {
      title: "List your business",
      text: "Get discovered by more customers on Queless.",
      cta: "Go to Dashboard",
      onClick: () => onNavigate?.("dashboard"),
    };
  })();

  const isBusy = providersLoading || locationLoading;

  return (
    <div className="qmd" data-theme={theme}>
      {/* ── Sidebar ───────────────────────────────────── */}
      <aside className="qmd-sidebar">
        <button type="button" className="qmd-logo" onClick={() => onNavigate?.("home")} aria-label="Queless home">
          <img src={quelessLogo} alt="Queless" />
        </button>
        <nav className="qmd-nav" aria-label="Primary">
          {SIDEBAR_ITEMS.map(({ key, label, tab, Icon, active }) => (
            <button
              type="button"
              key={key}
              className={active ? "qmd-nav-item is-active" : "qmd-nav-item"}
              onClick={() => (active ? null : onNavigate?.(tab))}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="qmd-side-card">
          <strong>{sidebarCard.title}</strong>
          <p>{sidebarCard.text}</p>
          <button type="button" onClick={sidebarCard.onClick}>
            {sidebarCard.cta}
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────── */}
      <div className="qmd-main">
        <header className="qmd-topbar">
          <form className="qmd-search" onSubmit={submitSearch}>
            <FiSearch />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search services, providers, or places"
              aria-label="Search services, providers, or places"
            />
          </form>
          <button
            type="button"
            className="qmd-location"
            onClick={() => {
              const value = window.prompt("Set your location", locationLabel);
              if (value && value.trim()) onManualLocation?.(value.trim());
            }}
          >
            <FiMapPin />
            <span>{locationLoading ? "Detecting…" : locationLabel}</span>
          </button>
          <button
            type="button"
            className={hasActiveFilters ? "qmd-icon-btn is-active" : "qmd-icon-btn"}
            onClick={() => setStatusFilters((prev) => (Object.values(prev).some(Boolean) ? EMPTY_STATUS : { ...prev, openNow: true }))}
            aria-label="Filters"
            title="Toggle Open Now filter"
          >
            <FiSliders />
          </button>
          <button type="button" className="qmd-icon-btn" onClick={onOpenNotifications} aria-label="Notifications">
            <FiBell />
            {unreadCount > 0 ? <i className="qmd-badge">{unreadCount > 9 ? "9+" : unreadCount}</i> : null}
          </button>
          <button type="button" className="qmd-avatar-btn" onClick={onOpenMenu} aria-label="Account menu">
            <UserAvatar
              profilePhoto={currentUser?.profilePhoto || currentUser?.profile_photo || ""}
              fullName={currentUser?.fullName || currentUser?.full_name || ""}
              username={currentUser?.username || ""}
              email={currentUser?.email || ""}
              size={36}
            />
          </button>
          <button type="button" className="qmd-close" onClick={onClose} aria-label="Close map">
            <FiX />
          </button>
        </header>

        {/* ── Filter chips ─────────────────────────────── */}
        <div className="qmd-chips" role="group" aria-label="Filters">
          {CATEGORY_CHIPS.map((chip) => (
            <button
              type="button"
              key={chip.label}
              className={activeCategoryIcon === chip.icon ? "qmd-chip is-active" : "qmd-chip"}
              onClick={() => {
                setActiveCategoryIcon((prev) => (prev === chip.icon ? "" : chip.icon));
                setSelectedMarker(null);
              }}
            >
              {chip.label}
            </button>
          ))}
          <span className="qmd-chip-divider" aria-hidden="true" />
          {STATUS_CHIPS.map((chip) => (
            <button
              type="button"
              key={chip.key}
              className={statusFilters[chip.key] ? "qmd-chip qmd-chip--status is-active" : "qmd-chip qmd-chip--status"}
              onClick={() => {
                setStatusFilters((prev) => ({ ...prev, [chip.key]: !prev[chip.key] }));
                setSelectedMarker(null);
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* ── Content: map + right column ──────────────── */}
        <div className="qmd-content">
          <div className="qmd-mapwrap">
            <div className="qmd-status-pills">
              <span className="qmd-pill qmd-pill--live">{marketStats.active} live providers</span>
              <span className="qmd-pill">{marketStats.openNow} open now</span>
              <span className="qmd-pill qmd-pill--muted">Updated just now</span>
            </div>

            <MapContainer center={center} zoom={mapZoom} className="qmd-map" scrollWheelZoom>
              <MapRecenter center={center} zoom={mapZoom} />
              <TileLayer key={theme} attribution={TILE_ATTRIBUTION} url={TILE_URL} />
              <ClusteredProviderMarkers
                markers={filteredMarkers}
                selectedMarkerId={activeSelectedMarker?.id || ""}
                userLocation={userLocation}
                locationLabel={locationLabel}
                currentUser={currentUser}
                onSelectMarker={setSelectedMarker}
              />
            </MapContainer>

            <button
              type="button"
              className="qmd-locate"
              onClick={onUseCurrentLocation}
              disabled={locationLoading}
              aria-label="Use my location"
            >
              <FiNavigation />
            </button>

            {isBusy ? (
              <div className="qmd-map-overlay" role="status">
                <span className="qmd-spinner" />
                <strong>Finding nearby providers…</strong>
              </div>
            ) : null}

            {!isBusy && providersError ? (
              <div className="qmd-map-state">
                <strong>We could not load providers</strong>
                <p>Please check your connection and try again.</p>
                <button type="button" className="qmd-btn qmd-btn--primary" onClick={onRefreshProviders}>
                  <FiRefreshCw /> Retry
                </button>
              </div>
            ) : null}

            {!isBusy && !providersError && !filteredMarkers.length ? (
              <div className="qmd-map-state">
                <strong>No providers found nearby</strong>
                <p>Try changing your filters or expanding your search area.</p>
                <button type="button" className="qmd-btn qmd-btn--primary" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>

          <div className="qmd-rightcol">
            {activeSelectedMarker ? (
              <ProviderPreviewPanel
                marker={activeSelectedMarker}
                isOwner={isOwnProvider(activeSelectedMarker.provider, currentUser)}
                isFavorite={favorites.includes(Number(activeSelectedMarker.provider?.id))}
                onClose={() => setSelectedMarker(null)}
                onOpenProvider={onOpenProvider}
                onMessageProvider={onMessageProvider}
                onToggleFavorite={onToggleFavorite}
                onNavigate={onNavigate}
              />
            ) : (
              <>
                <MarketAtGlance stats={marketStats} />
                <ProviderMarkerLegend />
                {locationMessage ? <p className="qmd-location-note">{locationMessage}</p> : null}
              </>
            )}
          </div>
        </div>

        {/* ── Nearby providers ─────────────────────────── */}
        <section className="qmd-nearby" aria-label="Nearby providers">
          <header>
            <strong>Nearby providers</strong>
            {hasActiveFilters ? (
              <button type="button" className="qmd-link" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </header>
          {isBusy ? (
            <div className="qmd-nearby-rail">
              {[0, 1, 2, 3].map((index) => (
                <div className="qmd-nearby-card qmd-nearby-card--skeleton" key={index} aria-hidden="true">
                  <div className="qmd-nearby-media" />
                  <div className="qmd-nearby-body">
                    <span className="qmd-skel qmd-skel--title" />
                    <span className="qmd-skel" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMarkers.length ? (
            <div className="qmd-nearby-rail">
              {filteredMarkers.slice(0, 12).map((marker) => (
                <NearbyProviderCard
                  key={marker.id}
                  marker={marker}
                  isFavorite={favorites.includes(Number(marker.provider?.id))}
                  onOpenProvider={(provider) => {
                    setSelectedMarker(marker);
                    onOpenProvider?.(provider);
                  }}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          ) : (
            <div className="qmd-nearby-empty">
              <strong>No providers found nearby</strong>
              <p>Try changing your filters or expanding your search area.</p>
              {hasActiveFilters ? (
                <button type="button" className="qmd-btn qmd-btn--primary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
