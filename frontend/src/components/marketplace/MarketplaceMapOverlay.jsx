import { useEffect, useState } from "react";
import MapDashboard from "./MapDashboard.jsx";
import MobileMapView from "./MobileMapView.jsx";

function useIsDesktopMap(minWidth = 1024) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${minWidth}px)`).matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = (event) => setIsDesktop(event.matches);
    query.addEventListener("change", onChange);
    setIsDesktop(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, [minWidth]);
  return isDesktop;
}

/**
 * Entry point for the map experience. Picks the layout by viewport:
 *   - desktop (>=1024px): dashboard layout (MapDashboard)
 *   - mobile/tablet: the purple/cream mobile "View Map" screen (MobileMapView)
 * All real data + handlers come from App.jsx and are forwarded to both.
 */
export default function MarketplaceMapOverlay({ show, ...props }) {
  const isDesktop = useIsDesktopMap();
  if (!show) return null;
  return isDesktop ? <MapDashboard {...props} /> : <MobileMapView {...props} />;
}
