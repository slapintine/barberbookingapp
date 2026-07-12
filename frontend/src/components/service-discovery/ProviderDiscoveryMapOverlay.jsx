import { lazy, Suspense, useEffect, useState } from "react";

const MapDashboard = lazy(() => import("./MapDashboard.jsx"));
const MobileMapView = lazy(() => import("./MobileMapView.jsx"));

const DESKTOP_MAP_QUERY = "(min-width: 900px)";

function useDesktopMapLayout() {
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(DESKTOP_MAP_QUERY).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MAP_QUERY);
    const syncLayout = (event) => setIsDesktop(event.matches);
    media.addEventListener?.("change", syncLayout);
    return () => media.removeEventListener?.("change", syncLayout);
  }, []);

  return isDesktop;
}

export default function ProviderDiscoveryMapOverlay({ show, ...props }) {
  const isDesktop = useDesktopMapLayout();
  if (!show) return null;
  return (
    <Suspense
      fallback={(
        <div className="queless-map-loading" data-theme={props.theme || "light"} role="status">
          <span aria-hidden="true" />
          <strong>Opening the Queless map…</strong>
          <small>Preparing nearby providers</small>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
      )}
    >
      {isDesktop ? <MapDashboard {...props} /> : <MobileMapView {...props} />}
    </Suspense>
  );
}
