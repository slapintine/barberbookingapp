import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { FiArrowLeft, FiMapPin, FiMenu, FiNavigation, FiSearch, FiStar, FiX } from "react-icons/fi";
import fallbackStandIcon from "../../assets/queless-logo-icon.png";
import "./ServiceMapMarker.css";
import "./MarketplaceMapOverlay.css";
import quelessLogo from "../../assets/queless-logo-full.png";
import { resolveProviderMapIconType } from "../../utils/mapIconCategories.js";
import { categoryMatches, getServiceCategory, isPublicMarketplaceProvider } from "../../utils/marketplaceServices.js";
import { renderServiceClusterHtml, renderServiceMarkerHtml, renderServicePopupIconHtml } from "./ServiceMapMarker.jsx";

const servicePinCache = new Map();
const clusterPinCache = new Map();

function buildServicePinHtml(iconType, selected = false) {
  return renderServiceMarkerHtml(iconType || "default", selected);
}

function getServicePinIcon(iconType, selected = false) {
  const key = `${iconType || "beauty-grooming"}:${selected ? "selected" : "default"}`;
  if (!servicePinCache.has(key)) {
    servicePinCache.set(
      key,
      new L.DivIcon({
        className: "queless-map-pin-wrap",
        html: buildServicePinHtml(iconType, selected),
        iconSize: selected ? [48, 60] : [44, 56],
        iconAnchor: selected ? [24, 57] : [22, 53],
      })
    );
  }
  return servicePinCache.get(key);
}

function getClusterPinIcon(count) {
  const bucket = count > 99 ? "99+" : String(count);
  if (!clusterPinCache.has(bucket)) {
    clusterPinCache.set(
      bucket,
      new L.DivIcon({
        className: "queless-map-cluster-wrap",
        html: renderServiceClusterHtml(count),
        iconSize: [54, 54],
        iconAnchor: [27, 27],
      })
    );
  }
  return clusterPinCache.get(bucket);
}

const userPin = new L.DivIcon({
  className: "queless-user-pin-wrap",
  html: `<div class="queless-user-pin" aria-hidden="true"><span></span></div>`,
  iconSize: [58, 58],
  iconAnchor: [29, 29],
});

const KAMPALA_CENTER = [0.3476, 32.5825];
const GAYAZA_CENTER = [0.4516, 32.6089];

function MapRecenter({ center, zoom }) {
  const map = useMap();
  const previous = useRef("");
  const key = `${center?.[0] || ""}|${center?.[1] || ""}|${zoom || ""}`;

  useEffect(() => {
    const resize = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(resize);
  }, [map]);

  useEffect(() => {
    if (!key || key === previous.current) return;
    previous.current = key;
    map.invalidateSize();
    map.flyTo(center, zoom, { duration: 0.6 });
  }, [center, key, map, zoom]);

  return null;
}

function getServiceTitle(service = {}) {
  return service.service_name || service.name || service.title || "Service";
}

function getProviderStableId(provider = {}, index = 0) {
  return String(
    provider.id ??
      provider.business_id ??
      provider.businessId ??
      provider.stand_id ??
      provider.standId ??
      provider.owner_user_id ??
      provider.user_id ??
      provider.username ??
      `${provider.business_name || "provider"}-${index}`
  );
}

