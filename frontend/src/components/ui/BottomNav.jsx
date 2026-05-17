import { FiBriefcase, FiCalendar, FiHome, FiStar, FiUser } from "react-icons/fi";

export default function BottomNav({ activeTab, setActiveTab, isBarber, isOverlayOpen }) {
  return (
    <div className={isOverlayOpen ? "bottom-nav-v4 hidden" : "bottom-nav-v4"}>
      <button className={activeTab === "home" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("home")}>
        <FiHome />
        <span>Home</span>
      </button>
      <button className={activeTab === "bookings" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("bookings")}>
        <FiCalendar />
        <span>Bookings</span>
      </button>
      {isBarber && (
        <button className={activeTab === "dashboard" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("dashboard")}>
          <FiBriefcase />
          <span>Dashboard</span>
        </button>
      )}
      {isBarber && (
        <button className={activeTab === "reports" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("reports")}>
          <FiStar />
          <span>Reports</span>
        </button>
      )}
      <button className={activeTab === "profile" ? "nav-v4 active" : "nav-v4"} onClick={() => setActiveTab("profile")}>
        <FiUser />
        <span>Profile</span>
      </button>
    </div>
  );
}
