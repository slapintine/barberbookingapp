import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { FiBell, FiMapPin, FiMenu, FiNavigation, FiSearch, FiStar } from "react-icons/fi";
import fallbackStandIcon from "../../assets/queless-logo-icon.png";
import quelessLogo from "../../assets/queless-logo-full.png";
import { buildCategoryServices } from "../../utils/marketplaceServices.js";

const providerPin = new L.DivIcon({
  className: "queless-map-pin-wrap",
  html: `<div class="queless-map-pin"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function getClusterPin(count) {
  return new L.DivIcon({
    className: "queless-map-pin-wrap",
    html: `<div class="queless-map-cluster">${count}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const userPin = new L.DivIcon({
  className: "queless-user-pin-wrap",
  html: `<div class="queless-user-pin"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const KAMPALA_CENTER = [0.3476, 32.5825];
const GAYAZA_CENTER = [0.4516, 32.6089];

function MapRecenter({ center, zoom }) {
  const map = useMap();
  const previous = useRef("");
  const key = `${center?.[0] || ""}|${center?.[1] || ""}|${zoom || ""}`;

  useEffect(() => {
    if (!key || key === previous.current) return;
    previous.current = key;
    map.flyTo(center, zoom, { duration: 0.6 });
  }, [center, key, map, zoom]);

  return null;
}

function getServiceTitle(service = {}) {
  return service.service_name || service.name || service.title || "Service";
}

function getMarkers(providers = [], category = "") {
  const isCategoryView = Boolean(category && category !== "All");
  const services = buildCategoryServices(providers, category);
  const source = services.length || isCategoryView
    ? services
    : (Array.isArray(providers) ? providers : []).map((provider, index) => ({
        id: `provider-${provider?.id || index}`,
        provider,
        service: Array.isArray(provider?.services) ? provider.services[0] || {} : {},
        title: getServiceTitle(Array.isArray(provider?.services) ? provider.services[0] || {} : {}),
        rating: Number(provider?.rating || 0) ? Number(provider.rating).toFixed(1) : "New",
      }));

  const markers = source
    .map((item) => {
      const latitude = Number(item.provider?.latitude);
      const longitude = Number(item.provider?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { ...item, latitude, longitude };
    })
    .filter(Boolean);

  const grouped = new Map();
  markers.forEach((marker) => {
    const key = `${marker.latitude.toFixed(4)}|${marker.longitude.toFixed(4)}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...marker, listings: [marker] });
      return;
    }
    existing.listings.push(marker);
    existing.title = `${existing.listings.length} services`;
  });

  return [...grouped.values()];
}

function getMarkerServiceCount(marker = {}) {
  if (Array.isArray(marker.listings) && marker.listings.length > 1) return marker.listings.length;
  if (Array.isArray(marker.provider?.services) && marker.provider.services.length) return marker.provider.services.length;
  return 1;
}

