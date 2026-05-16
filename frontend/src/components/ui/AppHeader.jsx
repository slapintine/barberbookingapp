import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FiBell, FiChevronDown, FiMapPin, FiMoon, FiNavigation, FiSearch, FiSun, FiX } from "react-icons/fi";
import logo from "../../assets/queless-logo-icon.png";

export default function AppHeader({
  theme = "light",
  setTheme,
  unreadCount,
  locationLabel = "Near you",
  locationMessage = "",
  locationLoading = false,
  profileImage = "",
  profileInitials = "U",
  onUseCurrentLocation,
  onManualLocation,
  onClearLocation,
  onOpenMenu,
  onOpenProfile,
  onOpenNotifications,
}) {
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [manualLocation, setManualLocation] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const locationRef = useRef(null);
  const nextTheme = theme === "light" ? "dark" : "light";

  const closeLocationMenu = () => {
    setShowLocationMenu(false);
  };

  const saveManualLocation = () => {
    const value = manualLocation.trim();
    if (!value) return;
    onManualLocation?.(value);
    setManualLocation("");
    closeLocationMenu();
  };

  useEffect(() => {
    setImageFailed(false);
  }, [profileImage]);

  useEffect(() => {
    if (!showLocationMenu) return undefined;

    const handleClickOutside = (event) => {
      if (locationRef.current && !locationRef.current.contains(event.target)) {
        closeLocationMenu();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeLocationMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showLocationMenu]);

  return (
    <div className="header-v4 queless-app-header">
      <div className="queless-brand-lockup" aria-label="Queless">
        <img src={logo} alt="Queless" />
      </div>

      <div className="queless-location-wrap" ref={locationRef}>
        <button
          type="button"
          className="queless-location-select"
          aria-expanded={showLocationMenu}
          aria-label="Open location options"
          onClick={() => setShowLocationMenu((value) => !value)}
        >
          <FiMapPin />
          <span>{locationLoading ? "Detecting location..." : locationLabel}</span>
          <FiChevronDown />
        </button>

        {showLocationMenu ? (
          <div className="queless-location-menu">
            <button
              type="button"
              className="location-close-button"
              aria-label="Close location menu"
              onClick={closeLocationMenu}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                onUseCurrentLocation?.();
              }}
              disabled={locationLoading}
            >
              <FiNavigation /> {locationLoading ? "Detecting location..." : locationMessage ? "Retry current location" : "Current Location"}
            </button>
            <div className="queless-location-manual">
              <FiSearch />
              <input
                value={manualLocation}
                onChange={(event) => setManualLocation(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveManualLocation();
                }}
                placeholder="Enter location manually"
              />
              <button type="button" onClick={saveManualLocation}>
                Save
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearLocation?.();
                closeLocationMenu();
              }}
            >
              <FiX /> Clear location
            </button>
            {locationMessage ? <p>{locationMessage}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="header-actions-v4 queless-header-actions">
        <button
          className="queless-theme-icon-btn"
          type="button"
          aria-label={`Switch to ${nextTheme} mode`}
          title={`Switch to ${nextTheme} mode`}
          onClick={() => setTheme?.(nextTheme)}
        >
          <FiSun aria-hidden="true" />
          <FiMoon aria-hidden="true" />
        </button>
        <button className="header-icon-btn queless-bell-btn" type="button" aria-label="Open notifications" onClick={onOpenNotifications}>
          <FiBell />
          {unreadCount > 0 && (
            <span key={unreadCount} className="mini-badge-v4">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button className="queless-avatar-btn" type="button" aria-label="Open account menu" onClick={onOpenMenu || onOpenProfile}>
          {profileImage && !imageFailed ? (
            <img
              src={profileImage}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
                setImageFailed(true);
              }}
            />
          ) : (
            <span>{profileInitials}</span>
          )}
        </button>
      </div>
    </div>
  );
}