function isProviderVisibleOnMap(provider = {}) {
  const latitude = Number(provider.latitude);
  const longitude = Number(provider.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return isPublicMarketplaceProvider(provider);
}

function providerMatchesMapCategory(provider = {}, category = "") {
  if (!category || category === "All") return true;
  const services = Array.isArray(provider.services) ? provider.services : [];
  return (
    categoryMatches({ category: provider.category_name || provider.business_type || provider.category || "" }, category) ||
    services.some((service) => categoryMatches(service, category))
  );
}

function pickProviderDisplayService(provider = {}, category = "") {
  const services = Array.isArray(provider.services) ? provider.services : [];
  if (!services.length) return {};
  if (!category || category === "All") return services[0] || {};
  return services.find((service) => categoryMatches(service, category)) || services[0] || {};
}

function getMarkers(providers = [], category = "") {
  const uniqueProviders = new Map();

  (Array.isArray(providers) ? providers : []).forEach((provider, index) => {
    if (!isProviderVisibleOnMap(provider)) return;
    if (!providerMatchesMapCategory(provider, category)) return;
    const id = getProviderStableId(provider, index);
    const existing = uniqueProviders.get(id);
    if (!existing) {
      uniqueProviders.set(id, provider);
      return;
    }
    const currentServices = Array.isArray(existing.services) ? existing.services : [];
    const nextServices = Array.isArray(provider.services) ? provider.services : [];
    uniqueProviders.set(id, {
      ...existing,
      ...provider,
      services: [...currentServices, ...nextServices].filter(
        (service, serviceIndex, list) =>
          list.findIndex((item) => String(item?.id || item?.service_name || item?.name || serviceIndex) === String(service?.id || service?.service_name || service?.name || serviceIndex)) === serviceIndex
      ),
    });
  });

  return [...uniqueProviders.entries()].map(([id, provider]) => {
    const service = pickProviderDisplayService(provider, category);
    return {
      id: `provider-${id}`,
      providerId: id,
      provider,
      service,
      title: getServiceTitle(service) || provider.business_type || "Provider",
      category: getServiceCategory(service) || provider.business_type || provider.category_name || "",
      rating: Number(provider?.rating || provider?.avg_rating || 0) ? Number(provider.rating || provider.avg_rating).toFixed(1) : "New",
      latitude: Number(provider.latitude),
      longitude: Number(provider.longitude),
    };
  });
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

function clusterMapMarkers(markers = [], map, zoom) {
  if (!map || zoom >= 14) return markers.map((marker) => ({ type: "marker", marker }));

  const bounds = map.getBounds().pad(0.35);
  const visibleMarkers = markers.filter((marker) => bounds.contains([marker.latitude, marker.longitude]));
  const gridSize = zoom <= 11 ? 76 : 58;
  const clusters = new Map();

  visibleMarkers.forEach((marker) => {
    const point = map.project([marker.latitude, marker.longitude], zoom);
    const key = `${Math.floor(point.x / gridSize)}:${Math.floor(point.y / gridSize)}`;
    const existing = clusters.get(key);
    if (!existing) {
      clusters.set(key, {
        type: "cluster",
        id: `cluster-${key}`,
        markers: [marker],
        point,
      });
      return;
    }
    existing.markers.push(marker);
    existing.point = existing.point.add(point);
  });

  return [...clusters.values()].map((cluster) => {
    if (cluster.markers.length === 1) return { type: "marker", marker: cluster.markers[0] };
    const point = cluster.point.divideBy(cluster.markers.length);
    const latLng = map.unproject(point, zoom);
    return {
      ...cluster,
      latitude: latLng.lat,
      longitude: latLng.lng,
      count: cluster.markers.length,
    };
  });
}

function spreadCloseMarkers(items = [], zoom) {
  if (zoom < 14) return items;
  const seen = new Map();

  return items.map((item) => {
    if (item.type !== "marker") return item;
    const marker = item.marker;
    const key = `${marker.latitude.toFixed(5)}:${marker.longitude.toFixed(5)}`;
    const index = seen.get(key) || 0;
    seen.set(key, index + 1);
    if (index === 0) return item;
    const angle = index * 2.3999632297;
    const radius = 0.00034 * Math.ceil(index / 6);
    return {
      ...item,
      marker: {
        ...marker,
        latitude: marker.latitude + Math.sin(angle) * radius,
        longitude: marker.longitude + Math.cos(angle) * radius,
      },
    };
  });
}

function ProviderPreviewCard({ marker, onClose, onOpenProvider }) {
  if (!marker) return null;

  const iconType = resolveProviderMapIconType(marker.provider, marker);
  const serviceCount = getMarkerServiceCount(marker);
  const distanceText = Number.isFinite(marker.distanceKm) ? `${marker.distanceKm.toFixed(1)} km away` : "";

  return (
    <aside className="queless-provider-preview queless-provider-preview--open" aria-label="Selected provider preview">
      <span className="queless-provider-preview__handle" aria-hidden="true" />
      <button type="button" className="queless-provider-preview__close" onClick={onClose} aria-label="Close provider preview">
        <FiX />
      </button>
      <div className="queless-provider-preview__body">
        <div className="queless-provider-preview__media">
          <img
            src={marker.provider?.image || fallbackStandIcon}
            alt=""
            onError={(event) => {
              event.currentTarget.src = fallbackStandIcon;
            }}
          />
          <span dangerouslySetInnerHTML={{ __html: renderServicePopupIconHtml(iconType) }} />
        </div>
        <div className="queless-provider-preview__content">
          <strong className="queless-provider-preview__title">{marker.provider?.business_name || "Queless provider"}</strong>
          <span className="queless-provider-preview__category">{marker.category || marker.title || "Local services"}</span>
          <div className="queless-provider-preview__meta">
            <small><FiStar /> {marker.rating}</small>
            <small><FiMapPin /> {marker.provider?.location || "Nearby"}</small>
            {distanceText ? <small>{distanceText}</small> : null}
          </div>
          <span className="queless-provider-preview__services">
            {serviceCount === 1 ? "1 service available" : `${serviceCount} services available`}
          </span>
        </div>
        <button type="button" className="queless-provider-preview__button" onClick={() => onOpenProvider?.(marker.provider)}>
          View
        </button>
      </div>
    </aside>
  );
}

function ClusteredProviderMarkers({ markers, selectedMarkerId, userLocation, locationLabel, onSelectMarker }) {
  const map = useMap();
  const [mapState, setMapState] = useState(() => ({
    zoom: map.getZoom(),
    boundsKey: "",
  }));

  useMapEvents({
    zoomend() {
      setMapState({ zoom: map.getZoom(), boundsKey: map.getBounds().toBBoxString() });
    },
    moveend() {
      setMapState({ zoom: map.getZoom(), boundsKey: map.getBounds().toBBoxString() });
    },
  });

  useEffect(() => {
    setMapState({ zoom: map.getZoom(), boundsKey: map.getBounds().toBBoxString() });
  }, [map, markers.length]);

  const markerItems = useMemo(
    () => spreadCloseMarkers(clusterMapMarkers(markers, map, mapState.zoom), mapState.zoom),
    [map, mapState.boundsKey, mapState.zoom, markers]
  );

  const zoomToCluster = (cluster) => {
    const bounds = L.latLngBounds(cluster.markers.map((marker) => [marker.latitude, marker.longitude]));
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const samePoint =
      Math.abs(northEast.lat - southWest.lat) < 0.00001 &&
      Math.abs(northEast.lng - southWest.lng) < 0.00001;

    if (samePoint) {
      map.flyTo([cluster.latitude, cluster.longitude], Math.max(map.getZoom() + 2, 15), { animate: true, duration: 0.45 });
    } else if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.35), { maxZoom: 15, animate: true });
    }
  };

  return (
    <>
      {userLocation?.latitude && userLocation?.longitude ? (
        <Marker position={[Number(userLocation.latitude), Number(userLocation.longitude)]} icon={userPin}>
          <Popup>
            <strong>Your location</strong>
            <br />
            <span>{locationLabel}</span>
          </Popup>
        </Marker>
      ) : null}
      {markerItems.map((item) => {
        if (item.type === "cluster") {
          return (
            <Marker
              key={item.id}
              position={[item.latitude, item.longitude]}
              icon={getClusterPinIcon(item.count)}
              eventHandlers={{ click: () => zoomToCluster(item) }}
            />
          );
        }

        const marker = item.marker;
        const iconType = resolveProviderMapIconType(marker.provider, marker);
        return (
          <Marker
            key={marker.id}
            position={[marker.latitude, marker.longitude]}
            icon={getServicePinIcon(iconType, selectedMarkerId === marker.id)}
            eventHandlers={{
              click: () => {
                onSelectMarker?.(marker);
                map.panTo([marker.latitude, marker.longitude], { animate: true, duration: 0.35 });
                window.setTimeout(() => {
                  map.panBy([0, 110], { animate: true, duration: 0.25 });
                }, 120);
              },
            }}
          />
        );
      })}
    </>
  );
}

