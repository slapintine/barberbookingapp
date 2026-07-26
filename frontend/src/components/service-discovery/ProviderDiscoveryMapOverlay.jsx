import MobileMapView from "./MobileMapView.jsx";

export default function ProviderDiscoveryMapOverlay({ show, ...props }) {
  if (!show) return null;
  return <MobileMapView {...props} />;
}
