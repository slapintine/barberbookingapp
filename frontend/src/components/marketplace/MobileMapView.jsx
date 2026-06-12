import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import {
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiGrid,
  FiHeart,
  FiList,
  FiMapPin,
  FiMessageCircle,
  FiMinus,
  FiNavigation,
  FiPlus,
  FiSearch,
  FiSliders,
  FiStar,
  FiX,
} from "react-icons/fi";
import quelessLogoFull from "../../assets/queless-logo-full.png";
import { getCategoryDef } from "../../utils/categoryRegistry.jsx";
import { MARKETPLACE_CATEGORIES } from "../../utils/serviceCatalog.js";
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
import { getCategoryIconComponent } from "./ServiceMapMarker.jsx";
import "./ServiceMapMarker.css";
import "./MobileMapView.css";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Built from the same MARKETPLACE_CATEGORIES used on the Categories page and throughout the app.
// "All" is always first; remaining chips follow the catalogue order.
// Adding a new active category to serviceCatalog.js automatically adds it here.
const ALL_CHIP = { label: "All", icon: "", IconComp: FiGrid, primaryColor: "#522B5B", softBg: "#f5edf8" };

const CATEGORY_CHIPS = [
  ALL_CHIP,
  ...MARKETPLACE_CATEGORIES
    .filter((cat) => cat.active !== false)
    .map((cat) => {
      const def = getCategoryDef(cat.id);
      return { label: def.shortLabel, icon: cat.id, IconComp: def.Icon, primaryColor: def.primaryColor, softBg: def.softBg };
    }),
];