export default function MarketplaceMapOverlay({
  show,
  theme = "light",
  category,
  providers,
  userLocation,
  locationLabel = "Near you",
  locationMessage = "",
  locationLoading = false,
  onClose,
  onOpenMenu,
  onUseCurrentLocation,
  onManualLocation,
  onRefreshProviders,
  onOpenProvider,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [refreshingNearby, setRefreshingNearby] = useState(false);
  const autoLocationRequestedRef = useRef(false);

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

  useEffect(() => {
    if (!selectedMarker) return;
    if (!filteredMarkers.some((marker) => marker.id === selectedMarker.id)) {
      setSelectedMarker(null);
    }
  }, [filteredMarkers, selectedMarker]);

  useEffect(() => {
    if (!show || userLocation?.latitude || autoLocationRequestedRef.current) return;
    autoLocationRequestedRef.current = true;
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state === "granted") {
          onUseCurrentLocation?.();
        }
      })
      .catch(() => {});
  }, [onUseCurrentLocation, show, userLocation]);

  const searchCenter = resolveSearchCenter(searchQuery || locationLabel);
  const center = userLocation?.latitude && userLocation?.longitude
    ? [Number(userLocation.latitude), Number(userLocation.longitude)]
    : searchCenter
    ? searchCenter
    : filteredMarkers[0]
    ? [filteredMarkers[0].latitude, filteredMarkers[0].longitude]
    : GAYAZA_CENTER;
  const mapZoom = userLocation?.latitude && userLocation?.longitude
    ? 14
    : searchCenter
    ? 13
    : filteredMarkers[0]
    ? 14
    : 13;
  const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  if (!show) return null;

  const submitSearch = (event) => {
    event.preventDefault();
    setNearbyOnly(false);
    setSelectedMarker(null);
    const value = searchQuery.trim();
    if (value) {
      onManualLocation?.(value);
    }
  };

  const showNearby = async () => {
    setSelectedMarker(null);
    setNearbyOnly(true);
    setRefreshingNearby(true);
    try {
      if (!userLocation?.latitude || !userLocation?.longitude) {
        await onUseCurrentLocation?.();
      }
      await onRefreshProviders?.();
    } finally {
      setRefreshingNearby(false);
    }
  };

  const isBusy = locationLoading || refreshingNearby;

  return (
    <div className={selectedMarker ? "queless-map-overlay queless-map-overlay--preview-open" : "queless-map-overlay"}>
      <div className="queless-map-appbar">
        <button type="button" onClick={onClose} aria-label="Back">
          <FiArrowLeft />
        </button>
        <img src={quelessLogo} alt="Queless" />
        <button type="button" onClick={onOpenMenu} aria-label="Open menu">
          <FiMenu />
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

      <div className={isBusy ? "queless-map-stage is-loading" : "queless-map-stage"}>
        <MapContainer center={center} zoom={mapZoom} className="queless-map-canvas" scrollWheelZoom>
          <MapRecenter center={center} zoom={mapZoom} />
          <TileLayer key={theme} attribution={tileAttribution} url={tileUrl} />
          <ClusteredProviderMarkers
            markers={filteredMarkers}
            selectedMarkerId={selectedMarker?.id || ""}
            userLocation={userLocation}
            locationLabel={locationLabel}
            onSelectMarker={setSelectedMarker}
          />
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

        {isBusy ? (
          <div className="queless-map-loading-card" role="status">
            <span />
            <strong>Finding nearby providers</strong>
          </div>
        ) : null}

        {!filteredMarkers.length && !isBusy ? (
          <div className="queless-map-empty-card">
            <span>
              <FiSearch />
            </span>
            <div>
              <strong>No providers here yet</strong>
              <p>Try searching a nearby town, landmark, or service category.</p>
            </div>
          </div>
        ) : null}

        <ProviderPreviewCard
          marker={selectedMarker}
          onClose={() => setSelectedMarker(null)}
          onOpenProvider={onOpenProvider}
        />
      </div>

      <div className="queless-map-footer">
        <button type="button" className="queless-map-close" onClick={onClose}>
          Back to results
        </button>
        {locationMessage ? (
          <div className="queless-map-message">
            {locationMessage}
            <span> You can still search by area or service above.</span>
          </div>
        ) : null}
        {!selectedMarker ? (
          <button type="button" className="queless-map-nearby-cta" onClick={showNearby} disabled={isBusy}>
            <FiNavigation />
            <span>{isBusy ? "Finding providers..." : "Show providers near me"}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
