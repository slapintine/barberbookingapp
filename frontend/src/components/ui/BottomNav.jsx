import { FiBarChart2, FiCalendar, FiGrid, FiHome, FiMessageCircle, FiUser } from "react-icons/fi";

const CUSTOMER_ROLES = new Set(["customer", "user", "client"]);
const PROVIDER_ROLES = new Set(["barber", "provider", "business", "salon", "spa"]);
const ADMIN_ROLES = new Set(["admin", "superadmin", "super_admin", "super-admin"]);

function getRoleValue(user) {
  const u = user || {};
  return String(u.role || u.accountType || u.account_type || u.userType || u.user_type || "")
    .trim()
    .toLowerCase();
}

function resolveNavMode({ currentUser, isBarber, isAdmin }) {
  const role = getRoleValue(currentUser);
  if (isAdmin || ADMIN_ROLES.has(role)) return "admin";
  if (isBarber || PROVIDER_ROLES.has(role)) return "provider";
  if (CUSTOMER_ROLES.has(role)) return "customer";
  return "customer";
}

export default function BottomNav({ activeTab, setActiveTab, isOverlayOpen, unreadMessages = 0, isBarber = false, isAdmin = false, currentUser = null }) {
  const isCategoriesActive = activeTab === "categories" || activeTab === "categoryServices";
  const messageBadge = Number(unreadMessages || 0);
  const navMode = resolveNavMode({ currentUser, isBarber, isAdmin });
  const isProviderStyle = navMode === "provider" || navMode === "admin";
  const dashboardTab = navMode === "admin" ? "admin" : "dashboard";
  const reportsTab = navMode === "admin" ? "adminReports" : "reports";
  const isDashboardActive = navMode === "admin" ? activeTab === "admin" : activeTab === "dashboard";
  const isReportsActive = navMode === "admin" ? activeTab === "adminReports" : activeTab === "reports";

  return (
    <div className={isOverlayOpen ? "bottom-nav-v4 queless-bottom-nav hidden" : "bottom-nav-v4 queless-bottom-nav"}>
      <button type="button" className={activeTab === "home" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("home")}>
        <FiHome />
        <span>Home</span>
      </button>
      {!isProviderStyle ? (
        <button type="button" className={isCategoriesActive ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("categories")}>
          <FiGrid />
          <span>Categories</span>
        </button>
      ) : null}
      <button type="button" className={activeTab === "bookings" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("bookings")}>
        <FiCalendar />
        <span>Bookings</span>
      </button>
      {isProviderStyle ? (
        <>
          <button type="button" className={isDashboardActive ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab(dashboardTab)}>
            <FiGrid />
            <span>Dashboard</span>
          </button>
          <button type="button" className={isReportsActive ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab(reportsTab)}>
            <FiBarChart2 />
            <span>Reports</span>
          </button>
        </>
      ) : (
        <button type="button" className={activeTab === "inbox" ? "nav-v4 queless-inbox-nav active" : "nav-v4 queless-inbox-nav"} onClick={() => setActiveTab("inbox")}>
          <FiMessageCircle />
          <span>Inbox</span>
          {messageBadge > 0 ? <i>{messageBadge > 9 ? "9+" : messageBadge}</i> : null}
        </button>
      )}
      <button type="button" className={activeTab === "profile" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("profile")}>
        <FiUser />
        <span>Profile</span>
      </button>
    </div>
  );
}