/* Grabs the Leaflet map instance so external buttons can call zoomIn/zoomOut */
function MapCaptureRef({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

/* ── Category icon inside nearby cards ─────────────── */
function CategoryIconSmall({ iconType }) {
  const Icon = getCategoryIconComponent(iconType || "default");
  return <Icon size={11} />;
}

/* ── Full provider bottom sheet ─────────────────────── */
function ProviderSheet({ marker, isOwner, isFavorite, onOpenProvider, onToggleFavorite, onMessageProvider, onClose }) {
  const provider = marker.provider || {};
  const open = isProviderOpenNow(provider);
  const verified = isProviderVerified(provider);
  const closing = getProviderClosingTime(provider);
  const distanceText = Number.isFinite(marker.distanceKm) ? `${marker.distanceKm.toFixed(1)} km` : "";
  const reviewCount = Number(provider.reviewCount || 0);
  const ratingLabel = marker.rating && marker.rating !== "New" ? marker.rating : "New";
  const tier = getProviderTier(provider);

  return (
    <div className="qmm-sheet-inner" data-testid="map-provider-preview">
      <div className="qmm-handle-row">
        <span className="qmm-handle" aria-hidden="true" />
      </div>

      {/* Cover image */}
      <div className="qmm-sheet-cover">
        <img
          src={resolveProviderImage(provider)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleProviderImageError(provider)}
        />
        <div className="qmm-sheet-cover-scrim" />
        {tier !== "FREE" && (
          <span className={`qmm-tier-badge qmm-tier-badge--${tier.toLowerCase()}`}>{tier}</span>
        )}
        <span className={open ? "qmm-status-pill qmm-status-pill--open" : "qmm-status-pill qmm-status-pill--closed"}>
          {open ? "Open" : "Closed"}
        </span>
        {!isOwner && (
          <button
            type="button"
            className={isFavorite ? "qmm-sheet-fav is-active" : "qmm-sheet-fav"}
            onClick={() => onToggleFavorite?.(provider.id)}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <FiHeart />
          </button>
        )}
        <button type="button" className="qmm-sheet-dismiss" onClick={onClose} aria-label="Close">
          <FiX />
        </button>
      </div>

      {/* Info body */}
      <div className="qmm-sheet-body">
        <div className="qmm-sheet-title-row">
          <strong className="qmm-sheet-name">{provider.business_name || "Queless Provider"}</strong>
          {verified && (
            <span className="qmm-verified-dot" title="Verified">
              <FiCheck />
            </span>
          )}
        </div>

        <span className="qmm-sheet-cat">
          <Scissors size={13} style={{ flexShrink: 0 }} />
          {marker.category || marker.title || "Local services"}
        </span>

        <div className="qmm-sheet-stats">
          <FiStar className="qmm-star-icon" />
          <b>{ratingLabel}</b>
          {reviewCount > 0 && (
            <span className="qmm-muted">({reviewCount > 120 ? "120+" : reviewCount})</span>
          )}
          {distanceText && (
            <>
              <span className="qmm-dot">•</span>
              <span className="qmm-muted">{distanceText}</span>
            </>
          )}
        </div>

        {provider.location && (
          <p className="qmm-sheet-loc">
            <FiMapPin style={{ flexShrink: 0 }} /> {provider.location}
          </p>
        )}
        {open && closing && (
          <p className="qmm-sheet-loc qmm-muted">Closes at {closing}</p>
        )}

        {isOwner ? (
          <button type="button" className="qmm-btn-primary" onClick={() => onOpenProvider?.(provider)}>
            Manage Stand
          </button>
        ) : (
          <>
            <button type="button" className="qmm-btn-primary" onClick={() => onOpenProvider?.(provider)}>
              Book now
            </button>
            <div className="qmm-sheet-secondary">
              <button type="button" className="qmm-btn-ghost" onClick={() => onOpenProvider?.(provider)}>
                View profile
              </button>
              <button type="button" className="qmm-btn-ghost" onClick={() => onMessageProvider?.(provider)}>
                <FiMessageCircle /> Message
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Nearby provider card ────────────────────────────── */
function NearbyCard({ marker, isFavorite, onOpenProvider, onToggleFavorite, onSelectOnMap }) {
  const provider = marker.provider || {};
  const open = isProviderOpenNow(provider);
  const distanceText = Number.isFinite(marker.distanceKm) ? `${marker.distanceKm.toFixed(1)} km` : "";
  const reviewCount = Number(provider.reviewCount || 0);
  const tier = getProviderTier(provider);
  const iconType = resolveProviderMapIconType(provider, marker);
  const ratingLabel = marker.rating && marker.rating !== "New" ? marker.rating : "New";

  return (
    <article
      className="qmm-nearby-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelectOnMap?.(marker)}
      onKeyDown={(e) => e.key === "Enter" && onSelectOnMap?.(marker)}
    >
      <div className="qmm-nearby-img">
        <img
          src={resolveProviderImage(provider)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleProviderImageError(provider)}
        />
        {(tier === "PREMIUM" || tier === "PLATINUM") && (
          <span className="qmm-nearby-top-badge">⭐ Top rated</span>
        )}
        <button
          type="button"
          className={isFavorite ? "qmm-nearby-fav is-active" : "qmm-nearby-fav"}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(provider.id); }}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <FiHeart />
        </button>
      </div>
      <div className="qmm-nearby-info">
        <strong className="qmm-nearby-name">{provider.business_name || "Queless Provider"}</strong>
        <span className="qmm-nearby-cat">
          <CategoryIconSmall iconType={iconType} />
          {marker.category || marker.title || "Services"}
        </span>
        <div className="qmm-nearby-stats">
          <FiStar className="qmm-star-icon" />
          <b>{ratingLabel}</b>
          {reviewCount > 0 && (
            <span className="qmm-muted">({reviewCount > 120 ? "120+" : reviewCount})</span>
          )}
          {distanceText && (
            <>
              <span className="qmm-dot">•</span>
              <span className="qmm-muted">{distanceText}</span>
            </>
          )}
        </div>
        <span className={open ? "qmm-open-badge" : "qmm-closed-badge"}>
          {open ? "Open" : "Closed"}
        </span>
      </div>
    </article>
  );
}

/* ── Main component ──────────────────────────────────── */
export default function MobileMapView({
  theme = "light",
  setTheme,
  currentUser = null,
  category = "All",
  providers,
  userLocation,
  locationLabel = "Near you",
  locationLoading = false,
  locationMessage = "",
  favorites = [],
  unreadCount = 0,
  onClose,
  onNavigate,
  onUseCurrentLocation,
  onManualLocation,
  onClearLocation,
  onOpenProvider,
  onToggleFavorite,
  onOpenNotifications,
  onOpenMenu,
  onMessageProvider,
}) {
  const [activeCategoryIcon, setActiveCategoryIcon] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const [showLocMenu, setShowLocMenu] = useState(false);
  const [manualLocDraft, setManualLocDraft] = useState("");
  const mapRef = useRef(null);
  const nearbyRef = useRef(null);
  const locMenuRef = useRef(null);
  const chipsRef = useRef(null);
  const autoLocationRequestedRef = useRef(false);

  // Close location menu on outside tap
  useEffect(() => {
    if (!showLocMenu) return undefined;
    const handler = (e) => {
      if (locMenuRef.current && !locMenuRef.current.contains(e.target)) setShowLocMenu(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [showLocMenu]);

  const saveManualLocation = () => {
    const val = manualLocDraft.trim();
    if (!val) return;
    onManualLocation?.(val);
    setManualLocDraft("");
    setShowLocMenu(false);
  };

  // Seed the category chip from the launch category prop
  useEffect(() => {
    if (!category || category === "All") return;
    const resolved = resolveProviderMapIconType({ business_type: category, category_name: category });
    const match = CATEGORY_CHIPS.find((chip) => chip.icon && (chip.icon === resolved || chip.icon === category));
    if (match) setActiveCategoryIcon(match.icon);
  }, [category]);

  // Scroll active chip into view
  useEffect(() => {
    if (!chipsRef.current) return;
    const active = chipsRef.current.querySelector(".is-active");
    if (active) active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCategoryIcon]);

  // Auto-request geolocation if already granted
  useEffect(() => {
    if (userLocation?.latitude || autoLocationRequestedRef.current) return;
    autoLocationRequestedRef.current = true;
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((perm) => { if (perm.state === "granted") onUseCurrentLocation?.(); })
      .catch(() => {});
  }, [onUseCurrentLocation, userLocation]);

  const baseMarkers = useMemo(() => getMarkers(providers, "All"), [providers]);

  const cleanSearch = searchDraft.trim().toLowerCase();

  const filteredMarkers = useMemo(() => {
    let list = baseMarkers;
    if (activeCategoryIcon) {
      list = list.filter(
        (m) => resolveProviderMapIconType(m.provider, m) === activeCategoryIcon
      );
    }
    if (cleanSearch) {
      list = list.filter((m) => getProviderSearchText(m.provider, m).includes(cleanSearch));
    }
    return list
      .map((m) => ({ ...m, distanceKm: getDistanceKm(userLocation, m) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [activeCategoryIcon, baseMarkers, cleanSearch, userLocation]);

  const cardMarker = filteredMarkers.find((m) => m.id === selectedMarkerId) || null;
  const cardIsOwner = isOwnProvider(cardMarker?.provider, currentUser);

  const center =
    userLocation?.latitude && userLocation?.longitude
      ? [Number(userLocation.latitude), Number(userLocation.longitude)]
      : resolveSearchCenter(locationLabel) ||
        (filteredMarkers[0]
          ? [filteredMarkers[0].latitude, filteredMarkers[0].longitude]
          : GAYAZA_CENTER);
  const mapZoom = userLocation?.latitude && userLocation?.longitude ? 14 : 13;

  const handleSelectMarker = (marker) => {
    setSelectedMarkerId(marker.id);
    if (mapRef.current && marker.latitude && marker.longitude) {
      mapRef.current.panTo([Number(marker.latitude), Number(marker.longitude)], {
        animate: true,
        duration: 0.35,
      });
    }
  };

  return (
    <div className="qmm" data-theme={theme}>

      {/* ── Header ──────────────────────────────────────── */}
      <header className="qmm-header">
        <button type="button" className="qmm-logo-btn" onClick={onClose} aria-label="Back to home">
          <img src={quelessLogoFull} alt="Queless" className="qmm-logo-img" />
        </button>

        {/* Location pill + dropdown */}
        <div className="qmm-loc-wrap" ref={locMenuRef}>
          <button
            type="button"
            className="qmm-location-pill"
            onClick={() => setShowLocMenu((v) => !v)}
            aria-expanded={showLocMenu}
            aria-label="Change location"
          >
            <FiMapPin className="qmm-loc-pin" />
            <span className="qmm-loc-text">
              {locationLoading ? "Detecting…" : (locationLabel || "Near you")}
            </span>
            <FiChevronDown className="qmm-loc-chevron" />
          </button>

          {showLocMenu && (
            <div className="qmm-loc-menu">
              <button
                type="button"
                className="qmm-loc-menu-btn qmm-loc-menu-btn--gps"
                disabled={locationLoading}
                onClick={() => {
                  onUseCurrentLocation?.();
                  setShowLocMenu(false);
                }}
              >
                <FiNavigation />
                {locationLoading ? "Detecting location…" : "Use my current location"}
              </button>

              <div className="qmm-loc-manual-row">
                <FiSearch className="qmm-loc-manual-icon" />
                <input
                  className="qmm-loc-manual-input"
                  placeholder="Enter area or address"
                  value={manualLocDraft}
                  onChange={(e) => setManualLocDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveManualLocation(); }}
                />
                <button type="button" className="qmm-loc-manual-save" onClick={saveManualLocation}>
                  Go
                </button>
              </div>

              {locationLabel && locationLabel !== "Near you" && (
                <button
                  type="button"
                  className="qmm-loc-menu-btn qmm-loc-menu-btn--clear"
                  onClick={() => { onClearLocation?.(); setShowLocMenu(false); }}
                >
                  <FiX /> Clear location
                </button>
              )}

              {locationMessage && <p className="qmm-loc-msg">{locationMessage}</p>}
            </div>
          )}
        </div>

        <button type="button" className="qmm-close-btn" onClick={onClose} aria-label="Close map">
          <FiX />
        </button>
      </header>

      {/* ── Scrollable body ─────────────────────────────── */}
      <div className="qmm-body">

        {/* Search row */}
        <div className="qmm-search-row">
          <div className="qmm-search-wrap">
            <FiSearch className="qmm-search-icon" />
            <input
              className="qmm-search-input"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search services or providers"
              aria-label="Search services or providers"
            />
            {searchDraft && (
              <button
                type="button"
                className="qmm-search-clear"
                onClick={() => setSearchDraft("")}
                aria-label="Clear search"
              >
                <FiX />
              </button>
            )}
          </div>
          <button
            type="button"
            className="qmm-smart-btn"
            onClick={() => onNavigate?.("smart-match")}
            aria-label="Smart match"
          >
            {/* Lightning bolt icon */}
            <svg viewBox="0 0 24 24" fill="none" className="qmm-smart-icon" aria-hidden="true">
              <path
                d="M13 2L4.5 13.5H11L10 22L20.5 9.5H14L13 2Z"
                fill="currentColor"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Category chips — all active categories from the shared catalogue */}
        <div className="qmm-chips-wrap">
        <div className="qmm-chips" role="group" aria-label="Filter by category" ref={chipsRef}>
          {CATEGORY_CHIPS.map(({ label, icon, IconComp, primaryColor, softBg }) => {
            const isAll = icon === "";
            const active = activeCategoryIcon === icon;
            return (
            <button
              type="button"
              key={label}
              className={["qmm-chip", isAll ? "qmm-chip--all" : "", active ? "is-active" : ""].filter(Boolean).join(" ")}
              style={{ "--chip-color": primaryColor, "--chip-bg": softBg }}
              onClick={() => {
                setActiveCategoryIcon(icon);
                setSelectedMarkerId("");
              }}
              aria-pressed={active}
              aria-label={`Filter by ${label}`}
            >
              <span className="qmm-chip-icon-wrap">
                <IconComp size={11} />
              </span>
              <span>{label}</span>
            </button>
            );
          })}
        </div>
        </div>

        {/* Map zone */}
        <div className="qmm-map-zone">
          <MapContainer
            center={center}
            zoom={mapZoom}
            className="qmm-map"
            scrollWheelZoom
            zoomControl={false}
          >
            <MapRecenter center={center} zoom={mapZoom} />
            <MapCaptureRef mapRef={mapRef} />
            <TileLayer key={theme} attribution={TILE_ATTRIBUTION} url={TILE_URL} />
            <ClusteredProviderMarkers
              markers={filteredMarkers}
              selectedMarkerId={cardMarker?.id || ""}
              userLocation={userLocation}
              locationLabel={locationLabel}
              currentUser={currentUser}
              onSelectMarker={handleSelectMarker}
            />
          </MapContainer>

          {/* Right-side controls: recenter + zoom */}
          <div className="qmm-map-controls">
            <button
              type="button"
              className="qmm-ctrl-btn"
              onClick={onUseCurrentLocation}
              aria-label="Recenter to my location"
            >
              <FiNavigation />
            </button>
            <div className="qmm-ctrl-sep" aria-hidden="true" />
            <button
              type="button"
              className="qmm-ctrl-btn"
              onClick={() => mapRef.current?.zoomIn()}
              aria-label="Zoom in"
            >
              <FiPlus />
            </button>
            <button
              type="button"
              className="qmm-ctrl-btn"
              onClick={() => mapRef.current?.zoomOut()}
              aria-label="Zoom out"
            >
              <FiMinus />
            </button>
          </div>

          {/* Filter FAB */}
          <button
            type="button"
            className="qmm-fab qmm-fab--left"
            onClick={() => {
              // Toggle open-now filter as a simple filter action
              setActiveCategoryIcon((prev) => prev);
            }}
            aria-label="Filter"
          >
            <FiSliders />
            <span>Filter</span>
          </button>

          {/* List FAB */}
          <button
            type="button"
            className="qmm-fab qmm-fab--right"
            onClick={() =>
              nearbyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            aria-label="View list"
          >
            <FiList />
            <span>List</span>
          </button>
        </div>

        {/* Nearby providers */}
        <section className="qmm-nearby" ref={nearbyRef} aria-label="Nearby providers">
          <div className="qmm-nearby-header">
            <strong>Nearby providers</strong>
            <button
              type="button"
              className="qmm-see-all"
              onClick={() => onNavigate?.("categories")}
            >
              See all →
            </button>
          </div>

          {filteredMarkers.length > 0 ? (
            <div className="qmm-nearby-rail">
              {filteredMarkers.slice(0, 12).map((marker) => (
                <NearbyCard
                  key={marker.id}
                  marker={marker}
                  isFavorite={favorites.includes(Number(marker.provider?.id))}
                  onOpenProvider={onOpenProvider}
                  onToggleFavorite={onToggleFavorite}
                  onSelectOnMap={handleSelectMarker}
                />
              ))}
            </div>
          ) : (
            <div className="qmm-nearby-empty">
              <p>No providers found nearby</p>
              {activeCategoryIcon && (
                <button
                  type="button"
                  className="qmm-link"
                  onClick={() => {
                    setActiveCategoryIcon("");
                    setSearchDraft("");
                    setSelectedMarkerId("");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>

        <div className="qmm-body-end" />
      </div>

      {/* ── Provider bottom sheet (slides up when provider selected) ── */}
      <div
        className={cardMarker ? "qmm-sheet is-open" : "qmm-sheet"}
        aria-hidden={!cardMarker}
        aria-label="Selected provider"
      >
        {cardMarker && (
          <ProviderSheet
            marker={cardMarker}
            isOwner={cardIsOwner}
            isFavorite={favorites.includes(Number(cardMarker.provider?.id))}
            onOpenProvider={onOpenProvider}
            onToggleFavorite={onToggleFavorite}
            onMessageProvider={onMessageProvider}
            onClose={() => setSelectedMarkerId("")}
          />
        )}
      </div>

    </div>
  );
}
