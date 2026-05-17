import { FiBell, FiMenu, FiMoon, FiSun } from "react-icons/fi";
import logo from "../../assets/logo.png";

export default function AppHeader({ theme, setTheme, unreadCount, onOpenProfile, onOpenNotifications }) {
  return (
    <div className="header-v4">
      <div className="header-left-v4">
        <img src={logo} alt="logo" className="only-logo-v4" />
      </div>
      <div className="header-actions-v4">
        <button
          className="header-icon-btn"
          type="button"
          onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? <FiSun /> : <FiMoon />}
        </button>
        <button className="header-icon-btn" type="button" onClick={onOpenNotifications}>
          <FiBell />
          {unreadCount > 0 && (
            <span key={unreadCount} className="mini-badge-v4">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button className="header-icon-btn" type="button" onClick={onOpenProfile}>
          <FiMenu />
        </button>
      </div>
    </div>
  );
}
