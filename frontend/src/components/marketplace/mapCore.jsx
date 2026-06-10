// Shared Leaflet map primitives used by both the mobile map overlay
// (MarketplaceMapOverlay) and the desktop dashboard (MapDashboard).
// Markers, clustering, distance + search helpers, and the user pin all live
// here so the two layouts stay visually and behaviourally consistent.
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { resolveProviderMapIconType } from "../../utils/mapIconCategories.js";
import {
  categoryMatches,
  getProviderTier,
  getServiceCategory,
  isOwnProvider,
  isProviderOpenNow,
  isProviderVerified,
  isPublicMarketplaceProvider,
} from "../../utils/marketplaceServices.js";
import { renderServiceClusterHtml, renderServiceMarkerHtml } from "./ServiceMapMarker.jsx";

export const KAMPALA_CENTER = [0.3476, 32.5825];
export const GAYAZA_CENTER = [0.4516, 32.6089];

const servicePinCache = new Map();
const clusterPinCache = new Map();

function statusCacheKey(status = {}) {
  return `${status.tier || "FREE"}:${status.verified ? "v" : ""}:${status.closed ? "c" : ""}:${status.own ? "o" : ""}`;
}

export function getServicePinIcon(iconType, selected = false, status = {}) {
  const key = `${iconType || "default"}:${selected ? "selected" : "default"}:${statusCacheKey(status)}`;
  if (!servicePinCache.has(key)) {
    servicePinCache.set(
      key,
      new L.DivIcon({
        className: "queless-map-pin-wrap",
        html: renderServiceMarkerHtml(iconType || "default", selected, status),
        iconSize: selected ? [48, 60] : [44, 56],
        iconAnchor: selected ? [24, 57] : [22, 53],
      })
    );
  }
  return servicePinCache.get(key);
}

export function getClusterPinIcon(count) {
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

export const userPin = new L.DivIcon({
  className: "queless-user-pin-wrap",
  html: `<div class="queless-user-pin" aria-hidden="true"><span></span></div>`,
  iconSize: [58, 58],
  iconAnchor: [29, 29],
});

export function MapRecenter({ center, zoom }) {
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

export function isProviderVisibleOnMap(provider = {}) {
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

export function getMarkers(providers = [], category = "") {
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
          list.findIndex(
            (item) =>
              String(item?.id || item?.service_name || item?.name || serviceIndex) ===
              String(service?.id || service?.service_name || service?.name || serviceIndex)
          ) === serviceIndex
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
      rating:
        Number(provider?.rating || provider?.avg_rating || 0)
          ? Number(provider.rating || provider.avg_rating).toFixed(1)
          : "New",
      latitude: Number(provider.latitude),
      longitude: Number(provider.longitude),
    };
  });
}

export function getMarkerServiceCount(marker = {}) {
  if (Array.isArray(marker.listings) && marker.listings.length > 1) return marker.listings.length;
  if (Array.isArray(marker.provider?.services) && marker.provider.services.length) return marker.provider.services.length;
  return 1;
}

export function getProviderSearchText(provider = {}, marker = {}) {
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

export function getDistanceKm(from, to) {
  if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude) return Number.POSITIVE_INFINITY;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveSearchCenter(query) {
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
      clusters.set(key, { type: "cluster", id: `cluster-${key}`, markers: [marker], point });
      return;
    }
    existing.markers.push(marker);
    existing.point = existing.point.add(point);
  });

  return [...clusters.values()].map((cluster) => {
    if (cluster.markers.length === 1) return { type: "marker", marker: cluster.markers[0] };
    const point = cluster.point.divideBy(cluster.markers.length);
    const latLng = map.unproject(point, zoom);
    return { ...cluster, latitude: latLng.lat, longitude: latLng.lng, count: cluster.markers.length };
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

/** Tier / verified / open / ownership flags used to style a provider marker. */
export function getMarkerStatus(provider = {}, currentUser = null) {
  return {
    tier: getProviderTier(provider),
    verified: isProviderVerified(provider),
    closed: !isProviderOpenNow(provider),
    own: isOwnProvider(provider, currentUser),
  };
}

export function ClusteredProviderMarkers({
  markers,
  selectedMarkerId,
  userLocation,
  locationLabel,
  currentUser = null,
  onSelectMarker,
}) {
  const map = useMap();
  const [mapState, setMapState] = useState(() => ({ zoom: map.getZoom(), boundsKey: "" }));

  useMapEvents({
    zoomend() {
      setMapState({ zoom: map.getZoom(), boundsKey: map.getBounds().toBBoxString() });
    },
    moveend() {
      setMapState({ zoom: map.getZoom(), boundsKey: map.getBounds().toBBoxString() });
    },
  });

  const markerItems = useMemo(
    () => spreadCloseMarkers(clusterMapMarkers(markers, map, mapState.zoom), mapState.zoom),
    [map, mapState.boundsKey, mapState.zoom, markers]
  );

  const zoomToCluster = (cluster) => {
    const bounds = L.latLngBounds(cluster.markers.map((marker) => [marker.latitude, marker.longitude]));
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const samePoint =
      Math.abs(northEast.lat - southWest.lat) < 0.00001 && Math.abs(northEast.lng - southWest.lng) < 0.00001;

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
        const status = getMarkerStatus(marker.provider, currentUser);
        return (
          <Marker
            key={marker.id}
            position={[marker.latitude, marker.longitude]}
            icon={getServicePinIcon(iconType, selectedMarkerId === marker.id, status)}
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