function getProviderSearchText(provider = {}, marker = {}) {
  const services = Array.isArray(provider.services) ? provider.services : [];
  return [
    provider.business_name,
    provider.location,
    provider.business_type,
    provider.intro_text,
    marker.title,
    ...services.flatMap((service) => [
      service.service_name,
      service.name,
      service.title,
      service.category,
      service.description,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getDistanceKm(from, to) {
  if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude) return Number.POSITIVE_INFINITY;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveSearchCenter(query) {
  const value = String(query || "").toLowerCase();
  if (value.includes("gayaza")) return GAYAZA_CENTER;
  if (value.includes("kampala") || value.includes("ntinda") || value.includes("bukoto")) return KAMPALA_CENTER;
  return null;
}

export default function MarketplaceMapOverlay({
  show,
  theme = "dark",
  category,
  providers,
  userLocation,
  locationLabel = "Near you",
  locationMessage = "",
  locationLoading = false,
  unreadCount = 0,
  onClose,
  onOpenNotifications,
  onUseCurrentLocation,
  onManualLocation,
  onRefreshProviders,
  onOpenProvider,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [nearbyOnly, setNearbyOnly] = useState(false);

  const markers = useMemo(() => getMarkers(providers, category), [providers, category]);
  const cleanSearch = searchQuery.trim().toLowerCase();
  const filteredMarkers = useMemo(() => {
    const matching = cleanSearch
      ? markers.filter((marker) => getProviderSearchText(marker.provider, marker).includes(cleanSearch))
      : markers;
    const withDistance = matching.map((marker) => ({
      ...marker,
      distanceKm: getDistanceKm(userLocation, marker),
    }));
    const nearby = nearbyOnly && userLocation?.latitude && userLocation?.longitude
      ? withDistance.filter((marker) => marker.distanceKm <= 25)
      : withDistance;
    return nearby.sort((a, b) => a.distanceKm - b.distanceKm);
  }, [cleanSearch, markers, nearbyOnly, userLocation]);

  const searchCenter = resolveSearchCenter(searchQuery || locationLabel);
  const center = userLocation?.latitude && userLocation?.longitude
    ? [Number(userLocation.latitude), Number(userLocation.longitude)]
    : searchCenter
    ? searchCenter
    : filteredMarkers[0]
    ? [filteredMarkers[0].latitude, filteredMarkers[0].longitude]
    : KAMPALA_CENTER;
  const isDark = theme !== "light";
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  if (!show) return null;

  const submitSearch = (event) => {
    event.preventDefault();
    setNearbyOnly(false);
    const value = searchQuery.trim();
    if (value) {
      onManualLocation?.(value);
    }
  };

  const showNearby = () => {
    setNearbyOnly(true);
    onRefreshProviders?.();
    if (!userLocation?.latitude || !userLocation?.longitude) {
      onUseCurrentLocation?.();
    }
  };

  return (
    <div className="queless-map-overlay">
      <div className="queless-map-appbar">
        <button type="button" onClick={onClose} aria-label="Close map">
          <FiMenu />
        </button>
        <img src={quelessLogo} alt="Queless" />
        <button type="button" onClick={onOpenNotifications} aria-label="Open notifications">
          <FiBell />
          {unreadCount > 0 ? <span>{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
        </button>
      </div>

      <form className="queless-map-search" onSubmit={submitSearch}>
        <FiSearch />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search services or areas"
        />
      </form>

      <div className="queless-map-stage">
        <MapContainer center={center} zoom={filteredMarkers.length ? 13 : 11} className="queless-map-canvas" scrollWheelZoom>
          <MapRecenter center={center} zoom={filteredMarkers.length ? 13 : 11} />
          <TileLayer key={theme} attribution={tileAttribution} url={tileUrl} />
          {userLocation?.latitude && userLocation?.longitude ? (
            <Marker position={[Number(userLocation.latitude), Number(userLocation.longitude)]} icon={userPin}>
              <Popup>
                <strong>Your location</strong>
                <br />
                <span>{locationLabel}</span>
              </Popup>
            </Marker>
          ) : null}
          {filteredMarkers.map((marker) => (
            <Marker
              key={marker.id}
              position={[marker.latitude, marker.longitude]}
              icon={marker.listings?.length > 1 ? getClusterPin(marker.listings.length) : providerPin}
            >
              <Popup>
                <div className="queless-map-popup">
                  <img
                    src={marker.provider?.image || fallbackStandIcon}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.src = fallbackStandIcon;
                    }}
                  />
                  <div className="queless-map-popup-copy">
                    <strong>{marker.provider?.business_name || "Queless provider"}</strong>
                    <span>{marker.title}</span>
                    <div className="queless-map-popup-meta">
                      <small><FiStar /> {marker.rating}</small>
                      <small><FiMapPin /> {marker.provider?.location || "Nearby"}</small>
                    </div>
                    <span>{getMarkerServiceCount(marker)} service{getMarkerServiceCount(marker) === 1 ? "" : "s"} available</span>
                    {Number.isFinite(marker.distanceKm) ? <em>{marker.distanceKm.toFixed(1)} km away</em> : null}
                  </div>
                  <div className="queless-map-popup-actions">
                    <button type="button" onClick={() => onOpenProvider?.(marker.provider)}>
                      View details
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <button
          type="button"
          className="queless-map-locate"
          onClick={onUseCurrentLocation}
          aria-label="Use current location"
          disabled={locationLoading}
        >
          <FiNavigation />
        </button>
      </div>

      <div className="queless-map-footer">
        {locationMessage ? <div className="queless-map-message">{locationMessage}</div> : null}
        {!filteredMarkers.length ? (
          <div className="queless-map-empty">
            <FiMapPin />
            <strong>No providers matched this area yet.</strong>
          </div>
        ) : null}
        <button type="button" className="queless-map-nearby-cta" onClick={showNearby} disabled={locationLoading}>
          <FiNavigation />
          <span>{locationLoading ? "Finding your location..." : "Show providers near me"}</span>
        </button>
      </div>
    </div>
  );
}
