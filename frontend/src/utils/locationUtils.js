function compactAddressParts(parts) {
  return [...new Set(parts.flatMap((part) => {
    const value = String(part || "").trim();
    return value ? [value] : [];
  }))];
}

export async function reverseGeocodeCoordinates({ latitude, longitude }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return "";

  const data = await response.json();
  const address = data?.address || {};
  const localName =
    address.neighbourhood ||
    address.suburb ||
    address.village ||
    address.town ||
    address.city ||
    address.municipality ||
    address.county;
  const widerName = address.county || address.state_district || address.state || address.region;
  const parts = compactAddressParts([localName, widerName]);

  if (parts.length) return parts.slice(0, 2).join(", ");
  return String(data?.display_name || "").split(",").slice(0, 2).flatMap((part) => {
    const value = part.trim();
    return value ? [value] : [];
  }).join(", ");
}

export function getGeolocationErrorMessage(error) {
  if (error?.code === 1) return "Location permission was denied. Please type your location manually.";
  if (error?.code === 2 || error?.code === 3) return "Location unavailable. Please type your location manually.";
  return "Location unavailable. Please type your location manually.";
}
