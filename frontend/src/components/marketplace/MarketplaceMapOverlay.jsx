import MobileMapView from "./MobileMapView.jsx";

export default function MarketplaceMapOverlay({ show, ...props }) {
  if (!show) return null;
  return <MobileMapView {...props} />;
}
