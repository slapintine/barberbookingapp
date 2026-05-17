import { FiBriefcase, FiCalendar, FiCreditCard, FiHome, FiLogOut, FiSettings, FiStar, FiUser, FiX } from "react-icons/fi";

export default function AccountMenu({
  show,
  isBarber,
  accountName,
  accountType,
  onNavigate,
  onClose,
  onLogout,
}) {
  if (!show) return null;

  const items = [
    { id: "home", label: "Home", helper: "Find barbers and shops", icon: <FiHome /> },
    { id: "bookings", label: "Bookings", helper: "Appointments and payment status", icon: <FiCalendar /> },
    { id: "profile", label: "Profile and wallet", helper: "Wallet, profile, saved barbers", icon: <FiCreditCard /> },
    ...(isBarber
      ? [
          { id: "dashboard", label: "Barber dashboard", helper: "Schedule and booking control", icon: <FiBriefcase /> },
          { id: "reports", label: "Reviews and reports", helper: "Ratings and customer feedback", icon: <FiStar /> },
        ]
      : []),
    { id: "settings", label: "Settings", helper: "Username, password, security", icon: <FiSettings /> },
  ];

  return (
    <>
      <div className="account-menu-backdrop-v6" onClick={onClose} />
      <div className="account-menu-v6">
        <div className="account-menu-head-v6">
          <div className="account-menu-avatar-v6"><FiUser /></div>
          <div>
          <strong>{accountName || "Lineup account"}</strong>
            <span>{accountType === "barber" ? "Barber account" : "Customer account"}</span>
          </div>
          <button type="button" className="account-menu-close-v6" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="account-menu-list-v6">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className="account-menu-item-v6"
              onClick={() => {
                onNavigate(item.id);
                onClose();
              }}
            >
              <span className="account-menu-icon-v6">{item.icon}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.helper}</small>
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="account-menu-logout-v6" onClick={onLogout}>
          <FiLogOut /> Log out
        </button>
      </div>
    </>
  );
}
