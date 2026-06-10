import { FiBookOpen, FiBriefcase, FiCalendar, FiCreditCard, FiFileText, FiHome, FiLifeBuoy, FiLogOut, FiSettings, FiShield, FiStar, FiX, FiZap } from "react-icons/fi";
import UserAvatar from "./UserAvatar.jsx";

export default function AccountMenu({
  show,
  isBarber,
  isAdmin,
  accountName,
  accountType,
  accountPhoto = "",
  accountUsername = "",
  accountEmail = "",
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
          { id: "aiCoach", label: "Provider Coach", helper: "Guided business recommendations", icon: <FiZap /> },
          { id: "reports", label: "Reviews and analytics", helper: "Ratings, performance, and customer feedback", icon: <FiStar /> },
        ]
      : []),
    ...(isAdmin
      ? [
          { id: "admin", label: "Admin Control Center", helper: "Manage businesses, plans, bookings, and platform health", icon: <FiShield /> },
        ]
      : []),
    { id: "help", label: "Help Center", helper: "FAQs, booking help, and support channels", icon: <FiBookOpen /> },
    { id: "support", label: "Contact Support", helper: "Report a problem, provider, or customer", icon: <FiLifeBuoy /> },
    { id: "policies", label: "Rules and Policies", helper: "Terms, privacy, refunds, provider rules", icon: <FiFileText /> },
    { id: "settings", label: "Settings", helper: "Username, password, security", icon: <FiSettings /> },
  ];

  return (
    <>
      <button type="button" className="account-menu-backdrop-v6" onClick={onClose} aria-label="Close account menu" />
      <div className="account-menu-v6">
        <div className="account-menu-head-v6">
          <div className="account-menu-avatar-v6">
            <UserAvatar
              profilePhoto={accountPhoto}
              fullName={accountName}
              username={accountUsername}
              email={accountEmail}
              size={42}
            />
          </div>
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

        <button type="button" className="account-menu-logout-v6" onClick={() => onLogout?.()}>
          <FiLogOut /> Log out
        </button>
      </div>
    </>
  );
}
