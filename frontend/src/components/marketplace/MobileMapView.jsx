import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import {
  FiArrowLeft,
  FiCalendar,
  FiCamera,
  FiCheck,
  FiChevronRight,
  FiCompass,
  FiDroplet,
  FiFeather,
  FiHeart,
  FiMapPin,
  FiMessageCircle,
  FiMoreHorizontal,
  FiNavigation,
  FiScissors,
  FiSliders,
  FiStar,
  FiUser,
  FiWind,
} from "react-icons/fi";
import { resolveProviderMapIconType } from "../../utils/mapIconCategories.js";
import {
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
  resolveSearchCenter,
} from "./mapCore.jsx";
import "./ServiceMapMarker.css";
import "./MobileMapView.css";

// Same OSM tiles as the rest of the app (warmed to a cream tone via CSS in
// MobileMapView.css) to match the light reference look without a new tile host.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Each chip maps to the same icon-type bucket used to draw markers, so a chip
// and the pins it filters always agree.
const CATEGORY_CHIPS = [
  { label: "Barber", icon: "barber", Icon: FiScissors },
  { label: "Nails", icon: "beauty", Icon: FiFeather },
  { label: "Photography", icon: "events-photography", Icon: FiCamera },
  { label: "Massage", icon: "spa", Icon: FiHeart },
  { label: "Salon", icon: "salon", Icon: FiWind },
  { label: "Spa", icon: "spa", Icon: FiDroplet },
];

const NAV_ITEMS = [
  { key: "discover", label: "Discover", tab: "home", Icon: FiCompass },
  { key: "bookings", label: "Bookings", tab: "bookings", Icon: FiCalendar },
  { key: "map", label: "Map", tab: "map", Icon: FiMapPin, active: true },
  { key: "messages", label: "Messages", tab: "inbox", Icon: FiMessageCircle },
  { key: "profile", label: "Profile", tab: "profile", Icon: FiUser },
];

