import { FiBriefcase, FiCalendar, FiCreditCard, FiHome, FiLogOut, FiSettings, FiShield, FiStar, FiUser, FiX } from "react-icons/fi";

export default function AccountMenu({
  show,
  isBarber,
  isAdmin,
  accountName,
  accountType,
  onNavigate,
  onClose,
  onLogout,
}) {
  if (!show) return null;

  const items = [
    { id: "home", label: "Home", helper: "Find services and trusted providers", icon: <FiHome /> },
    { id: "bookings", label: "My Bookings", helper: "Bookings, quotes, and payment status", icon: <FiCalendar /> },
    {
      id: "profile",
      label: isBarber ? "Profile and wallet" : "Profile and payments",
      helper: isBarber ? "Wallet, profile, saved businesses" : "Payment methods, profile, saved businesses",
      icon: <FiCreditCard />,
    },
    ...(isBarber
      ? [
          { id: "dashboard", label: "Provider Dashboard", helper: "Services, bookings, quotes, and profile", icon: <FiBriefcase /> },
          { id: "reports", label: "Reviews and analytics", helper: "Ratings, performance, and customer feedback", icon: <FiStar /> },
        ]
      : []),
    ...(isAdmin
      ? [
          { id: "admin", label: "Admin Control Center", helper: "Manage businesses, plans, bookings, and platform health", icon: <FiShield /> },
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
          <strong>{accountName || "Queless account"}</strong>
            <span>{accountType === "admin" ? "Admin account" : accountType === "business" || accountType === "provider" || accountType === "barber" ? "Provider account" : "Customer account"}</span>
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
