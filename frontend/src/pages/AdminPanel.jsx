import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiBarChart2,
  FiBriefcase,
  FiCheckCircle,
  FiEye,
  FiFilter,
  FiLock,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { getAdminOverview, updateAdminBusiness } from "../api/adminApi.js";

const PLAN_FILTERS = ["All", "Trial", "PRO", "PREMIUM", "PLATINUM", "Expired", "Unpaid"];
const PREVIEW_PLANS = ["PRO", "PREMIUM", "PLATINUM"];
const ADMIN_ROLES = new Set(["admin", "superadmin", "super_admin", "super-admin"]);

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString("en-UG")}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function planBadgeClass(plan) {
  return `admin-status-badge-v13 ${String(plan || "").toLowerCase()}`;
}

export default function AdminPanel({ currentUser, initialSection = "dashboard", onBackToApp, onGoDashboard }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [previewPlan, setPreviewPlan] = useState("PREMIUM");
  const reportsRef = useRef(null);

  const isAdmin = ADMIN_ROLES.has(
    String(currentUser?.role || currentUser?.accountType || currentUser?.account_type || currentUser?.userType || currentUser?.user_type || "")
      .trim()
      .toLowerCase()
  );

  const loadAdminData = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const result = await getAdminOverview();
      setData(result);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [isAdmin]);

  useEffect(() => {
    if (initialSection !== "reports") return;
    window.requestAnimationFrame(() => {
      reportsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [initialSection, loading]);

  const businesses = data?.businesses || [];
  const bookings = data?.bookings || [];
  const services = data?.services || [];
  const overview = data?.overview || {};

  const filteredBusinesses = useMemo(() => {
    const term = query.trim().toLowerCase();
    return businesses.filter((business) => {
      const matchesTerm =
        !term ||
        [business.business_name, business.business_type, business.owner_name, business.owner_username, business.phone, business.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const plan = String(business.current_plan || "").toUpperCase();
      const matchesPlan =
        planFilter === "All" ||
        (planFilter === "Trial" && plan === "TRIAL") ||
        (planFilter === "Expired" && business.trial_status === "expired") ||
        (planFilter === "Unpaid" && plan === "UNPAID") ||
        plan === planFilter;
      return matchesTerm && matchesPlan;
    });
  }, [businesses, planFilter, query]);

  const bookingGroups = useMemo(() => {
    const pending = bookings.filter((booking) => ["pending", "payment_pending", "confirmed"].includes(booking.status));
    const completed = bookings.filter((booking) => booking.status === "completed");
    const cancelled = bookings.filter((booking) => ["cancelled", "rejected"].includes(booking.status));
    const disputed = bookings.filter((booking) => ["disputed", "problem"].includes(booking.status));
    return { pending, completed, cancelled, disputed };
  }, [bookings]);

  const handleBusinessAction = async (business, payload) => {
    try {
      setMessage("Updating business...");
      await updateAdminBusiness(business.id, payload);
      await loadAdminData();
      setMessage(`${business.business_name} updated.`);
    } catch (error) {
      setMessage(error.message || "Could not update business.");
    }
  };

  if (!isAdmin) {
    return (
      <div className="content-v4 standard-page-v4 admin-page-v13">
        <div className="admin-route-nav-v13">
          <button type="button" onClick={onBackToApp}>
            <FiArrowLeft /> Back to app
          </button>
          <button type="button" onClick={onGoDashboard}>
            Go to dashboard
          </button>
        </div>
        <section className="simple-card-v4 admin-locked-v13">
          <FiLock />
          <h2>Admin access only</h2>
          <p>You do not have permission to access this area.</p>
        </section>
      </div>
    );
  }

  if (!loading && message && !data) {
    return (
      <div className="content-v4 standard-page-v4 admin-page-v13">
        <div className="admin-route-nav-v13">
          <button type="button" onClick={onBackToApp}>
            <FiArrowLeft /> Back to app
          </button>
          <button type="button" onClick={onGoDashboard}>
            Go to dashboard
          </button>
        </div>

        <section className="admin-hero-v13 simple-card-v4">
          <div>
            <span className="admin-kicker-v13"><FiShield /> Super Admin</span>
            <h1>Super Admin</h1>
            <p>Manage Queless settings and platform controls.</p>
          </div>
        </section>

        <section className="admin-section-v13 simple-card-v4 admin-safe-fallback-v13">
          <div className="panel-title-v4">Admin tools are being finalised</div>
          <div className="profile-sub-v4">The access route is working, but unstable data tools are hidden until the admin API responds cleanly.</div>
          <div className="admin-preview-grid-v13">
            <button type="button" onClick={onGoDashboard}>Go to dashboard</button>
            <button type="button" onClick={onBackToApp}>Back to app</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="content-v4 standard-page-v4 admin-page-v13">
      <div className="admin-route-nav-v13">
        <button type="button" onClick={onBackToApp}>
          <FiArrowLeft /> Back to app
        </button>
        <button type="button" onClick={onGoDashboard}>
          Go to dashboard
        </button>
      </div>

      <section className="admin-hero-v13 simple-card-v4">
        <div>
          <span className="admin-kicker-v13"><FiShield /> Admin Panel</span>
          <h1>Platform Control Center</h1>
          <p>Monitor businesses, plans, bookings, verification, and platform performance.</p>
        </div>
        <button type="button" className="mini-action-btn-v4" onClick={loadAdminData} disabled={loading}>
          <FiRefreshCw /> Refresh
        </button>
      </section>

      {message && <div className="auth-success">{message}</div>}

      <section className="admin-overview-grid-v13">
        {[
          ["Total users", overview.total_users, FiUsers],
          ["Businesses", overview.total_businesses, FiBriefcase],
          ["Active trials", overview.active_trials, FiTrendingUp],
          ["PRO", overview.pro_businesses, FiCheckCircle],
          ["PREMIUM", overview.premium_businesses, FiCheckCircle],
          ["PLATINUM", overview.platinum_businesses, FiCheckCircle],
          ["Expired trials", overview.expired_trials, FiAlertTriangle],
          ["Bookings", overview.total_bookings, FiBarChart2],
        ].map(([label, value, Icon]) => (
          <div className="admin-stat-v13 simple-card-v4" key={label}>
            <Icon />
            <strong>{loading ? "..." : value ?? 0}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="admin-section-v13 simple-card-v4">
        <div className="panel-head-v4">
          <div>
            <div className="panel-title-v4">Business Management</div>
            <div className="profile-sub-v4">Manage trials, plans, verification, and account status.</div>
          </div>
        </div>

        <div className="admin-toolbar-v13">
          <label>
            <FiSearch />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search businesses" />
          </label>
          <div className="admin-filter-row-v13">
            <FiFilter />
            {PLAN_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter}
                className={planFilter === filter ? "active" : ""}
                onClick={() => setPlanFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-business-list-v13">
          {filteredBusinesses.map((business) => (
            <article className="admin-business-card-v13" key={business.id}>
              <div className="admin-business-main-v13">
                <div>
                  <strong>{business.business_name}</strong>
                  <span>{business.business_type} - {business.owner_name}</span>
                  <small>{business.phone || "No phone"} - {business.email || "No email"}</small>
                </div>
                <span className={planBadgeClass(business.current_plan)}>{business.current_plan}</span>
              </div>

              <div className="admin-business-meta-v13">
                <span>Trial: {business.trial_status} ({business.trial_days_left}d)</span>
                <span>Verify: {business.verification_status}</span>
                <span>Status: {business.active_status}</span>
                <span>Services: {business.service_count}</span>
                <span>Bookings: {business.booking_count}</span>
                <span>Last active: {formatDate(business.last_active_at)}</span>
              </div>

              <div className="admin-actions-v13">
                <button type="button" onClick={() => handleBusinessAction(business, { action: "verify" })}>Verify</button>
                <button type="button" onClick={() => handleBusinessAction(business, { action: "suspend" })}>Suspend</button>
                <button type="button" onClick={() => handleBusinessAction(business, { action: "activate" })}>Activate</button>
                <button type="button" onClick={() => handleBusinessAction(business, { action: "extend_trial", days: 30 })}>Extend Trial</button>
                <button type="button" onClick={() => handleBusinessAction(business, { action: "reset_subscription" })}>Reset</button>
                {PREVIEW_PLANS.map((plan) => (
                  <button
                    type="button"
                    key={plan}
                    onClick={() => handleBusinessAction(business, { action: "change_plan", plan })}
                  >
                    Set {plan}
                  </button>
                ))}
              </div>
            </article>
          ))}

          {!loading && !filteredBusinesses.length && (
            <div className="empty-state-v4">
              <FiSearch />
              <strong>No businesses found</strong>
              <span>Try another search or filter.</span>
            </div>
          )}
        </div>
      </section>

      <section className="admin-section-v13 simple-card-v4">
        <div className="panel-head-v4">
          <div>
            <div className="panel-title-v4">Preview as Plan</div>
            <div className="profile-sub-v4">Check what businesses should see on each tier.</div>
          </div>
        </div>
        <div className="admin-preview-grid-v13">
          {PREVIEW_PLANS.map((plan) => (
            <button
              type="button"
              key={plan}
              className={previewPlan === plan ? "active" : ""}
              onClick={() => setPreviewPlan(plan)}
            >
              <FiEye /> Preview as {plan}
            </button>
          ))}
        </div>
        <div className="admin-preview-card-v13">
          <strong>{previewPlan} access</strong>
          <span>
            {previewPlan === "PRO"
              ? "Basic booking stats, basic earnings, limited service performance, and review list."
              : previewPlan === "PREMIUM"
              ? "Full analytics, booking trends, revenue insights, rating breakdown, filters, and growth tips."
              : "Everything in Premium plus advanced insights, alerts, customer behavior, and report exports."}
          </span>
        </div>
      </section>

      <section className="admin-section-v13 simple-card-v4">
        <div className="panel-title-v4">Booking Monitoring</div>
        <div className="admin-booking-grid-v13">
          <span>All bookings <strong>{bookings.length}</strong></span>
          <span>Pending <strong>{bookingGroups.pending.length}</strong></span>
          <span>Completed <strong>{bookingGroups.completed.length}</strong></span>
          <span>Cancelled <strong>{bookingGroups.cancelled.length}</strong></span>
          <span>Disputed <strong>{bookingGroups.disputed.length}</strong></span>
        </div>
      </section>

      <section className="admin-section-v13 simple-card-v4" ref={reportsRef}>
        <div className="panel-title-v4">Reports / Analytics</div>
        <div className="admin-analytics-grid-v13">
          <div>
            <strong>Total revenue estimate</strong>
            <span>{formatMoney(overview.total_revenue_estimate)}</span>
          </div>
          <div>
            <strong>Most popular services</strong>
            <span>{services.slice(0, 3).map((item) => item.service_name).filter(Boolean).join(", ") || "No service data yet"}</span>
          </div>
          <div>
            <strong>Businesses needing attention</strong>
            <span>{businesses.filter((item) => item.average_rating > 0 && item.average_rating < 3.5).length} low-rated businesses</span>
          </div>
        </div>
      </section>

      <section className="admin-section-v13 simple-card-v4">
        <div className="panel-title-v4">Verification Queue</div>
        <div className="admin-business-list-v13">
          {businesses
            .filter((business) => business.verification_status !== "Verified")
            .slice(0, 8)
            .map((business) => (
              <article className="admin-business-card-v13 compact" key={`verify-${business.id}`}>
                <div className="admin-business-main-v13">
                  <div>
                    <strong>{business.business_name}</strong>
                    <span>{business.location} - {business.service_count} services - {business.review_count} reviews</span>
                    <small>Payment methods: {business.accepts_wallet ? "Mobile money" : ""} {business.accepts_cash ? "Cash" : ""}</small>
                  </div>
                  <span className="admin-status-badge-v13 expired">{business.verification_status}</span>
                </div>
                <div className="admin-actions-v13">
                  <button type="button" onClick={() => handleBusinessAction(business, { action: "verify" })}>Approve</button>
                  <button type="button" onClick={() => handleBusinessAction(business, { action: "reject_verification" })}>Request Info</button>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