function ProviderSheet({
  marker,
  isOwner,
  isFavorite,
  onOpenProvider,
  onToggleFavorite,
}) {
  const provider = marker.provider || {};
  const verified = isProviderVerified(provider);
  const distanceText = Number.isFinite(marker.distanceKm) ? `${marker.distanceKm.toFixed(1)} km` : "";
  const reviewCount = Number(provider.reviewCount || 0);
  const ratingLabel = marker.rating && marker.rating !== "New" ? marker.rating : "New";

  return (
    <div className="qmm-sheet-body">
      <button
        type="button"
        className="qmm-thumb"
        onClick={() => onOpenProvider?.(provider)}
        aria-label={`Open ${provider.business_name || "provider"}`}
      >
        <img
          src={resolveProviderImage(provider)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleProviderImageError(provider)}
        />
        {!isOwner ? (
          <span
            className={isFavorite ? "qmm-thumb-fav is-active" : "qmm-thumb-fav"}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite?.(provider.id);
            }}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <FiHeart />
          </span>
        ) : null}
      </button>

      <div className="qmm-sheet-info">
        <div className="qmm-sheet-top">
          <strong className="qmm-sheet-name">{provider.business_name || "Queless provider"}</strong>
          <button type="button" className="qmm-kebab" onClick={() => onOpenProvider?.(provider)} aria-label="More options">
            <FiMoreHorizontal />
          </button>
        </div>

        <span className="qmm-tag">
          <FiScissors /> {marker.category || marker.title || "Local services"}
        </span>

        <div className="qmm-rating-row">
          <FiStar className="qmm-star" />
          <b>{ratingLabel}</b>
          {reviewCount ? <span className="qmm-reviews">({reviewCount > 120 ? "120+" : reviewCount})</span> : null}
          {distanceText ? <span className="qmm-dot">•</span> : null}
          {distanceText ? <span className="qmm-distance">{distanceText}</span> : null}
        </div>

        {provider.location ? (
          <p className="qmm-location">
            <FiMapPin /> {provider.location}
          </p>
        ) : null}

        {verified ? (
          <span className="qmm-verified">
            <FiCheck /> Verified Provider
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function MobileMapView({
  theme = "light",
  currentUser = null,
  category = "All",
  providers,
  userLocation,
  locationLabel = "Kampala, Uganda",
  locationLoading = false,
  favorites = [],
  onClose,
  onNavigate,
  onUseCurrentLocation,
  onOpenProvider,
  onToggleFavorite,
}) {
  const [activeCategoryIcon, setActiveCategoryIcon] = useState("");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const autoLocationRequestedRef = useRef(false);

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

  const filteredMarkers = useMemo(() => {
    let list = baseMarkers;
    if (activeCategoryIcon) {
      list = list.filter((marker) => resolveProviderMapIconType(marker.provider, marker) === activeCategoryIcon);
    }
    if (openNowOnly) list = list.filter((marker) => isProviderOpenNow(marker.provider));
    return list
      .map((marker) => ({ ...marker, distanceKm: getDistanceKm(userLocation, marker) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [activeCategoryIcon, baseMarkers, openNowOnly, userLocation]);

  // Show the selected provider, or default to the nearest so the sheet is never
  // empty when providers exist (mirrors the reference).
  const cardMarker =
    filteredMarkers.find((marker) => marker.id === selectedMarkerId) || filteredMarkers[0] || null;
  const cardIsOwner = isOwnProvider(cardMarker?.provider, currentUser);

  const center = userLocation?.latitude && userLocation?.longitude
    ? [Number(userLocation.latitude), Number(userLocation.longitude)]
    : resolveSearchCenter(locationLabel) || (filteredMarkers[0]
      ? [filteredMarkers[0].latitude, filteredMarkers[0].longitude]
      : GAYAZA_CENTER);
  const mapZoom = userLocation?.latitude && userLocation?.longitude ? 14 : 13;

  return (
    <div className="qmm" data-theme={theme}>
      {/* ── Header ─────────────────────────────────────── */}
      <header className="qmm-header">
        <button type="button" className="qmm-round-btn" onClick={onClose} aria-label="Back">
          <FiArrowLeft />
        </button>
        <h1 className="qmm-title">View Map</h1>
        <button
          type="button"
          className={openNowOnly ? "qmm-round-btn is-active" : "qmm-round-btn"}
          onClick={() => setOpenNowOnly((value) => !value)}
          aria-label="Filters"
          aria-pressed={openNowOnly}
        >
          <FiSliders />
        </button>
      </header>

      {/* ── Category chips ─────────────────────────────── */}
      <div className="qmm-chips" role="group" aria-label="Categories">
        {CATEGORY_CHIPS.map(({ label, icon, Icon }) => (
          <button
            type="button"
            key={label}
            className={activeCategoryIcon === icon ? "qmm-chip is-active" : "qmm-chip"}
            onClick={() => {
              setActiveCategoryIcon((prev) => (prev === icon ? "" : icon));
              setSelectedMarkerId("");
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className="qmm-chip"
          onClick={() => {
            setActiveCategoryIcon("");
            setOpenNowOnly(false);
            setSelectedMarkerId("");
          }}
        >
          <FiMoreHorizontal />
          <span>More</span>
        </button>
      </div>

      {/* ── Map ────────────────────────────────────────── */}
      <div className="qmm-map-area">
        <MapContainer center={center} zoom={mapZoom} className="qmm-map" scrollWheelZoom zoomControl={false}>
          <MapRecenter center={center} zoom={mapZoom} />
          <TileLayer key={theme} attribution={TILE_ATTRIBUTION} url={TILE_URL} />
          <ClusteredProviderMarkers
            markers={filteredMarkers}
            selectedMarkerId={cardMarker?.id || ""}
            userLocation={userLocation}
            locationLabel={locationLabel}
            currentUser={currentUser}
            onSelectMarker={(marker) => setSelectedMarkerId(marker.id)}
          />
        </MapContainer>

        <button
          type="button"
          className="qmm-locate"
          onClick={onUseCurrentLocation}
          disabled={locationLoading}
          aria-label="Recenter to my location"
        >
          <FiNavigation />
        </button>

        {/* ── Bottom sheet ─────────────────────────────── */}
        <section className="qmm-sheet" aria-label="Selected provider">
          <span className="qmm-handle" aria-hidden="true" />
          {cardMarker ? (
            <>
              <ProviderSheet
                marker={cardMarker}
                isOwner={cardIsOwner}
                isFavorite={favorites.includes(Number(cardMarker.provider?.id))}
                onOpenProvider={onOpenProvider}
                onToggleFavorite={onToggleFavorite}
              />
              <button
                type="button"
                className="qmm-cta"
                onClick={() => onOpenProvider?.(cardMarker.provider)}
              >
                <span>{cardIsOwner ? "Manage Stand" : "View Stand"}</span>
                <FiChevronRight />
              </button>
            </>
          ) : (
            <div className="qmm-empty">
              <strong>No providers found nearby</strong>
              <p>Try changing your filters or expanding the map area.</p>
              {(activeCategoryIcon || openNowOnly) ? (
                <button
                  type="button"
                  className="qmm-cta qmm-cta--ghost"
                  onClick={() => {
                    setActiveCategoryIcon("");
                    setOpenNowOnly(false);
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* ── Bottom navigation ──────────────────────────── */}
      <nav className="qmm-bottomnav" aria-label="Primary">
        {NAV_ITEMS.map(({ key, label, tab, Icon, active }) => (
          <button
            type="button"
            key={key}
            className={active ? "qmm-navitem is-active" : "qmm-navitem"}
            onClick={() => (active ? null : onNavigate?.(tab))}
            aria-current={active ? "page" : undefined}
          >
            <span className="qmm-navicon">
              <Icon />
            </span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
