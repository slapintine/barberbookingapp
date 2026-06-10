import { useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowDownLeft,
  FiArrowLeft,
  FiArrowUpRight,
  FiBarChart2,
  FiBookOpen,
  FiBriefcase,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDatabase,
  FiDollarSign,
  FiFilter,
  FiGrid,
  FiHome,
  FiLayers,
  FiLock,
  FiMapPin,
  FiMenu,
  FiMessageSquare,
  FiMoreVertical,
  FiBell,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShield,
  FiSmartphone,
  FiStar,
  FiTrendingUp,
  FiUser,
  FiUsers,
  FiX,
  FiZap,
} from "react-icons/fi";
import {
  cleanupAdminDemoBusinesses,
  getAdminAuditLog,
  getAdminBookings,
  getAdminBusinesses,
  getAdminCustomerSubscriptions,
  getAdminDeploymentReadiness,
  getAdminOverview,
  getAdminPayments,
  getAdminProviderSubscriptions,
  getAdminSmsMessages,
  getAdminReviews,
  getAdminSupportRequests,
  getAdminSubscriptions,
  getAdminSummary,
  getAdminSystemHealth,
  getAdminUsers,
  getAdminSubscriptionSummary,
  remediateAdminDeploymentReadiness,
  runAdminAccessTest,
  sendAdminAnnouncement,
  sendAdminSms,
  updateAdminBusiness,
  updateAdminCustomerSubscription,
  updateAdminProviderSubscription,
  updateAdminSupportRequest,
} from "../api/adminApi.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "super_admin", "super-admin"]);
const PROVIDER_PLANS = ["FREE", "PREMIUM", "PLATINUM"];
const PLAN_FILTERS = ["All", "Trial", "FREE", "PREMIUM", "PLATINUM", "Expired", "Unpaid"];
const VERIFICATION_TABS = ["Pending Review", "Verified", "Changes Requested", "Suspended", "Banned"];
const SUBSCRIPTION_TABS = ["Customers", "Providers", "Trials", "Expired", "Pending Payments", "Failed Payments", "Access Testing"];
const USER_ROLE_FILTERS = ["All", "customer", "provider", "admin"];
const SUBSCRIPTION_FILTERS = ["All", "FREE", "PREMIUM", "PLATINUM", "TRIAL", "EXPIRED"];
const PAYMENT_FILTERS = ["All", "Successful", "Pending", "Failed", "Cancelled", "Today", "This week", "This month"];
const BOOKING_FILTERS = ["All", "Pending", "Confirmed", "Completed", "Cancelled"];
const SUPPORT_REQUEST_STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];
const FEATURE_TEST_OPTIONS = [
  ["smart_match", "Smart Match"],
  ["browse_services", "Business search"],
  ["book_service", "Booking creation"],
  ["customer_wallet_topup", "Wallet top-up"],
  ["checkout_payment", "Checkout/payment"],
  ["booking_management", "Provider booking management"],
  ["ai_coach", "Provider Coach"],
  ["subscription_upgrade", "Subscription upgrade"],
  ["subscription_expiry_lock", "Subscription expiry lock"],
];

const DEFAULT_FEATURE_MATRIX = [
  { key: "browse_services", label: "Search/browse services", freeCustomer: true, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
  { key: "book_service", label: "Book service", freeCustomer: true, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
  { key: "smart_match", label: "Smart Match", freeCustomer: false, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
  { key: "customer_wallet_topup", label: "Customer wallet/top-up", freeCustomer: true, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
  { key: "provider_listing", label: "Provider listing", freeCustomer: false, premiumCustomer: false, proProvider: true, premiumProvider: true, platinumProvider: true },
  { key: "booking_management", label: "Booking management", freeCustomer: false, premiumCustomer: false, proProvider: true, premiumProvider: true, platinumProvider: true },
  { key: "business_wallet", label: "Business wallet/earnings", freeCustomer: false, premiumCustomer: false, proProvider: true, premiumProvider: true, platinumProvider: true },
  { key: "ai_coach", label: "Provider Coach", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
  { key: "analytics", label: "Analytics", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
  { key: "priority_placement", label: "Priority placement", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
  { key: "premium_visibility", label: "Premium visibility", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
  { key: "platinum_features", label: "Platinum features", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: false, platinumProvider: true },
];

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString("en-UG")}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function cleanStatus(value, fallback = "unknown") {
  return String(value || fallback).replaceAll("_", " ");
}

function badgeClass(value) {
  return `admin-status-badge-v13 ${String(value || "").toLowerCase().replaceAll("_", "-")}`;
}

function planLabel(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "FREE") return "Free";
  if (normalized === "PREMIUM") return "Premium";
  if (normalized === "PLATINUM") return "Platinum";
  if (normalized === "TRIAL") return "Trial";
  if (normalized === "EXPIRED") return "Expired";
  return cleanStatus(value);
}

function isMtnPayment(payment) {
  return String(payment.provider || payment.payment_method || "").toLowerCase().includes("mtn");
}

function isPending(value) {
  return ["pending", "processing", "initiated"].includes(String(value || "").toLowerCase());
}

function isFailed(value) {
  return ["failed", "cancelled", "expired", "error"].includes(String(value || "").toLowerCase());
}

function isSuccess(value) {
  return ["successful", "success", "completed", "paid"].includes(String(value || "").toLowerCase());
}

function adminStatusLabel(value) {
  const status = String(value || "").toLowerCase();
  if (["online", "operational", "ok", "connected", "configured", "active", "successful", "success"].some((term) => status.includes(term))) return "Online";
  if (["failed", "failure", "error", "down", "cancelled"].some((term) => status.includes(term))) return "Failed";
  if (["pending", "processing", "initiated"].some((term) => status.includes(term))) return "Pending";
  if (["warning", "review", "sandbox", "partial"].some((term) => status.includes(term))) return "Warning";
  return "Unknown";
}

function hasBlocker(row, blocker) {
  return (row.blockers || []).includes(blocker);
}

function isThisWeek(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  return Date.now() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function AdminStatCard({ label, value, icon: Icon, tone = "", onClick }) {
  const content = (
    <>
      <span className="admin-stat-icon-v17">{Icon ? <Icon /> : <FiActivity />}</span>
      <strong>{value ?? 0}</strong>
      <span>{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`admin-stat-v13 admin-stat-glow-v17 admin-stat-button-v20 ${tone}`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <article className={`admin-stat-v13 admin-stat-glow-v17 ${tone}`}>
      {content}
    </article>
  );
}

function AdminEmptyState({ icon: Icon = FiDatabase, title, text }) {
  return (
    <div className="admin-empty-v17">
      <Icon />
      <strong>{title}</strong>
      {text ? <span>{text}</span> : null}
    </div>
  );
}

function AdminTable({ columns, rows, getKey, emptyTitle, emptyText }) {
  if (!rows.length) return <AdminEmptyState title={emptyTitle} text={emptyText} />;
  return (
    <div className="admin-records-v17">
      <div className="admin-table-wrap-v17">
        <table className="admin-table-v17">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={getKey ? getKey(row, index) : index}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-mobile-card-list-v18">
        {rows.map((row, index) => {
          const key = getKey ? getKey(row, index) : index;
          const primary = columns[0];
          const actionColumn = columns.find((column) => column.key === "actions");
          const detailColumns = columns.filter((column) => column.key !== primary?.key && column.key !== "actions");
          return (
            <article className="admin-mobile-record-v18" key={`mobile-${key}`}>
              <div className="admin-mobile-record-head-v18">
                <div>{primary?.render ? primary.render(row) : row[primary?.key]}</div>
              </div>
              <div className="admin-mobile-record-details-v18">
                {detailColumns.map((column) => (
                  <div key={column.key}>
                    <span>{column.label}</span>
                    <strong>{column.render ? column.render(row) : row[column.key]}</strong>
                  </div>
                ))}
              </div>
              {actionColumn ? (
                <div className="admin-mobile-record-actions-v18">
                  <details className="admin-mobile-action-menu-v18">
                    <summary aria-label="Open admin actions">
                      <FiMoreVertical />
                    </summary>
                    <div>{actionColumn.render ? actionColumn.render(row) : row[actionColumn.key]}</div>
                  </details>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmModal({ confirmState, onCancel }) {
  const confirmKey = `${confirmState?.requiredText || ""}|${confirmState?.title || ""}`;
  const [typedConfirmationEntry, setTypedConfirmationEntry] = useState({ key: "", value: "" });
  const typedConfirmation = typedConfirmationEntry.key === confirmKey ? typedConfirmationEntry.value : "";
  if (!confirmState) return null;
  const requiredText = confirmState.requiredText || "";
  const confirmationMatches = !requiredText || typedConfirmation.trim() === requiredText;
  return (
    <div className="admin-confirm-backdrop-v17" role="presentation" onClick={onCancel}>
      <section className="admin-confirm-modal-v17" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <span className="admin-confirm-icon-v17">
          <FiAlertTriangle />
        </span>
        <div>
          <strong>{confirmState.title}</strong>
          <p>{confirmState.body}</p>
        </div>
        {requiredText ? (
          <label className="admin-confirm-typed-v23">
            <span>Type {requiredText} to continue</span>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmationEntry({ key: confirmKey, value: event.target.value })}
              autoFocus
            />
          </label>
        ) : null}
        <div className="admin-confirm-actions-v17">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="danger" onClick={confirmState.onConfirm} disabled={!confirmationMatches}>
            {confirmState.confirmLabel || "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminPanel({ currentUser, initialSection = "dashboard", onBackToApp, onGoDashboard }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessageText] = useState("");
  const [messageTone, setMessageTone] = useState("success");
  // Default any plain message to the success/info tone; errors go through
  // setErrorMessage so a failed request is never styled as a green success.
  const setMessage = (text) => {
    setMessageText(text);
    setMessageTone("success");
  };
  const setErrorMessage = (text) => {
    setMessageText(text);
    setMessageTone("error");
  };
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [verificationTab, setVerificationTab] = useState("Pending Review");
  const [roleFilter, setRoleFilter] = useState("All");
  const [subscriptionFilter, setSubscriptionFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [bookingFilter, setBookingFilter] = useState("All");
  const [smsFilter, setSmsFilter] = useState("all");
  const [smsStatusFilter, setSmsStatusFilter] = useState("all");
  const [smsSearch, setSmsSearch] = useState("");
  const [smsDraft, setSmsDraft] = useState({ to: "", message: "" });
  const [announcementDraft, setAnnouncementDraft] = useState({ audience: "all", title: "", body: "" });
  const [announcementSending, setAnnouncementSending] = useState(false);
  const [supportDrafts, setSupportDrafts] = useState({});
  const [activeSection, setActiveSection] = useState(["reports", "sms"].includes(initialSection) ? initialSection : "overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [subscriptionTab, setSubscriptionTab] = useState("Customers");
  const [subscriptionData, setSubscriptionData] = useState({
    summary: null,
    customers: [],
    providers: [],
    payments: [],
    auditLog: [],
    users: [],
    businesses: [],
    bookings: [],
    reviews: [],
    supportRequests: [],
    smsMessages: [],
    smsConfig: null,
    health: null,
    planCatalog: null,
    deploymentReadiness: null,
  });
  const [accessTest, setAccessTest] = useState({ feature: "smart_match", userId: "", businessId: "" });
  const [accessResult, setAccessResult] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [detailState, setDetailState] = useState(null);

  const isAdmin = ADMIN_ROLES.has(
    String(currentUser?.role || currentUser?.accountType || currentUser?.account_type || currentUser?.userType || currentUser?.user_type || "")
      .trim()
      .toLowerCase()
  );

  const loadAdminData = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const result = await getAdminOverview().catch(() => ({ overview: {}, businesses: [], bookings: [], services: [] }));
      const summary = await getAdminSummary()
        .catch(() => getAdminSubscriptionSummary())
        .catch(() => ({ summary: null }));
      const users = await getAdminUsers().catch(() => ({ users: [] }));
      const businessesResult = await getAdminBusinesses().catch(() => ({ businesses: [] }));
      const bookingsResult = await getAdminBookings().catch(() => ({ bookings: [] }));
      const reviewsResult = await getAdminReviews().catch(() => ({ reviews: [] }));
      const supportResult = await getAdminSupportRequests().catch(() => ({ supportRequests: [] }));
      const subscriptions = await getAdminSubscriptions().catch(() => ({ featureMatrix: DEFAULT_FEATURE_MATRIX }));
      const customers = await getAdminCustomerSubscriptions().catch(() => ({ customers: [] }));
      const providers = await getAdminProviderSubscriptions().catch(() => ({ providers: [] }));
      const payments = await getAdminPayments().catch(() => ({ payments: [] }));
      const sms = await getAdminSmsMessages().catch(() => ({ messages: [], config: null }));
      const health = await getAdminSystemHealth().catch(() => ({ health: null }));
      const deploymentReadiness = await getAdminDeploymentReadiness().catch(() => ({ readiness: null }));
      const auditLog = await getAdminAuditLog().catch(() => ({ auditLog: [] }));
      setData(result);
      setSubscriptionData({
        summary: summary?.summary || null,
        customers: customers?.customers || [],
        providers: providers?.providers || [],
        payments: payments?.payments || [],
        auditLog: auditLog?.auditLog || [],
        users: users?.users || [],
        businesses: businessesResult?.businesses || [],
        bookings: bookingsResult?.bookings || [],
        reviews: reviewsResult?.reviews || [],
        supportRequests: supportResult?.supportRequests || [],
        smsMessages: sms?.messages || [],
        smsConfig: sms?.config || null,
        health: health?.health || null,
        planCatalog: subscriptions || null,
        deploymentReadiness: deploymentReadiness?.readiness || null,
      });
      setMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [isAdmin]);

  const businesses = subscriptionData.businesses?.length ? subscriptionData.businesses : data?.businesses || [];
  const bookings = subscriptionData.bookings?.length ? subscriptionData.bookings : data?.bookings || [];
  const reviews = subscriptionData.reviews || [];
  const supportRequests = subscriptionData.supportRequests || [];
  const services = data?.services || [];
  const overview = data?.overview || {};
  const summary = subscriptionData.summary || {};
  const payments = subscriptionData.payments || [];
  const customers = subscriptionData.customers || [];
  const providers = subscriptionData.providers || [];
  const auditLog = subscriptionData.auditLog || [];
  const allUsers = subscriptionData.users || [];
  const smsMessages = subscriptionData.smsMessages || [];
  const smsConfig = subscriptionData.smsConfig || {};
  const health = subscriptionData.health || {};
  const deploymentReadiness = subscriptionData.deploymentReadiness || null;
  const featureMatrix = subscriptionData.planCatalog?.featureMatrix || DEFAULT_FEATURE_MATRIX;

  const bookingGroups = useMemo(() => {
    const pending = bookings.filter((booking) => ["pending", "payment_pending", "confirmed"].includes(String(booking.status || "").toLowerCase()));
    const completed = bookings.filter((booking) => String(booking.status || "").toLowerCase() === "completed");
    const failed = bookings.filter((booking) => ["cancelled", "rejected", "failed"].includes(String(booking.status || "").toLowerCase()));
    return { pending, completed, failed };
  }, [bookings]);

  const paymentGroups = useMemo(() => {
    const pendingMtn = payments.filter((payment) => isMtnPayment(payment) && isPending(payment.status));
    const successfulMtn = payments.filter((payment) => isMtnPayment(payment) && ["successful", "success", "completed"].includes(String(payment.status || "").toLowerCase()));
    const failedMtn = payments.filter((payment) => isMtnPayment(payment) && isFailed(payment.status));
    const mtnPayments = payments
      .filter((payment) => isMtnPayment(payment))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    const failedPayments = payments.filter((payment) => isFailed(payment.status));
    const walletTopups = payments.filter((payment) => String(payment.transaction_type || "").toLowerCase() === "wallet_topup");
    const revenueToday = payments
      .filter((payment) => new Date(payment.created_at).toDateString() === new Date().toDateString())
      .filter((payment) => ["successful", "success", "completed", "paid"].includes(String(payment.status || payment.payment_status || "").toLowerCase()))
      .reduce((sum, payment) => sum + Number(payment.gross_amount || payment.amount || 0), 0);
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const revenueMonth = payments
      .filter((payment) => {
        const date = new Date(payment.created_at);
        return date.getMonth() === month && date.getFullYear() === year;
      })
      .filter((payment) => ["successful", "success", "completed", "paid"].includes(String(payment.status || payment.payment_status || "").toLowerCase()))
      .reduce((sum, payment) => sum + Number(payment.gross_amount || payment.amount || 0), 0);
    return { pendingMtn, successfulMtn, failedMtn, mtnPayments, failedPayments, walletTopups, revenueToday, revenueMonth };
  }, [payments]);

  const categoryRows = useMemo(() => {
    const counts = new Map();
    businesses.forEach((business) => {
      const category = String(business.business_type || "Other").trim() || "Other";
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    ["Barber", "Salon", "Spa", "Plumbing", "Carpentry", "Cleaning", "Repairs", "Tutor / Lessons", "Other"].forEach((category) => {
      if (!counts.has(category)) counts.set(category, 0);
    });
    return Array.from(counts.entries()).map(([name, count], index) => ({
      id: index + 1,
      name,
      providers: count,
      featured: ["Barber", "Salon", "Tutor / Lessons"].includes(name),
      status: "active",
    }));
  }, [businesses]);

  const walletRows = useMemo(() => {
    const customerRows = customers.map((customer) => ({
      id: `customer-${customer.userId}`,
      owner: customer.fullName || customer.username,
      type: "Customer",
      balance: customer.walletBalance,
      status: customer.smartMatchAccess ? "premium" : "basic",
      lastTransaction: customer.lastPaymentStatus || "none",
      meta: `${customer.bookingCount || 0} bookings`,
    }));
    const providerRows = providers.map((provider) => ({
      id: `provider-${provider.businessId}`,
      owner: provider.businessName,
      type: "Provider",
      balance: provider.walletAvailable,
      status: provider.aiCoachAccess ? "platinum" : String(provider.plan || "provider").toLowerCase(),
      lastTransaction: provider.lastPaymentStatus || "none",
      meta: `${provider.bookingCount || 0} bookings`,
    }));
    return [...customerRows, ...providerRows];
  }, [customers, providers]);

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
      const rs = String(business.review_status || "pending_review").toLowerCase();
      const isBanned = Boolean(business.is_banned);
      const isSuspended = Boolean(business.is_suspended);
      const matchesVerification =
        (verificationTab === "Pending Review" && !isBanned && !isSuspended && ["pending_review", "pending"].includes(rs)) ||
        (verificationTab === "Verified" && !isBanned && !isSuspended && (Boolean(business.is_verified) || rs === "verified")) ||
        (verificationTab === "Changes Requested" && !isBanned && !isSuspended && rs === "changes_requested") ||
        (verificationTab === "Suspended" && isSuspended && !isBanned) ||
        (verificationTab === "Banned" && isBanned);
      return matchesTerm && matchesPlan && matchesVerification;
    });
  }, [businesses, planFilter, verificationTab, query]);

  const combinedUsers = useMemo(() => {
    if (allUsers.length) return allUsers;
    return [
      ...customers.map((row) => ({
        id: row.userId,
        userId: row.userId,
        fullName: row.fullName || row.username,
        username: row.username,
        role: "customer",
        subscriptionTier: row.plan,
        subscriptionStatus: row.status,
        paymentStatus: row.lastPaymentStatus,
        accountStatus: row.status,
        smartMatchAccess: row.smartMatchAccess,
        aiCoachAccess: false,
        walletBalance: row.walletBalance,
        bookingCount: row.bookingCount,
        email: row.email,
        phone: row.phone,
        createdAt: row.startedAt,
      })),
      ...providers.map((row) => ({
        id: row.userId || row.businessId,
        userId: row.userId,
        fullName: row.providerName || row.businessName,
        username: row.providerName,
        role: "provider",
        subscriptionTier: row.plan,
        subscriptionStatus: row.status,
        paymentStatus: row.lastPaymentStatus,
        accountStatus: row.businessStatus,
        smartMatchAccess: false,
        aiCoachAccess: row.aiCoachAccess,
        walletBalance: row.walletAvailable,
        bookingCount: row.bookingCount,
        email: row.email,
        phone: row.phone,
        businessId: row.businessId,
        businessName: row.businessName,
      })),
    ];
  }, [allUsers, customers, providers]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return combinedUsers.filter((user) => {
      const role = String(user.role || "").toLowerCase();
      const tier = String(user.subscriptionTier || user.plan || "").toUpperCase();
      const status = String(user.subscriptionStatus || user.accountStatus || "").toUpperCase();
      const matchesRole = roleFilter === "All" || role === roleFilter;
      const matchesSub =
        subscriptionFilter === "All" ||
        tier === subscriptionFilter ||
        (subscriptionFilter === "EXPIRED" && status === "EXPIRED");
      const matchesTerm =
        !term ||
        [user.fullName, user.username, user.email, user.phone, user.businessName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesRole && matchesSub && matchesTerm;
    });
  }, [combinedUsers, query, roleFilter, subscriptionFilter]);

  const filteredPayments = useMemo(() => {
    const now = new Date();
    return payments.filter((payment) => {
      const status = String(payment.status || payment.payment_status || "").toLowerCase();
      const date = new Date(payment.created_at);
      if (paymentFilter === "Successful") return isSuccess(status);
      if (paymentFilter === "Pending") return isPending(status);
      if (paymentFilter === "Failed") return isFailed(status);
      if (paymentFilter === "Cancelled") return status === "cancelled";
      if (paymentFilter === "Today") return date.toDateString() === now.toDateString();
      if (paymentFilter === "This week") return isThisWeek(payment.created_at);
      if (paymentFilter === "This month") return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      return true;
    });
  }, [paymentFilter, payments]);

  const filteredBookings = useMemo(() => {
    const term = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      const status = String(booking.status || "").toLowerCase();
      const matchesStatus = bookingFilter === "All" || status === bookingFilter.toLowerCase();
      const matchesTerm =
        !term ||
        [booking.customer_username, booking.customer_name, booking.business_name, booking.service_name, booking.payment_method, booking.payment_status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesStatus && matchesTerm;
    });
  }, [bookingFilter, bookings, query]);

  const pageTitle = {
    overview: "Overview",
    users: "Users",
    customers: "Customers",
    providers: "Providers",
    businesses: "Businesses",
    bookings: "Bookings",
    reviews: "Reviews",
    subscriptions: "Subscriptions",
    payments: "Payments",
    wallets: "Wallets",
    mtn: "MTN Monitor",
    sms: "SMS Monitor",
    notifications: "Announcements",
    smartMatch: "Smart Match",
    aiCoach: "Provider Coach",
    categories: "Categories",
    reports: "Reports",
    audit: "Audit Log",
    settings: "Settings",
  }[activeSection] || "Overview";

  const navItems = [
    ["overview", "Overview", FiHome],
    ["users", "Users", FiUsers],
    ["customers", "Customers", FiUser],
    ["providers", "Providers", FiBriefcase],
    ["businesses", "Businesses", FiGrid],
    ["bookings", "Bookings", FiClock],
    ["reviews", "Reviews", FiStar],
    ["subscriptions", "Subscriptions", FiShield],
    ["payments", "Payments", FiCreditCard],
    ["wallets", "Wallets", FiDollarSign],
    ["mtn", "MTN Monitor", FiSmartphone],
    ["sms", "SMS", FiMessageSquare],
    ["notifications", "Announcements", FiBell],
    ["smartMatch", "Smart Match", FiZap],
    ["aiCoach", "Provider Coach", FiStar],
    ["categories", "Categories", FiLayers],
    ["reports", "Reports", FiBarChart2],
    ["audit", "Audit Log", FiDatabase],
    ["settings", "Settings", FiSettings],
  ];

  const openConfirm = ({ title, body, confirmLabel, requiredText = "", action }) => {
    setConfirmState({
      title,
      body,
      confirmLabel,
      requiredText,
      onConfirm: async () => {
        setConfirmState(null);
        await action();
      },
    });
  };

  const handleBusinessAction = async (business, payload) => {
    const reasonByAction = {
      verify: "Admin approved provider verification.",
      mark_verification_pending: "Admin marked provider verification pending.",
      reject_verification: "Admin rejected provider verification.",
      request_changes: "Admin requested changes to provider business.",
      suspend: "Admin suspended business from the control center.",
      ban: "Admin banned business from the platform.",
      restore: "Admin restored business to pending review.",
      unpublish: "Admin unpublished business listing.",
      activate: "Admin activated business from the control center.",
    };

    const needsReason = ["request_changes", "ban", "suspend"].includes(payload.action);
    let reason = payload.reason || reasonByAction[payload.action] || "Admin business action.";

    if (needsReason) {
      // eslint-disable-next-line no-alert
      const input = window.prompt(
        `Enter a reason for "${payload.action}" on ${business.business_name} (shown to provider):`,
        reason,
      );
      if (input === null) return; // cancelled
      if (input.trim()) reason = input.trim();
    }

    const actionPayload = { ...payload, reason };
    openConfirm({
      title: `Update ${business.business_name}`,
      body: `Action: ${actionPayload.action}. Reason: ${reason}`,
      confirmLabel: "Apply change",
      action: async () => {
        try {
          setMessage("Updating business...");
          await updateAdminBusiness(business.id, actionPayload);
          await loadAdminData();
          setMessage(`${business.business_name} updated.`);
        } catch (error) {
          setErrorMessage(error.message || "Could not update business.");
        }
      },
    });
  };

  const updateSupportDraft = (requestId, patch) => {
    setSupportDrafts((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        ...patch,
      },
    }));
  };

  const getSupportDraft = (row) => ({
    status: supportDrafts[row.id]?.status ?? row.status ?? "open",
    admin_notes: supportDrafts[row.id]?.admin_notes ?? row.admin_notes ?? "",
  });

  const handleSupportRequestAction = async (row) => {
    const draft = getSupportDraft(row);
    openConfirm({
      title: `Update support request #${row.id}`,
      body: `This changes the request status to ${cleanStatus(draft.status)} and saves the admin note for the support team audit trail.`,
      confirmLabel: "Save support update",
      action: async () => {
        try {
          setMessage("Updating support request...");
          const result = await updateAdminSupportRequest(row.id, {
            status: draft.status,
            admin_notes: draft.admin_notes,
            reason: `Admin support update: ${cleanStatus(draft.status)}`,
          });
          if (result?.supportRequests) {
            setSubscriptionData((prev) => ({ ...prev, supportRequests: result.supportRequests }));
          }
          const auditLogResult = await getAdminAuditLog().catch(() => ({ auditLog: null }));
          if (auditLogResult?.auditLog) {
            setSubscriptionData((prev) => ({ ...prev, auditLog: auditLogResult.auditLog }));
          }
          await loadAdminData();
          setSupportDrafts((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          setMessage(`Support request #${row.id} updated.`);
        } catch (error) {
          setErrorMessage(error.message || "Could not update support request.");
        }
      },
    });
  };

  const handleDemoCleanup = () => {
    const suspectCount = deploymentReadiness?.demoBusinessSuspects?.length || 0;
    if (!suspectCount) {
      setMessage("No demo or test businesses were found.");
      return;
    }
    openConfirm({
      title: "Soft-disable demo businesses?",
      body: `This will unpublish and mark ${suspectCount} suspected demo/test business record(s) as deleted. Users, bookings, payments, and audit history stay intact.`,
      confirmLabel: "Soft-disable",
      action: async () => {
        try {
          setMessage("Cleaning up demo businesses...");
          const result = await cleanupAdminDemoBusinesses({
            confirmation: "SOFT DISABLE DEMO BUSINESSES",
            reason: "Admin Panel production launch cleanup",
          });
          await refreshReadinessFromResult(result);
          setMessage(result.message || "Demo cleanup completed.");
        } catch (error) {
          setErrorMessage(error.message || "Demo cleanup failed.");
        }
      },
    });
  };

  const handlePaidFeatureRemediation = () => {
    const customerCount = unsafeCustomerPremiumRows.length;
    const providerCount = unsafeProviderPlatinumRows.length;
    const total = customerCount + providerCount;
    if (!total) {
      setMessage("No unsafe Customer Premium or Provider Platinum rows were found.");
      return;
    }

    openConfirm({
      title: "Remediate paid-feature entitlements?",
      body: `This will downgrade or expire ${customerCount} Customer Premium row(s) and ${providerCount} Provider Platinum row(s) listed in the readiness table. It does not grant access, create payment records, or weaken Smart Match and Provider Coach route guards.`,
      confirmLabel: "Remediate",
      requiredText: "REMEDIATE PAID FEATURE ENTITLEMENTS",
      action: async () => {
        try {
          setMessage("Remediating paid-feature entitlements...");
          const result = await remediateAdminDeploymentReadiness({
            action: "remediate_paid_feature_entitlements",
            confirmation: "REMEDIATE PAID FEATURE ENTITLEMENTS",
            expectedCustomerRows: customerCount,
            expectedProviderRows: providerCount,
            reason: "Admin Panel paid-feature entitlement remediation",
          });
          await refreshReadinessFromResult(result);
          setMessage(result.message || "Paid-feature entitlement remediation completed.");
        } catch (error) {
          setErrorMessage(error.message || "Could not remediate paid-feature entitlements.");
        }
      },
    });
  };

  const refreshReadinessFromResult = async (result) => {
    setSubscriptionData((prev) => ({ ...prev, deploymentReadiness: result.readiness || prev.deploymentReadiness }));
    const auditLogResult = await getAdminAuditLog().catch(() => ({ auditLog: null }));
    if (auditLogResult?.auditLog) {
      setSubscriptionData((prev) => ({ ...prev, auditLog: auditLogResult.auditLog }));
    }
  };

  const handleReadinessRemediation = (row, action) => {
    const actionCopy = {
      soft_disable_demo_business: {
        title: `Soft-disable ${row.businessName}?`,
        body: "This unpublishes the suspect demo/test business, marks it deleted, and keeps users, bookings, payments, and audit history intact.",
        label: "Soft-disable",
      },
      publish_provider: {
        title: `Publish ${row.businessName}?`,
        body: "This publishes a provider that already has required details, services, and launch access. The admin audit log will record the change.",
        label: "Publish",
      },
      start_provider_trial: {
        title: `Activate Free plan for ${row.businessName}?`,
        body: "This creates an audited Free plan activation, activates the provider, and publishes the business for launch.",
        label: "Activate Free",
      },
      admin_approve_provider: {
        title: `Admin-approve ${row.businessName}?`,
        body: "This applies an audited manual approval, keeps or assigns a Free launch tier, and publishes the provider.",
        label: "Approve",
      },
      hold_incomplete_provider: {
        title: `Hold ${row.businessName} from launch?`,
        body: "This safely unpublishes the incomplete provider and marks it almost ready, without fabricating missing details or services.",
        label: "Hold from launch",
      },
    }[action];

    openConfirm({
      title: actionCopy.title,
      body: actionCopy.body,
      confirmLabel: actionCopy.label,
      action: async () => {
        try {
          setMessage("Applying readiness fix...");
          const result = await remediateAdminDeploymentReadiness({
            action,
            businessId: row.id,
            reason: `Admin Panel readiness fix: ${cleanStatus(action)}`,
          });
          await refreshReadinessFromResult(result);
          setMessage(result.message || "Readiness fix applied.");
        } catch (error) {
          setErrorMessage(error.message || "Could not apply readiness fix.");
        }
      },
    });
  };

  const refreshSmsMessages = async (overrides = {}) => {
    const sms = await getAdminSmsMessages({
      direction: overrides.direction ?? smsFilter,
      status: overrides.status ?? smsStatusFilter,
      search: overrides.search ?? smsSearch,
    }).catch(() => ({ messages: [], config: smsConfig }));
    setSubscriptionData((prev) => ({
      ...prev,
      smsMessages: sms?.messages || [],
      smsConfig: sms?.config || prev.smsConfig,
    }));
  };

  const submitAdminSms = async (event) => {
    event.preventDefault();
    try {
      setMessage("Sending SMS...");
      await sendAdminSms(smsDraft);
      setSmsDraft({ to: "", message: "" });
      await refreshSmsMessages();
      setMessage("SMS sent.");
    } catch (error) {
      setErrorMessage(error.message || "Could not send SMS.");
    }
  };

  const handleCustomerSubscriptionAction = async (customer, payload) => {
    const unlocks = ["upgrade", "activate"].includes(payload.action);
    openConfirm({
      title: `${unlocks ? "Unlock" : "Lock"} Smart Match`,
      body: `You are changing ${customer.fullName || customer.username}. This will ${unlocks ? "unlock" : "lock"} Smart Match based on the resulting Premium status.`,
      confirmLabel: "Update customer",
      action: async () => {
        try {
          setMessage("Updating customer subscription...");
          await updateAdminCustomerSubscription(customer.userId, { ...payload, reason: payload.reason || "Admin control center update" });
          await loadAdminData();
          setMessage("Customer subscription updated.");
        } catch (error) {
          setErrorMessage(error.message || "Could not update customer subscription.");
        }
      },
    });
  };

  const handleProviderSubscriptionAction = async (provider, payload) => {
    const unlocks = payload.plan === "PLATINUM";
    openConfirm({
      title: `${unlocks ? "Unlock" : "Update"} Provider Coach`,
      body: `You are changing ${provider.businessName}. Premium unlocks 5 tips per month, Platinum unlocks unlimited Provider Coach guidance, and Free or inactive states remain locked.`,
      confirmLabel: "Update provider",
      action: async () => {
        try {
          setMessage("Updating provider subscription...");
          await updateAdminProviderSubscription(provider.businessId, { ...payload, reason: payload.reason || "Admin control center update" });
          await loadAdminData();
          setMessage("Provider subscription updated.");
        } catch (error) {
          setErrorMessage(error.message || "Could not update provider subscription.");
        }
      },
    });
  };

  const submitAccessTest = async (override = {}) => {
    try {
      const payload = { ...accessTest, ...override };
      setAccessTest(payload);
      setMessage("Running access test...");
      const result = await runAdminAccessTest(payload);
      setAccessResult(result?.result || null);
      setMessage("Access test completed.");
    } catch (error) {
      setAccessResult(null);
      setErrorMessage(error.message || "Could not run access test.");
    }
  };

  const renderSidebar = () => (
    <aside className={`admin-sidebar-v17 ${mobileMenuOpen ? "open mobile-open" : ""}`}>
      <div className="admin-brand-v17">
        <span><FiShield /></span>
        <div>
          <strong>Queless Ops</strong>
          <small>Control center</small>
        </div>
        <button type="button" className="admin-mobile-close-v17" onClick={() => setMobileMenuOpen(false)} aria-label="Close admin menu">
          <FiX />
        </button>
      </div>
      <nav>
        {navItems.map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            className={activeSection === id ? "active" : ""}
            onClick={() => {
              setActiveSection(id);
              setMobileMenuOpen(false);
            }}
          >
            <Icon /> <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="admin-drawer-footer-v19">
        <button type="button" onClick={onBackToApp}>
          <FiHome /> Home
        </button>
        <button type="button" onClick={() => setMobileMenuOpen(false)}>
          <FiX /> Close
        </button>
      </div>
    </aside>
  );

  const renderTopbar = () => (
    <header className="admin-topbar-v17">
      <button type="button" className="admin-menu-btn-v17" onClick={() => setMobileMenuOpen(true)} aria-label="Open admin menu">
        <FiMenu />
      </button>
      <div className="admin-topbar-title-v17">
        <span className="admin-topbar-eyebrow-v17">Admin Control Center</span>
        <strong className="admin-topbar-heading-v17">{pageTitle}</strong>
      </div>
      <label className="admin-global-search-v17">
        <FiSearch />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users, businesses, payments" />
      </label>
      <button type="button" className="admin-topbar-action-v17 admin-refresh-v19" onClick={loadAdminData} disabled={loading} aria-label="Refresh admin data">
        <FiRefreshCw /> Refresh
      </button>
      <button type="button" className="admin-topbar-action-v17 admin-home-v19" onClick={onBackToApp} aria-label="Back to app home">
        <FiHome /> Home
      </button>
      <span className="admin-avatar-v17">{String(currentUser?.username || "A").slice(0, 1).toUpperCase()}</span>
    </header>
  );

  const renderOverview = () => (
    <div className="admin-view-v17">
      <section className="admin-hero-v17">
        <div>
          <span className="admin-kicker-v13"><FiShield /> Superadmin operations</span>
          <h1>Queless Control Center</h1>
          <p>Manage customers, providers, subscriptions, payments, wallet activity, paid feature access, and deployment readiness from one place.</p>
        </div>
        <div className="admin-health-card-v17">
          <span>System Health</span>
          <strong>{health?.backend?.status || (paymentGroups.pendingMtn.length ? "Review MTN queue" : "Operational")}</strong>
          <small>{paymentGroups.pendingMtn.length} pending MTN payments - database {health?.database?.status || "connected"}</small>
        </div>
      </section>

      <section className="admin-overview-grid-v13 admin-overview-grid-v17">
        <AdminStatCard label="Total users" value={overview.total_users || combinedUsers.length} icon={FiUsers} onClick={() => setActiveSection("users")} />
        <AdminStatCard label="Customers" value={summary.totalCustomers || customers.length} icon={FiUser} onClick={() => { setRoleFilter("customer"); setActiveSection("users"); }} />
        <AdminStatCard label="Premium customers" value={summary.premiumCustomers ?? summary.totalPremiumCustomers} icon={FiZap} tone="success" onClick={() => { setSubscriptionFilter("PREMIUM"); setActiveSection("users"); }} />
        <AdminStatCard label="Free customers" value={summary.freeCustomers ?? summary.totalFreeCustomers} icon={FiUsers} onClick={() => { setSubscriptionFilter("FREE"); setActiveSection("users"); }} />
        <AdminStatCard label="Providers" value={summary.totalProviders || providers.length} icon={FiBriefcase} onClick={() => setActiveSection("providers")} />
        <AdminStatCard label="Free providers" value={summary.freeProviders ?? summary.totalFreeProviders ?? summary.proProviders ?? summary.totalProProviders} icon={FiBriefcase} onClick={() => { setPlanFilter("FREE"); setActiveSection("businesses"); }} />
        <AdminStatCard label="Premium providers" value={summary.premiumProviders ?? summary.totalPremiumProviders} icon={FiTrendingUp} onClick={() => { setPlanFilter("PREMIUM"); setActiveSection("businesses"); }} />
        <AdminStatCard label="Platinum providers" value={summary.platinumProviders ?? summary.totalPlatinumProviders} icon={FiStar} tone="premium" onClick={() => { setPlanFilter("PLATINUM"); setActiveSection("businesses"); }} />
        <AdminStatCard label="Pending approvals" value={summary.pendingProviderApprovals || 0} icon={FiAlertTriangle} tone="warning" onClick={() => setActiveSection("businesses")} />
        <AdminStatCard label="Bookings today" value={summary.bookingsToday ?? bookingGroups.pending.length} icon={FiClock} onClick={() => setActiveSection("bookings")} />
        <AdminStatCard label="Failed payments" value={summary.failedPayments ?? paymentGroups.failedPayments.length} icon={FiAlertTriangle} tone="danger" onClick={() => { setPaymentFilter("Failed"); setActiveSection("payments"); }} />
        <AdminStatCard label="Wallet/top-up issues" value={summary.walletTopupIssues ?? paymentGroups.walletTopups.filter((item) => isFailed(item.status)).length} icon={FiDollarSign} tone="warning" onClick={() => setActiveSection("wallets")} />
        <AdminStatCard label="Revenue today" value={formatMoney(summary.revenueToday ?? paymentGroups.revenueToday)} icon={FiTrendingUp} tone="success" onClick={() => { setPaymentFilter("Today"); setActiveSection("payments"); }} />
        <AdminStatCard label="Revenue this month" value={formatMoney((summary.revenueMonth ?? paymentGroups.revenueMonth) || overview.total_revenue_estimate)} icon={FiBarChart2} onClick={() => { setPaymentFilter("This month"); setActiveSection("payments"); }} />
        <AdminStatCard label="Locked feature attempts" value={summary.lockedFeatureAttempts ?? 0} icon={FiLock} onClick={() => setActiveSection("smartMatch")} />
      </section>

      <section className="admin-grid-2-v17">
        <div className="admin-card-v17">
          <div className="admin-section-head-v17">
            <div><strong>System Health</strong><span>Backend, database, MTN, callbacks, and subscription checks</span></div>
            <button type="button" onClick={() => setActiveSection("settings")}>Open checks</button>
          </div>
          <div className="admin-health-list-v20">
            <span><FiActivity /> Backend <b>{health?.backend?.status || "operational"}</b></span>
            <span><FiDatabase /> Database <b>{health?.database?.status || "connected"}</b></span>
            <span><FiSmartphone /> MTN <b>{health?.mtn?.status || "status endpoint pending"}</b></span>
            <span><FiShield /> Subscription logic <b>{health?.subscriptionLogic?.status || "active"}</b></span>
            <span><FiCheckCircle /> Last success <b>{formatDate(health?.lastSuccessfulPaymentCallback?.updatedAt)}</b></span>
            <span><FiAlertTriangle /> Last failure <b>{formatDate(health?.lastFailedPaymentCallback?.updatedAt)}</b></span>
          </div>
        </div>
        <div className="admin-card-v17">
          <div className="admin-section-head-v17">
            <div><strong>Recent payments</strong><span>MTN, subscription, wallet, and booking transactions</span></div>
            <button type="button" onClick={() => setActiveSection("payments")}>Open</button>
          </div>
          {payments.slice(0, 5).map((payment) => (
            <div className="admin-feed-row-v17" key={`recent-payment-${payment.id}`}>
              <FiCreditCard />
              <div><strong>{payment.internal_reference || payment.transaction_type}</strong><span>{payment.username || payment.full_name || payment.business_name || "Unknown"} - {formatMoney(payment.gross_amount)}</span></div>
              <em className={badgeClass(payment.status)}>{cleanStatus(payment.status)}</em>
            </div>
          ))}
        </div>

        <div className="admin-card-v17">
          <div className="admin-section-head-v17">
            <div><strong>Admin alerts</strong><span>Items that need operational attention</span></div>
          </div>
          <div className="admin-alert-list-v17">
            <span><FiAlertTriangle /> {paymentGroups.pendingMtn.length} MTN transactions pending</span>
            <span><FiLock /> {summary.lockedBusinesses || 0} businesses locked or hidden</span>
            <span><FiClock /> {summary.expiredTrials || 0} expired trials</span>
            <span><FiCreditCard /> {paymentGroups.failedPayments.length} failed payments</span>
          </div>
        </div>
      </section>
    </div>
  );

  const renderCustomers = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiUser} title="Customer Management" text="Manage free and Premium customer accounts, Smart Match access, wallet balances, and booking activity." />
      <AdminTable
        rows={customers}
        getKey={(row) => row.userId}
        emptyTitle="No customers found"
        columns={[
          { key: "customer", label: "Customer", render: (row) => <AccountCell title={row.fullName || row.username} subtitle={`${row.email || "No email"} - ${row.phone || "No phone"}`} /> },
          { key: "plan", label: "Plan", render: (row) => <span className={badgeClass(row.plan)}>{planLabel(row.plan)}</span> },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{cleanStatus(row.status)}</span> },
          { key: "smart", label: "Smart Match", render: (row) => row.smartMatchAccess ? "Yes" : "No" },
          { key: "payment", label: "Payment", render: (row) => `${row.lastPaymentStatus || "none"}${row.provider ? ` / ${row.provider}` : ""}` },
          { key: "wallet", label: "Wallet", render: (row) => formatMoney(row.walletBalance) },
          { key: "bookings", label: "Bookings", render: (row) => row.bookingCount || 0 },
          { key: "expires", label: "Expiry", render: (row) => formatDate(row.expiresAt) },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <ActionCluster>
                <button type="button" onClick={() => handleCustomerSubscriptionAction(row, { action: "upgrade" })}>Upgrade</button>
                <button type="button" onClick={() => handleCustomerSubscriptionAction(row, { action: "downgrade" })}>Downgrade</button>
                <button type="button" onClick={() => submitAccessTest({ feature: "smart_match", userId: row.userId, businessId: "" })}>Test</button>
              </ActionCluster>
            ),
          },
        ]}
      />
    </div>
  );

  const renderProviders = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiBriefcase} title="Provider and Business Management" text="Control provider plans, business visibility, Provider Coach access, earnings, and operational status." />
      <AdminTable
        rows={providers}
        getKey={(row) => row.businessId}
        emptyTitle="No providers found"
        columns={[
          { key: "business", label: "Business", render: (row) => <AccountCell title={row.businessName} subtitle={`${row.providerName} - ${row.email || "No email"} - ${row.phone || "No phone"}`} /> },
          { key: "plan", label: "Plan", render: (row) => <span className={badgeClass(row.plan)}>{planLabel(row.plan)}</span> },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{cleanStatus(row.status)}</span> },
          { key: "ai", label: "Provider Coach", render: (row) => row.aiCoachAccess ? "Yes" : "No" },
          { key: "businessStatus", label: "Business", render: (row) => `${row.businessStatus} / ${row.isPublished ? "public" : "hidden"}` },
          { key: "wallet", label: "Earnings", render: (row) => formatMoney(row.walletAvailable) },
          { key: "bookings", label: "Bookings", render: (row) => row.bookingCount || 0 },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <ActionCluster>
                {PROVIDER_PLANS.map((plan) => <button type="button" key={plan} onClick={() => handleProviderSubscriptionAction(row, { action: "set_plan", plan })}>{planLabel(plan)}</button>)}
                <button type="button" onClick={() => handleProviderSubscriptionAction(row, { action: "lock_business" })}>Lock</button>
                <button type="button" onClick={() => submitAccessTest({ feature: "ai_coach", userId: "", businessId: row.businessId })}>Test</button>
              </ActionCluster>
            ),
          },
        ]}
      />
    </div>
  );

  const renderBusinessActionsByTab = (row) => {
    const tab = verificationTab;
    return (
      <ActionCluster>
        <button type="button" onClick={() => setDetailState({ type: "business", item: row })}>Details</button>
        {tab === "Pending Review" && (
          <>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "verify" })}>Verify</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "request_changes" })}>Request Changes</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "unpublish" })}>Unpublish</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "suspend" })}>Suspend</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "ban" })}>Ban</button>
          </>
        )}
        {tab === "Verified" && (
          <>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "unpublish" })}>Unpublish</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "suspend" })}>Suspend</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "ban" })}>Ban</button>
          </>
        )}
        {tab === "Changes Requested" && (
          <>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "verify" })}>Verify</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "request_changes" })}>Update Reason</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "suspend" })}>Suspend</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "ban" })}>Ban</button>
          </>
        )}
        {tab === "Suspended" && (
          <>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "restore" })}>Restore</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "verify" })}>Verify</button>
            <button type="button" onClick={() => handleBusinessAction(row, { action: "ban" })}>Ban</button>
          </>
        )}
        {tab === "Banned" && (
          <button type="button" onClick={() => handleBusinessAction(row, { action: "restore" })}>Restore</button>
        )}
        <button type="button" onClick={() => submitAccessTest({ feature: "ai_coach", businessId: row.id })}>Test</button>
      </ActionCluster>
    );
  };

  const verificationTabCounts = useMemo(() => {
    const counts = {};
    for (const tab of VERIFICATION_TABS) {
      const rs = (b) => String(b.review_status || "pending_review").toLowerCase();
      counts[tab] = businesses.filter((b) => {
        const isBanned = Boolean(b.is_banned);
        const isSuspended = Boolean(b.is_suspended);
        if (tab === "Pending Review") return !isBanned && !isSuspended && ["pending_review", "pending"].includes(rs(b));
        if (tab === "Verified") return !isBanned && !isSuspended && (Boolean(b.is_verified) || rs(b) === "verified");
        if (tab === "Changes Requested") return !isBanned && !isSuspended && rs(b) === "changes_requested";
        if (tab === "Suspended") return isSuspended && !isBanned;
        if (tab === "Banned") return isBanned;
        return false;
      }).length;
    }
    return counts;
  }, [businesses]);

  const renderBusinesses = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiGrid} title="Business Registry" text="Search and manage public visibility, verification, trial status, services, reviews, and plan assignments." />

      <div className="admin-toolbar-v13">
        <div className="admin-filter-row-v13" style={{ gap: "6px", flexWrap: "wrap" }}>
          <FiShield style={{ marginRight: 4 }} />
          {VERIFICATION_TABS.map((tab) => (
            <button
              type="button"
              key={tab}
              className={verificationTab === tab ? "active" : ""}
              onClick={() => setVerificationTab(tab)}
              style={{ position: "relative" }}
            >
              {tab}
              {verificationTabCounts[tab] > 0 && (
                <span style={{ marginLeft: 6, background: tab === "Banned" ? "#dc2626" : tab === "Suspended" ? "#ea580c" : "#6d28d9", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                  {verificationTabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="admin-filter-row-v13" style={{ marginTop: 8 }}>
          <FiFilter />
          {PLAN_FILTERS.map((filter) => (
            <button type="button" key={filter} className={planFilter === filter ? "active" : ""} onClick={() => setPlanFilter(filter)}>{planLabel(filter)}</button>
          ))}
        </div>
      </div>

      {verificationTab === "Changes Requested" && (
        <div style={{ background: "var(--color-warning-bg, #fef9c3)", border: "1px solid var(--color-warning-border, #fde68a)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#78350f" }}>
          These businesses are unverified. The provider can see the reason you provided and is expected to update their profile before re-review.
        </div>
      )}

      {verificationTab === "Banned" && (
        <div style={{ background: "var(--color-danger-bg, #fee2e2)", border: "1px solid var(--color-danger-border, #fecaca)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#7f1d1d" }}>
          Banned businesses are completely hidden from all public listings, search, maps, and Smart Match. The provider cannot accept bookings.
        </div>
      )}

      <AdminTable
        rows={filteredBusinesses}
        getKey={(row) => row.id}
        emptyTitle={`No businesses in "${verificationTab}"`}
        columns={[
          { key: "business", label: "Business", render: (row) => <AccountCell title={row.business_name} subtitle={`${row.business_type} — ${row.owner_name}`} /> },
          { key: "plan", label: "Plan", render: (row) => <span className={badgeClass(row.current_plan)}>{planLabel(row.current_plan)}</span> },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.review_status || "pending_review")}>{cleanStatus(row.review_status || "pending_review")}</span> },
          { key: "reason", label: "Reason / Note", render: (row) => row.verification_change_reason || row.moderation_note || "—" },
          { key: "services", label: "Services", render: (row) => row.service_count || 0 },
          { key: "bookings", label: "Bookings", render: (row) => row.booking_count || 0 },
          { key: "actions", label: "Actions", render: renderBusinessActionsByTab },
        ]}
      />
    </div>
  );

  const renderBookings = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiClock} title="Booking Management" text="Monitor customer bookings, provider activity, payment status, service categories, and operational exceptions." />
      <section className="admin-overview-grid-v13">
        <AdminStatCard label="All bookings" value={bookings.length} icon={FiClock} />
        <AdminStatCard label="Pending" value={bookingGroups.pending.length} icon={FiAlertTriangle} tone="warning" />
        <AdminStatCard label="Completed" value={bookingGroups.completed.length} icon={FiCheckCircle} tone="success" />
        <AdminStatCard label="Failed or cancelled" value={bookingGroups.failed.length} icon={FiX} tone="danger" />
      </section>
      <FilterBar>
        {BOOKING_FILTERS.map((filter) => (
          <button type="button" key={filter} className={bookingFilter === filter ? "active" : ""} onClick={() => setBookingFilter(filter)}>{filter}</button>
        ))}
      </FilterBar>
      <AdminTable
        rows={filteredBookings.slice(0, 160)}
        getKey={(row) => row.id}
        emptyTitle="No bookings found"
        columns={[
          { key: "id", label: "Booking", render: (row) => `#${row.id}` },
          { key: "customer", label: "Customer", render: (row) => row.customer_username || row.customer_full_name || "Unknown" },
          { key: "business", label: "Business", render: (row) => row.business_name || row.barber_name || "Unknown" },
          { key: "service", label: "Service", render: (row) => row.service_name || row.service || "Service" },
          { key: "date", label: "Date/time", render: (row) => `${formatDate(row.booking_date || row.date)} ${row.booking_time || row.time || ""}` },
          { key: "price", label: "Price", render: (row) => formatMoney(row.price) },
          { key: "payment", label: "Payment", render: (row) => cleanStatus(row.payment_status || row.payment_method || "cash") },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{cleanStatus(row.status)}</span> },
          { key: "actions", label: "Actions", render: (row) => <ActionCluster><button type="button" onClick={() => setDetailState({ type: "booking", item: row })}>Details</button></ActionCluster> },
        ]}
      />
    </div>
  );

  const renderSubscriptions = () => {
    const expiredCustomers = customers.filter((row) => String(row.status || "").toLowerCase() === "expired");
    const expiredProviders = providers.filter((row) => String(row.status || "").toLowerCase() === "expired" || String(row.trialStatus || "").toLowerCase() === "expired");
    const pendingPayments = payments.filter((row) => isPending(row.status));
    const failedPayments = payments.filter((row) => isFailed(row.status));
    return (
      <div className="admin-view-v17">
        <PageIntro icon={FiShield} title="Subscription Control Center" text="Customer Premium and provider plans are separated. Customer Premium unlocks Smart Match. Provider Premium unlocks limited Provider Coach tips and Platinum unlocks unlimited guidance." />
        <section className="admin-overview-grid-v13">
          <AdminStatCard label="Free customers" value={summary.totalFreeCustomers} icon={FiUsers} />
          <AdminStatCard label="Premium customers" value={summary.totalPremiumCustomers} icon={FiZap} tone="success" />
          <AdminStatCard label="Free providers" value={summary.totalFreeProviders ?? summary.totalProProviders} icon={FiBriefcase} />
          <AdminStatCard label="Premium providers" value={summary.totalPremiumProviders} icon={FiTrendingUp} />
          <AdminStatCard label="Platinum providers" value={summary.totalPlatinumProviders} icon={FiStar} tone="premium" />
          <AdminStatCard label="Active trials" value={summary.activeTrials} icon={FiClock} />
          <AdminStatCard label="Pending payments" value={pendingPayments.length} icon={FiSmartphone} tone="warning" />
          <AdminStatCard label="Failed payments" value={failedPayments.length} icon={FiAlertTriangle} tone="danger" />
        </section>
        <section className="admin-card-v17">
          <div className="admin-section-head-v17">
            <div><strong>Feature Access Matrix</strong><span>Allowed and locked states for every paid feature tier</span></div>
          </div>
          <FeatureMatrix rows={featureMatrix} />
        </section>
        <div className="admin-filter-row-v13 admin-subscription-tabs-v16">
          {SUBSCRIPTION_TABS.map((tab) => <button type="button" key={tab} className={subscriptionTab === tab ? "active" : ""} onClick={() => setSubscriptionTab(tab)}>{tab}</button>)}
        </div>
        {subscriptionTab === "Customers" ? renderCustomers() : null}
        {subscriptionTab === "Providers" ? renderProviders() : null}
        {subscriptionTab === "Trials" ? <ProviderCards rows={providers.filter((row) => String(row.trialStatus || "").toLowerCase().includes("active") || String(row.plan || "").toUpperCase() === "TRIAL")} onAction={handleProviderSubscriptionAction} /> : null}
        {subscriptionTab === "Expired" ? <ExpiredPanel customers={expiredCustomers} providers={expiredProviders} /> : null}
        {subscriptionTab === "Pending Payments" ? <PaymentCards rows={pendingPayments} /> : null}
        {subscriptionTab === "Failed Payments" ? <PaymentCards rows={failedPayments} /> : null}
        {subscriptionTab === "Access Testing" ? renderAccessTesting() : null}
      </div>
    );
  };

  const renderPayments = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiCreditCard} title="Payments and MTN Monitor" text="Review booking payments, subscription payments, Customer Premium payments, provider plan payments, wallet top-ups, and MTN transaction status." />
      <section className="admin-overview-grid-v13">
        <AdminStatCard label="All payments" value={payments.length} icon={FiCreditCard} />
        <AdminStatCard label="MTN pending" value={paymentGroups.pendingMtn.length} icon={FiSmartphone} tone="warning" />
        <AdminStatCard label="MTN successful" value={paymentGroups.successfulMtn.length} icon={FiCheckCircle} tone="success" />
        <AdminStatCard label="Failed payments" value={paymentGroups.failedPayments.length} icon={FiAlertTriangle} tone="danger" />
      </section>
      <FilterBar>
        {PAYMENT_FILTERS.map((filter) => (
          <button type="button" key={filter} className={paymentFilter === filter ? "active" : ""} onClick={() => setPaymentFilter(filter)}>{filter}</button>
        ))}
      </FilterBar>
      <AdminTable
        rows={filteredPayments}
        getKey={(row) => row.id}
        emptyTitle="No payments found"
        columns={[
          { key: "reference", label: "Reference", render: (row) => <AccountCell title={row.internal_reference || `Payment #${row.id}`} subtitle={row.mtn_reference || row.provider_reference || "No provider reference"} /> },
          { key: "user", label: "User/business", render: (row) => row.username || row.full_name || row.business_name || "Unknown" },
          { key: "amount", label: "Amount", render: (row) => formatMoney(row.gross_amount || row.amount) },
          { key: "type", label: "Type", render: (row) => cleanStatus(row.transaction_type) },
          { key: "method", label: "Method", render: (row) => row.provider || row.payment_method || "cash" },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{cleanStatus(row.status)}</span> },
          { key: "credited", label: "Wallet credited", render: (row) => String(row.transaction_type || "").toLowerCase() === "wallet_topup" ? (row.wallet_credited === true || Number(row.wallet_credited || 0) === 1 ? "Yes" : "No") : "-" },
          { key: "updated", label: "Updated", render: (row) => formatDate(row.updated_at) },
          { key: "actions", label: "Actions", render: (row) => <ActionCluster><button type="button" onClick={() => setDetailState({ type: "payment", item: row })}>Callback</button><button type="button" onClick={() => setMessage("Status retry is available when the backend provider check endpoint is connected.")}>Retry check</button></ActionCluster> },
        ]}
      />
    </div>
  );

  const renderMtnMonitor = () => {
    const mtnHealth = health?.mtn || {};
    const rawStatus = mtnHealth.status || mtnHealth.collectionStatus || (paymentGroups.pendingMtn.length ? "pending" : "unknown");
    const statusLabel = adminStatusLabel(rawStatus);
    const callbackUrl = mtnHealth.callbackUrl || mtnHealth.callback_url || mtnHealth.webhookUrl || "";
    const callbackLabel = callbackUrl ? "Online" : "Unknown";
    const lastCheck = mtnHealth.checkedAt || mtnHealth.checked_at || mtnHealth.updatedAt || health?.checkedAt || health?.timestamp;
    const recentCallbacks = paymentGroups.mtnPayments.slice(0, 5);

    return (
      <div className="admin-view-v17 admin-mtn-monitor-v22">
        <PageIntro icon={FiSmartphone} title="MTN Monitor" text="Track MTN collection health, callback delivery, failed transactions, and retry-ready payment records." />
        <section className="admin-mtn-status-grid-v22">
          <article className="admin-card-v17 admin-mtn-status-card-v22">
            <div className="admin-section-head-v17">
              <div>
                <strong>MTN Status</strong>
                <span>Collection API health and pending queue</span>
              </div>
              <span className={badgeClass(statusLabel)}>{statusLabel}</span>
            </div>
            <div className="admin-result-grid-v20">
              <span>Pending <b>{paymentGroups.pendingMtn.length}</b></span>
              <span>Successful <b>{paymentGroups.successfulMtn.length}</b></span>
              <span>Failed <b>{paymentGroups.failedMtn.length}</b></span>
              <span>Provider <b>{mtnHealth.environment || mtnHealth.env || "MTN"}</b></span>
            </div>
            <button type="button" className="admin-primary-v17 admin-mtn-refresh-v22" onClick={loadAdminData} disabled={loading}>
              <FiRefreshCw /> {loading ? "Refreshing" : "Refresh status"}
            </button>
          </article>

          <article className="admin-card-v17">
            <div className="admin-section-head-v17">
              <div>
                <strong>Last Health Check</strong>
                <span>{formatDate(lastCheck)}</span>
              </div>
              <span className={badgeClass(statusLabel)}>{statusLabel}</span>
            </div>
            <div className="admin-health-list-v20">
              <span><FiActivity /> Backend <b>{health?.backend?.status || "Unknown"}</b></span>
              <span><FiDatabase /> Database <b>{health?.database?.status || "Unknown"}</b></span>
              <span><FiSmartphone /> MTN <b>{rawStatus || "Unknown"}</b></span>
              <span><FiClock /> Checked <b>{formatDate(lastCheck)}</b></span>
            </div>
          </article>

          <article className="admin-card-v17">
            <div className="admin-section-head-v17">
              <div>
                <strong>Callback URL Status</strong>
                <span>{callbackUrl || "No callback URL reported by health endpoint"}</span>
              </div>
              <span className={badgeClass(callbackLabel)}>{callbackLabel}</span>
            </div>
            <div className="admin-alert-list-v17">
              <span><FiCheckCircle /> Wallet credits and subscription activation should only happen after confirmed provider success.</span>
              <span><FiAlertTriangle /> Pending or failed callbacks stay reviewable here without blocking page interaction.</span>
            </div>
          </article>
        </section>

        <section className="admin-grid-2-v17">
          <article className="admin-card-v17">
            <div className="admin-section-head-v17">
              <div>
                <strong>Recent Payment Callbacks</strong>
                <span>Latest MTN-linked payment rows</span>
              </div>
              <span className={badgeClass(recentCallbacks.length ? "Online" : "Unknown")}>{recentCallbacks.length ? "Online" : "Unknown"}</span>
            </div>
            {recentCallbacks.length ? recentCallbacks.map((payment) => (
              <button type="button" className="admin-mtn-callback-row-v22" key={payment.id} onClick={() => setDetailState({ type: "payment", item: payment })}>
                <FiSmartphone />
                <span>
                  <strong>{payment.internal_reference || payment.mtn_reference || `Payment #${payment.id}`}</strong>
                  <small>{payment.username || payment.full_name || payment.business_name || "Unknown"} - {formatMoney(payment.gross_amount || payment.amount)}</small>
                </span>
                <em className={badgeClass(payment.status)}>{cleanStatus(payment.status)}</em>
              </button>
            )) : <AdminEmptyState icon={FiSmartphone} title="No MTN callbacks yet" text="MTN payment callback rows will appear here after the backend receives them." />}
          </article>

          <article className="admin-card-v17">
            <div className="admin-section-head-v17">
              <div>
                <strong>Failed Transactions</strong>
                <span>MTN payments needing review or retry</span>
              </div>
              <span className={badgeClass(paymentGroups.failedMtn.length ? "Failed" : "Online")}>{paymentGroups.failedMtn.length ? "Failed" : "Online"}</span>
            </div>
            {paymentGroups.failedMtn.length ? paymentGroups.failedMtn.slice(0, 6).map((payment) => (
              <button type="button" className="admin-mtn-callback-row-v22" key={payment.id} onClick={() => setDetailState({ type: "payment", item: payment })}>
                <FiAlertTriangle />
                <span>
                  <strong>{payment.internal_reference || payment.mtn_reference || `Payment #${payment.id}`}</strong>
                  <small>{payment.username || payment.full_name || payment.business_name || "Unknown"} - {formatDate(payment.updated_at || payment.created_at)}</small>
                </span>
                <em className={badgeClass(payment.status)}>{cleanStatus(payment.status)}</em>
              </button>
            )) : <AdminEmptyState icon={FiCheckCircle} title="No failed MTN payments" text="Failed MTN transactions will appear here when backend payment rows need review." />}
          </article>
        </section>
      </div>
    );
  };

  const renderWallets = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiDollarSign} title="Wallet Admin" text="Customer wallets and provider earnings wallets are displayed separately. Wallet credits still depend on confirmed backend payment success." />
      <AdminTable
        rows={walletRows}
        getKey={(row) => row.id}
        emptyTitle="No wallet records found"
        columns={[
          { key: "owner", label: "User/business", render: (row) => <AccountCell title={row.owner} subtitle={row.meta} /> },
          { key: "type", label: "Wallet type", render: (row) => <span className={badgeClass(row.type)}>{row.type}</span> },
          { key: "balance", label: "Balance", render: (row) => formatMoney(row.balance) },
          { key: "status", label: "Status", render: (row) => cleanStatus(row.status) },
          { key: "last", label: "Last transaction", render: (row) => cleanStatus(row.lastTransaction) },
        ]}
      />
    </div>
  );

  const renderSms = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiMessageSquare} title="SMS Monitor" text="Review Africa's Talking incoming and outgoing SMS, linked users, auto-replies, and failed sends." />
      <section className="admin-overview-grid-v13">
        <AdminStatCard label="SMS records" value={smsMessages.length} icon={FiMessageSquare} />
        <AdminStatCard label="Incoming" value={smsMessages.filter((row) => row.direction === "incoming").length} icon={FiArrowDownLeft} tone="success" />
        <AdminStatCard label="Outgoing" value={smsMessages.filter((row) => row.direction === "outgoing").length} icon={FiArrowUpRight} />
        <AdminStatCard label="Failed" value={smsMessages.filter((row) => isFailed(row.status)).length} icon={FiAlertTriangle} tone="danger" />
      </section>
      <section className="admin-card-v17">
        <div className="admin-section-head-v17">
          <div>
            <strong>Send test SMS</strong>
            <span>{smsConfig?.enabled ? `Africa's Talking ${smsConfig.env || "sandbox"} is configured` : "SMS sending is unavailable until backend credentials are configured"}</span>
          </div>
        </div>
        <form className="admin-form-grid-v17" onSubmit={submitAdminSms}>
          <label>
            <span>Recipient phone</span>
            <input value={smsDraft.to} onChange={(event) => setSmsDraft((prev) => ({ ...prev, to: event.target.value }))} placeholder="+256700000000" />
          </label>
          <label>
            <span>Message</span>
            <textarea value={smsDraft.message} onChange={(event) => setSmsDraft((prev) => ({ ...prev, message: event.target.value }))} maxLength={918} rows={3} placeholder="Your Queless booking has been confirmed." />
          </label>
          <button type="submit" className="admin-primary-v17">Send SMS</button>
        </form>
      </section>
      <FilterBar>
        {["all", "incoming", "outgoing"].map((filter) => (
          <button type="button" key={filter} className={smsFilter === filter ? "active" : ""} onClick={() => { setSmsFilter(filter); refreshSmsMessages({ direction: filter }); }}>{cleanStatus(filter)}</button>
        ))}
        {["all", "received", "sent", "failed", "queued"].map((filter) => (
          <button type="button" key={filter} className={smsStatusFilter === filter ? "active" : ""} onClick={() => { setSmsStatusFilter(filter); refreshSmsMessages({ status: filter }); }}>{cleanStatus(filter)}</button>
        ))}
      </FilterBar>
      <div className="admin-filter-row-v13">
        <input value={smsSearch} onChange={(event) => setSmsSearch(event.target.value)} placeholder="Search phone or message" />
        <button type="button" onClick={() => refreshSmsMessages()}>Search</button>
      </div>
      <AdminTable
        rows={smsMessages}
        getKey={(row) => row.id}
        emptyTitle="No SMS messages found"
        columns={[
          { key: "phone", label: "Phone", render: (row) => <AccountCell title={row.phone_number || row.from_number || row.to_number} subtitle={row.username || row.full_name || row.business_name || "Unlinked"} /> },
          { key: "direction", label: "Direction", render: (row) => <span className={badgeClass(row.direction)}>{cleanStatus(row.direction)}</span> },
          { key: "message", label: "Message", render: (row) => String(row.message || "").slice(0, 90) },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{cleanStatus(row.status)}</span> },
          { key: "date", label: "Created", render: (row) => formatDate(row.created_at) },
          { key: "actions", label: "Actions", render: (row) => <ActionCluster><button type="button" onClick={() => setDetailState({ type: "sms", item: row })}>View</button></ActionCluster> },
        ]}
      />
    </div>
  );

  const submitAnnouncement = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      setAnnouncementSending(true);
      const result = await sendAdminAnnouncement(announcementDraft);
      setMessage(result.message || `Announcement sent to ${result.recipients || 0} recipient(s).`);
      setAnnouncementDraft((prev) => ({ ...prev, title: "", body: "" }));
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not send announcement.");
    } finally {
      setAnnouncementSending(false);
    }
  };

  const renderAnnouncements = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiBell} title="Push Announcements" text="Send role-scoped Queless announcements through in-app history and Firebase Cloud Messaging." />
      <section className="admin-card-v17">
        <div className="admin-section-head-v17">
          <div>
            <strong>New announcement</strong>
            <span>Customers and providers only receive announcements for their selected audience.</span>
          </div>
        </div>
        <form className="admin-form-grid-v17" onSubmit={submitAnnouncement}>
          <label>
            <span>Audience</span>
            <select value={announcementDraft.audience} onChange={(event) => setAnnouncementDraft((prev) => ({ ...prev, audience: event.target.value }))}>
              <option value="all">All users</option>
              <option value="customers">Customers</option>
              <option value="providers">Providers</option>
              <option value="admins">Admins</option>
            </select>
          </label>
          <label>
            <span>Title</span>
            <input value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((prev) => ({ ...prev, title: event.target.value }))} maxLength={160} placeholder="Queless update" />
          </label>
          <label>
            <span>Message</span>
            <textarea value={announcementDraft.body} onChange={(event) => setAnnouncementDraft((prev) => ({ ...prev, body: event.target.value }))} maxLength={1000} rows={4} placeholder="Share an operational update, policy change, or marketplace announcement." />
          </label>
          <button type="submit" className="admin-primary-v17" disabled={announcementSending}>
            {announcementSending ? "Sending..." : "Send announcement"}
          </button>
        </form>
      </section>
    </div>
  );

  const renderAccessTesting = () => (
    <div className="admin-access-test-v16 admin-card-v17">
      <div className="admin-form-grid-v17">
        <label>
          <span>Feature to test</span>
          <select value={accessTest.feature} onChange={(event) => setAccessTest((prev) => ({ ...prev, feature: event.target.value }))}>
            {FEATURE_TEST_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Customer account</span>
          <select value={accessTest.userId} onChange={(event) => setAccessTest((prev) => ({ ...prev, userId: event.target.value }))}>
            <option value="">Choose customer</option>
            {customers.map((customer) => <option key={customer.userId} value={customer.userId}>{customer.fullName || customer.username} - {customer.plan}</option>)}
          </select>
        </label>
        <label>
          <span>Business</span>
          <select value={accessTest.businessId} onChange={(event) => setAccessTest((prev) => ({ ...prev, businessId: event.target.value }))}>
            <option value="">Choose business</option>
            {providers.map((provider) => <option key={provider.businessId} value={provider.businessId}>{provider.businessName} - {provider.plan}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className="admin-primary-v17" onClick={() => submitAccessTest()}>Run access test</button>
      {accessResult ? <TestResultCard result={accessResult} /> : null}
    </div>
  );

  const renderSmartMatch = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiZap} title="Smart Match Monitor" text="Smart Match is a Premium customer feature. Free customers are blocked by the backend and should not see it as a normal homepage feature." />
      <section className="admin-overview-grid-v13">
        <AdminStatCard label="Premium customers" value={summary.totalPremiumCustomers} icon={FiZap} tone="success" />
        <AdminStatCard label="Free customers blocked" value={summary.totalFreeCustomers} icon={FiLock} />
        <AdminStatCard label="Customers testable" value={customers.length} icon={FiUsers} />
        <AdminStatCard label="Most used source" value="API access test" icon={FiShield} />
      </section>
      {renderAccessTesting()}
    </div>
  );

  const renderAiCoach = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiStar} title="Provider Coach Monitor" text="Queless Provider Coach is rule-based. Backend access tests verify owner, Premium monthly limits, and active Platinum unlimited access." />
      <section className="admin-overview-grid-v13">
        <AdminStatCard label="Provider Coach live" value={summary.totalAiCoachProviders ?? providers.filter((row) => row.aiCoachAccess).length} icon={FiStar} tone="premium" />
        <AdminStatCard label="Blocked providers" value={providers.filter((row) => !row.aiCoachAccess).length} icon={FiLock} />
        <AdminStatCard label="Coach mode" value="rules" icon={FiActivity} />
        <AdminStatCard label="Businesses testable" value={providers.length} icon={FiBriefcase} />
      </section>
      <ChecklistCard
        title="Launch rules"
        items={[
          "Provider Coach advice is generated from app data and predefined rules, not paid AI APIs",
          "Free providers should see the Platinum upgrade path without fake answers",
          "Premium providers should receive 5 Provider Coach tips per month",
          "Platinum providers should receive unlimited Provider Coach guidance",
          "Low-data providers should receive setup guidance instead of blank reports",
          "Insight buttons should route to profile, bookings, reports, or customer follow-up work",
        ]}
      />
      <div className="admin-grid-2-v17">
        <div>
          <div className="admin-section-head-v17"><div><strong>Live Provider Coach access</strong><span>Providers currently allowed through entitlement checks</span></div></div>
          <ProviderCards rows={providers.filter((row) => row.aiCoachAccess)} onAction={handleProviderSubscriptionAction} />
        </div>
        <div>
          <div className="admin-section-head-v17"><div><strong>Locked or needs upgrade</strong><span>Providers who should see the Platinum paywall</span></div></div>
          <ProviderCards rows={providers.filter((row) => !row.aiCoachAccess)} onAction={handleProviderSubscriptionAction} />
        </div>
      </div>
      {renderAccessTesting()}
    </div>
  );

  const renderCategories = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiLayers} title="Category Management" text="View marketplace categories, provider counts, featured status, and Tutor / Lessons support." />
      <AdminTable
        rows={categoryRows}
        getKey={(row) => row.id}
        emptyTitle="No categories found"
        columns={[
          { key: "name", label: "Category", render: (row) => <AccountCell title={row.name} subtitle={row.name === "Tutor / Lessons" ? "Education icon: BookOpen" : "Marketplace category"} /> },
          { key: "providers", label: "Providers", render: (row) => row.providers },
          { key: "featured", label: "Featured", render: (row) => row.featured ? "Yes" : "No" },
          { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{row.status}</span> },
        ]}
      />
    </div>
  );

  const renderReports = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiBarChart2} title="Reports" text="Operational summaries for growth, bookings, revenue, subscriptions, categories, wallet top-ups, and MTN performance." />
      <section className="admin-grid-3-v17">
        <ReportCard title="User growth" value={overview.total_users || 0} text={`${customers.length} customers, ${providers.length} providers`} />
        <ReportCard title="Booking activity" value={bookings.length} text={`${bookingGroups.completed.length} completed bookings`} />
        <ReportCard title="Revenue summary" value={formatMoney(paymentGroups.revenueMonth || overview.total_revenue_estimate)} text="Successful payments this month or completed booking estimate" />
        <ReportCard title="Top categories" value={categoryRows.slice(0, 3).map((row) => row.name).join(", ")} text="Based on real business records" />
        <ReportCard title="Wallet top-ups" value={paymentGroups.walletTopups.length} text="Tracked through payment transactions" />
        <ReportCard title="MTN performance" value={`${paymentGroups.successfulMtn.length}/${paymentGroups.pendingMtn.length + paymentGroups.successfulMtn.length}`} text="Successful vs pending MTN transactions" />
      </section>
      <section className="admin-card-v17">
        <div className="admin-section-head-v17">
          <div><strong>Support requests</strong><span>Customer reports, disputes, safety concerns, and account help submitted through the app</span></div>
        </div>
        <AdminTable
          rows={supportRequests}
          getKey={(row) => row.id}
          emptyTitle="No support requests found"
          emptyText="Validated support and report submissions will appear here."
          columns={[
            { key: "request", label: "Request", render: (row) => <AccountCell title={`${row.topic} #${row.id}`} subtitle={`${row.username || row.name || "User"} - ${formatDate(row.created_at)}`} /> },
            { key: "contact", label: "Contact", render: (row) => row.contact || "No contact" },
            { key: "booking", label: "Booking/ref", render: (row) => row.booking_reference || "Not provided" },
            { key: "message", label: "Message", render: (row) => String(row.message || "").slice(0, 160) },
            { key: "notes", label: "Admin notes", render: (row) => row.admin_notes || "No notes yet" },
            { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.status)}>{cleanStatus(row.status)}</span> },
            {
              key: "actions",
              label: "Actions",
              render: (row) => {
                const draft = getSupportDraft(row);
                return (
                  <div className="admin-support-action-v23">
                    <select
                      value={draft.status}
                      onChange={(event) => updateSupportDraft(row.id, { status: event.target.value })}
                      aria-label={`Support request ${row.id} status`}
                    >
                      {SUPPORT_REQUEST_STATUSES.map((status) => (
                        <option key={status} value={status}>{cleanStatus(status)}</option>
                      ))}
                    </select>
                    <textarea
                      value={draft.admin_notes}
                      onChange={(event) => updateSupportDraft(row.id, { admin_notes: event.target.value })}
                      placeholder="Internal admin note"
                      maxLength={2000}
                      aria-label={`Support request ${row.id} admin notes`}
                    />
                    <button type="button" onClick={() => handleSupportRequestAction(row)}>
                      Save
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      </section>
    </div>
  );

  const renderAudit = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiDatabase} title="Admin Audit Log" text="Subscription changes, business locks, access tests, payment overrides, and other admin actions should be traceable." />
      <AdminTable
        rows={auditLog}
        getKey={(row) => row.id}
        emptyTitle="No audit records found"
        columns={[
          { key: "admin", label: "Admin", render: (row) => row.admin_username || row.admin_user_id || "Admin" },
          { key: "action", label: "Action", render: (row) => cleanStatus(row.action_type) },
          { key: "target", label: "Target", render: (row) => `${row.target_type} #${row.target_id}` },
          { key: "reason", label: "Reason", render: (row) => row.reason || "No reason" },
          { key: "date", label: "Date", render: (row) => formatDate(row.created_at) },
        ]}
      />
    </div>
  );

  const renderReviews = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiStar} title="Review Moderation" text="Audit public and hidden provider reviews without deleting customer feedback or losing moderation history." />
      <section className="admin-grid-3-v17">
        <AdminStatCard label="Total reviews" value={reviews.length} icon={FiStar} />
        <AdminStatCard label="Hidden from public" value={reviews.filter((row) => Number(row.blocked_from_public || 0) === 1).length} icon={FiLock} tone={reviews.some((row) => Number(row.blocked_from_public || 0) === 1) ? "warning" : "success"} />
        <AdminStatCard label="Visible publicly" value={reviews.filter((row) => Number(row.blocked_from_public || 0) !== 1).length} icon={FiCheckCircle} tone="success" />
      </section>
      <AdminTable
        rows={reviews}
        getKey={(row) => row.id}
        emptyTitle="No reviews found"
        emptyText="Completed booking reviews and Platinum public-review blocks will appear here."
        columns={[
          { key: "business", label: "Provider", render: (row) => <AccountCell title={row.business_name || `Business #${row.barber_id}`} subtitle={row.provider_username || `Owner #${row.owner_user_id || "unknown"}`} /> },
          { key: "reviewer", label: "Reviewer", render: (row) => row.reviewer_name || row.reviewer_username || `User #${row.user_id}` },
          { key: "rating", label: "Rating", render: (row) => `${Number(row.rating || 0).toFixed(1)} stars` },
          { key: "text", label: "Review", render: (row) => String(row.review_text || "No written comment.").slice(0, 140) },
          { key: "visibility", label: "Visibility", render: (row) => <span className={badgeClass(Number(row.blocked_from_public || 0) === 1 ? "locked" : "active")}>{Number(row.blocked_from_public || 0) === 1 ? "hidden" : "public"}</span> },
          { key: "blockedBy", label: "Blocked by", render: (row) => row.blocked_by_username || row.blocked_by_user_id || "Not blocked" },
        ]}
      />
    </div>
  );

  const readinessChecks = deploymentReadiness?.checks || [];
  const readinessDecision = deploymentReadiness?.decision || "UNKNOWN";
  const readinessTone = readinessDecision === "GO" ? "success" : "danger";
  const readinessBlockers = deploymentReadiness?.blockers || [];
  const readinessWarnings = deploymentReadiness?.warnings || [];
  const demoSuspects = deploymentReadiness?.demoBusinessSuspects || [];
  const paidFeatureSafety = deploymentReadiness?.paidFeatureSafety || {};
  const unsafeCustomerPremiumRows = paidFeatureSafety.customerUnsafeRows || [];
  const unsafeProviderPlatinumRows = paidFeatureSafety.providerUnsafeRows || [];
  const providerPublicationReadiness = deploymentReadiness?.providerPublicationReadiness || {};
  const providerPublicationSummary = providerPublicationReadiness.summary || {};
  const providerPublicationRows = providerPublicationReadiness.businesses || [];

  const formatCustomerRemediation = (row) => {
    const next = row.remediation?.nextValues || {};
    return `${row.remediation?.target || `customer_subscriptions#${row.id}`} -> status ${cleanStatus(next.status)}, payment ${cleanStatus(next.payment_status)}`;
  };

  const formatProviderRemediation = (row) => {
    const next = row.remediation?.nextValues || {};
    const business = next.business || {};
    const latest = next.latestSubscription || null;
    const businessChange = `${row.remediation?.target || `barbers#${row.id}`} -> status ${cleanStatus(business.subscription_status)}, published ${Number(business.is_published || 0)}`;
    const latestChange = latest
      ? `${row.remediation?.latestSubscriptionTarget || `barber_subscriptions#${row.latest_subscription_id}`} -> status ${cleanStatus(latest.status)}, payment ${cleanStatus(latest.payment_status)}, active ${Number(latest.is_active || 0)}`
      : "No subscription row to deactivate";
    return `${businessChange}; ${latestChange}`;
  };

  const renderReadinessActions = (row) => {
    const actions = [];
    const incomplete = hasBlocker(row, "missing_required_business_fields") || hasBlocker(row, "missing_services_or_category");
    const launchUnsafe = incomplete || hasBlocker(row, "demo_or_test_like_business") || hasBlocker(row, "soft_deleted");

    if (hasBlocker(row, "demo_or_test_like_business")) {
      actions.push(["soft_disable_demo_business", "Soft-disable", FiDatabase]);
    }
    if (incomplete && !hasBlocker(row, "soft_deleted")) {
      actions.push(["hold_incomplete_provider", "Hold", FiLock]);
    }
    if (!launchUnsafe && (hasBlocker(row, "missing_or_invalid_plan") || hasBlocker(row, "missing_subscription_trial_or_admin_approval"))) {
      actions.push(["start_provider_trial", "Trial", FiClock]);
      if (!row.adminApproved) actions.push(["admin_approve_provider", "Approve", FiShield]);
    }
    if (!launchUnsafe && (hasBlocker(row, "not_published") || hasBlocker(row, "inactive_or_non_public_status")) && !hasBlocker(row, "missing_or_invalid_plan") && !hasBlocker(row, "missing_subscription_trial_or_admin_approval")) {
      actions.push(["publish_provider", "Publish", FiCheckCircle]);
    }

    if (!actions.length) return row.publicVisible ? "Ready" : "Review";

    return (
      <div className="admin-remediation-actions-v21">
        {actions.map(([id, label, Icon]) => (
          <button type="button" key={`${row.id}-${id}`} onClick={() => handleReadinessRemediation(row, id)} title={label}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderSettings = () => (
    <div className="admin-view-v17">
      <PageIntro icon={FiSettings} title="Deployment Readiness" text="Live launch gate for queless.org payments, paid features, route protection, same-domain config, and production data safety." />
      <section className="admin-grid-3-v17">
        <AdminStatCard label="Launch decision" value={readinessDecision.replace("_", " ")} icon={readinessDecision === "GO" ? FiCheckCircle : FiAlertTriangle} tone={readinessTone} />
        <AdminStatCard label="Blocking checks" value={readinessBlockers.length ?? "?"} icon={FiShield} tone={readinessBlockers.length ? "danger" : "success"} />
        <AdminStatCard label="Demo suspects" value={demoSuspects.length} icon={FiDatabase} tone={demoSuspects.length ? "warning" : "success"} />
      </section>
      <section className="admin-card-v17 admin-launch-gate-v21">
        <header>
          <div>
            <span>Go/no-go blockers</span>
            <strong>{readinessBlockers.length ? `${readinessBlockers.length} blocker(s) must be fixed` : "No blockers found"}</strong>
          </div>
          <small>{deploymentReadiness?.generatedAt ? `Checked ${formatDate(deploymentReadiness.generatedAt)}` : "Not checked yet"}</small>
        </header>
        <div className="admin-launch-checks-v21">
          {readinessBlockers.length ? readinessBlockers.map((check) => (
            <article key={`blocker-${check.key}`} className="admin-launch-check-v21 blocker">
              <span><FiAlertTriangle /></span>
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
                {check.action ? <em>{check.action}</em> : null}
              </div>
            </article>
          )) : (
            <article className="admin-launch-check-v21 ok">
              <span><FiCheckCircle /></span>
              <div>
                <strong>Ready to launch</strong>
                <small>Environment, MTN, paid-feature safety, CORS, callbacks, and public data checks are passing.</small>
              </div>
            </article>
          )}
        </div>
      </section>
      <section className="admin-card-v17 admin-launch-gate-v21">
        <header>
          <div>
            <span>Production target</span>
            <strong>queless.org</strong>
          </div>
          <button type="button" className="admin-primary-v17" onClick={loadAdminData}>
            <FiRefreshCw /> Refresh gate
          </button>
        </header>
        <div className="admin-launch-checks-v21">
          {readinessChecks.length ? readinessChecks.map((check) => (
            <article key={check.key} className={`admin-launch-check-v21 ${check.ok ? "ok" : check.severity || "warning"}`}>
              <span>{check.ok ? <FiCheckCircle /> : <FiAlertTriangle />}</span>
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
                {!check.ok && check.action ? <em>{check.action}</em> : null}
              </div>
            </article>
          )) : <AdminEmptyState title="Readiness gate unavailable" text="The admin readiness endpoint did not return checks." />}
        </div>
      </section>
      <section className="admin-card-v17 admin-launch-gate-v21">
        <header>
          <div>
            <span>Provider publication readiness</span>
            <strong>{providerPublicationSummary.publicBusinesses || 0} public / {providerPublicationSummary.totalBusinesses || 0} total</strong>
          </div>
        </header>
        <div className="admin-grid-3-v17">
          <AdminStatCard label="Hidden businesses" value={providerPublicationSummary.hiddenBusinesses || 0} icon={FiBriefcase} tone={providerPublicationSummary.hiddenBusinesses ? "warning" : "success"} />
          <AdminStatCard label="Unpublished" value={providerPublicationSummary.unpublishedBusinesses || 0} icon={FiLock} tone={providerPublicationSummary.unpublishedBusinesses ? "warning" : "success"} />
          <AdminStatCard label="Inactive" value={providerPublicationSummary.inactiveBusinesses || 0} icon={FiClock} tone={providerPublicationSummary.inactiveBusinesses ? "warning" : "success"} />
          <AdminStatCard label="Plan/subscription blocked" value={providerPublicationSummary.blockedByMissingSubscriptionOrPlan || 0} icon={FiCreditCard} tone={providerPublicationSummary.blockedByMissingSubscriptionOrPlan ? "danger" : "success"} />
          <AdminStatCard label="Approval blocked" value={providerPublicationSummary.blockedByMissingApproval || 0} icon={FiShield} tone={providerPublicationSummary.blockedByMissingApproval ? "warning" : "success"} />
          <AdminStatCard label="Missing services/categories" value={providerPublicationSummary.missingServicesOrCategories || 0} icon={FiLayers} tone={providerPublicationSummary.missingServicesOrCategories ? "warning" : "success"} />
        </div>
        <AdminTable
          rows={providerPublicationRows.slice(0, 12)}
          getKey={(row) => row.id}
          emptyTitle="No provider readiness rows"
          emptyText="The provider publication audit did not return business rows."
          columns={[
            { key: "business", label: "Business", render: (row) => <AccountCell title={row.businessName} subtitle={row.ownerUsername || `Owner #${row.ownerUserId || "unknown"}`} /> },
            { key: "public", label: "Public", render: (row) => <span className={badgeClass(row.publicVisible ? "active" : "inactive")}>{row.publicVisible ? "public" : "hidden"}</span> },
            { key: "status", label: "Status", render: (row) => `${cleanStatus(row.businessStatus)} / ${row.isPublished ? "published" : "unpublished"}` },
            { key: "plan", label: "Plan", render: (row) => `${planLabel(row.plan)} / ${cleanStatus(row.subscriptionStatus)}` },
            { key: "services", label: "Services", render: (row) => row.serviceCount || 0 },
            { key: "blockers", label: "Blockers", render: (row) => (row.blockers || []).map(cleanStatus).join(", ") || "None" },
            { key: "actions", label: "Fix", render: renderReadinessActions },
          ]}
        />
      </section>
      <section className="admin-grid-2-v17">
        <div className="admin-card-v17">
          <header>
            <div>
              <span>Customer paid-feature safety</span>
              <strong>{unsafeCustomerPremiumRows.length ? `${unsafeCustomerPremiumRows.length} unsafe row(s)` : "Premium rows are safe"}</strong>
            </div>
          </header>
          {unsafeCustomerPremiumRows.length ? (
            <p className="admin-remediation-note-v23">
              These rows currently look like Premium but fail the paid Smart Match guard. Remediation will set each row to pending or expired exactly as shown.
            </p>
          ) : null}
          <AdminTable
            rows={unsafeCustomerPremiumRows}
            getKey={(row) => row.id}
            emptyTitle="No unsafe Customer Premium rows"
            emptyText="Smart Match only unlocks for active, paid, unexpired Premium subscriptions."
            columns={[
              { key: "user", label: "User", render: (row) => `User #${row.user_id}` },
              { key: "status", label: "Status", render: (row) => `${cleanStatus(row.status)} / ${cleanStatus(row.payment_status)}` },
              { key: "expires", label: "Expires", render: (row) => formatDate(row.expires_at) },
              { key: "reason", label: "Why unsafe", render: (row) => (row.unsafeReasons || []).join(" ") },
              { key: "remediation", label: "Will change", render: formatCustomerRemediation },
            ]}
          />
        </div>
        <div className="admin-card-v17">
          <header>
            <div>
              <span>Provider paid-feature safety</span>
              <strong>{unsafeProviderPlatinumRows.length ? `${unsafeProviderPlatinumRows.length} unsafe row(s)` : "Platinum rows are safe"}</strong>
            </div>
          </header>
          {unsafeProviderPlatinumRows.length ? (
            <p className="admin-remediation-note-v23">
              These rows can expose Platinum fallback state without a current valid Platinum subscription. Remediation will deactivate the invalid subscription and expire/unpublish the fallback access shown here.
            </p>
          ) : null}
          <AdminTable
            rows={unsafeProviderPlatinumRows}
            getKey={(row) => row.id}
            emptyTitle="No unsafe Provider Platinum rows"
            emptyText="Provider Coach unlocks limited tips for Premium and unlimited guidance for Platinum."
            columns={[
              { key: "business", label: "Business", render: (row) => row.business_name || `Business #${row.id}` },
              { key: "businessStatus", label: "Business status", render: (row) => `${cleanStatus(row.subscription_tier)} / ${cleanStatus(row.subscription_status)}` },
              { key: "latest", label: "Latest subscription", render: (row) => row.latest_subscription_id ? `${cleanStatus(row.latest_tier)} / ${cleanStatus(row.latest_status)}` : "Missing" },
              { key: "reason", label: "Why unsafe", render: (row) => (row.unsafeReasons || []).join(" ") },
              { key: "remediation", label: "Will change", render: formatProviderRemediation },
            ]}
          />
        </div>
      </section>
      <section className="admin-card-v17 admin-launch-gate-v21">
        <header>
          <div>
            <span>Paid-feature entitlement remediation</span>
            <strong>{unsafeCustomerPremiumRows.length + unsafeProviderPlatinumRows.length ? `${unsafeCustomerPremiumRows.length + unsafeProviderPlatinumRows.length} row(s) require cleanup` : "No cleanup needed"}</strong>
          </div>
          <button
            type="button"
            className="admin-primary-v17"
            onClick={handlePaidFeatureRemediation}
            disabled={!unsafeCustomerPremiumRows.length && !unsafeProviderPlatinumRows.length}
          >
            <FiShield /> Remediate entitlements
          </button>
        </header>
        <div className="admin-launch-checks-v21">
          <article className="admin-launch-check-v21 warning">
            <span><FiLock /></span>
            <div>
              <strong>Cleanup only removes unsafe access</strong>
              <small>Customer Premium rows become pending/expired; Provider paid rows are deactivated or expired/unpublished. The Smart Match and Provider Coach backend guards continue to require paid, unexpired entitlements.</small>
            </div>
          </article>
          <article className="admin-launch-check-v21 ok">
            <span><FiDatabase /></span>
            <div>
              <strong>Audit log is retained</strong>
              <small>The backend writes a paid_feature_entitlement_cleanup admin audit entry with before/after row snapshots, then refreshes deployment readiness.</small>
            </div>
          </article>
        </div>
      </section>
      <section className="admin-card-v17 admin-launch-gate-v21">
        <header>
          <div>
            <span>Demo/test cleanup</span>
            <strong>{demoSuspects.length ? `${demoSuspects.length} review item(s)` : "No suspects found"}</strong>
          </div>
          <button type="button" className="admin-primary-v17" onClick={handleDemoCleanup} disabled={!demoSuspects.length}>
            <FiDatabase /> Soft-disable suspects
          </button>
        </header>
        <AdminTable
          rows={demoSuspects.slice(0, 20)}
          getKey={(row) => row.id}
          emptyTitle="No demo/test businesses found"
          emptyText="The launch gate did not find records matching demo, sample, fake, test, QA, placeholder, or is_demo patterns."
          columns={[
            { key: "business", label: "Business", render: (row) => <AccountCell title={row.businessName} subtitle={row.ownerUsername || `Owner #${row.ownerUserId || "unknown"}`} /> },
            { key: "reason", label: "Reason", render: (row) => (row.reasons || []).join(", ") || "Suspect record" },
            { key: "status", label: "Status", render: (row) => <span className={badgeClass(row.published ? "published" : row.status)}>{row.published ? "published" : cleanStatus(row.status)}</span> },
            {
              key: "actions",
              label: "Fix",
              render: (row) => (
                <div className="admin-remediation-actions-v21">
                  <button
                    type="button"
                    onClick={() => handleReadinessRemediation({ id: row.id, businessName: row.businessName, blockers: ["demo_or_test_like_business"] }, "soft_disable_demo_business")}
                    title="Soft-disable"
                  >
                    <FiDatabase />
                    <span>Soft-disable</span>
                  </button>
                </div>
              ),
            },
          ]}
        />
      </section>
      {readinessWarnings.length ? (
        <section className="admin-card-v17 admin-launch-gate-v21">
          <header>
            <div>
              <span>Warnings</span>
              <strong>{readinessWarnings.length} item(s) to review</strong>
            </div>
          </header>
          <div className="admin-launch-checks-v21">
            {readinessWarnings.map((check) => (
              <article key={`warning-${check.key}`} className="admin-launch-check-v21 warning">
                <span><FiAlertTriangle /></span>
                <div>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                  {check.action ? <em>{check.action}</em> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="admin-grid-2-v17">
        <ChecklistCard title="Paid feature rules" items={["Customer Premium = Smart Match", "Provider Premium = limited Provider Coach", "Provider Platinum = unlimited Provider Coach", "Backend route checks are required", "Manual search and normal booking stay free"]} />
        <ChecklistCard title="Payment rules" items={["Do not fake MTN success", "Wallet credits after confirmed success only", "Subscription activation needs payment or audited admin override", "Cash remains available for normal bookings"]} />
        <ChecklistCard title="Admin security" items={["Admin APIs require auth and admin role", "Write actions use confirmation modals", "Subscription writes are audited", "Normal users cannot access admin panel"]} />
        <ChecklistCard title="Data safety" items={["No fake providers in admin tables", "Categories are counted from real businesses", "Payments show real backend rows", "Wallet page separates customer and provider wallets"]} />
      </section>
    </div>
  );

  const renderActiveSection = () => {
    if (loading) return <AdminLoading />;
    if (activeSection === "overview") return renderOverview();
    if (activeSection === "users") {
      return (
        <UsersPanel
          rows={filteredUsers}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          subscriptionFilter={subscriptionFilter}
          setSubscriptionFilter={setSubscriptionFilter}
          onSelect={(row) => setDetailState({ type: "user", item: row })}
          onCustomerAction={handleCustomerSubscriptionAction}
          onTest={(row) => submitAccessTest({ feature: "smart_match", userId: row.id, businessId: "" })}
        />
      );
    }
    if (activeSection === "customers") return renderCustomers();
    if (activeSection === "providers") return renderProviders();
    if (activeSection === "businesses") return renderBusinesses();
    if (activeSection === "bookings") return renderBookings();
    if (activeSection === "reviews") return renderReviews();
    if (activeSection === "subscriptions") return renderSubscriptions();
    if (activeSection === "payments") return renderPayments();
    if (activeSection === "mtn") return renderMtnMonitor();
    if (activeSection === "wallets") return renderWallets();
    if (activeSection === "sms") return renderSms();
    if (activeSection === "notifications") return renderAnnouncements();
    if (activeSection === "smartMatch") return renderSmartMatch();
    if (activeSection === "aiCoach") return renderAiCoach();
    if (activeSection === "categories") return renderCategories();
    if (activeSection === "reports") return renderReports();
    if (activeSection === "audit") return renderAudit();
    if (activeSection === "settings") return renderSettings();
    return renderOverview();
  };

  if (!isAdmin) {
    return (
      <div className="content-v4 app-page-v4 admin-page-v13 admin-page-v17">
        <section className="admin-locked-v13 admin-card-v17">
          <FiLock />
          <h2>Admin access only</h2>
          <p>You do not have permission to access this area.</p>
          <button type="button" className="admin-primary-v17" onClick={onBackToApp}>Back to app</button>
        </section>
      </div>
    );
  }

  return (
    <div className="content-v4 app-page-v4 admin-page-v13 admin-page-v17">
      <div className="admin-shell-v17">
        {renderSidebar()}
        {mobileMenuOpen ? <div className="admin-sidebar-scrim-v17" onClick={() => setMobileMenuOpen(false)} role="presentation" /> : null}
        <main className="admin-main-v17">
          {renderTopbar()}
          {message ? <div className={messageTone === "error" ? "auth-error" : "auth-success"}>{message}</div> : null}
          {renderActiveSection()}
        </main>
        <nav className="admin-mobile-taskbar-v19" aria-label="Admin quick navigation">
          {[
            ["overview", "Home", FiHome],
            ["subscriptions", "Plans", FiShield],
            ["payments", "Pay", FiCreditCard],
            ["settings", "Checks", FiSettings],
          ].map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              className={activeSection === id ? "active" : ""}
              onClick={() => {
                setActiveSection(id);
                setMobileMenuOpen(false);
              }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <DetailPanel
        detailState={detailState}
        onClose={() => setDetailState(null)}
        onCustomerAction={handleCustomerSubscriptionAction}
        onProviderAction={handleProviderSubscriptionAction}
        onTest={submitAccessTest}
      />
      <ConfirmModal confirmState={confirmState} onCancel={() => setConfirmState(null)} />
    </div>
  );
}

function PageIntro({ icon: Icon, title, text }) {
  return (
    <section className="admin-page-intro-v17">
      <span><Icon /></span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}

function AccountCell({ title, subtitle }) {
  return (
    <span className="admin-account-cell-v17">
      <strong>{title || "Unknown"}</strong>
      <small>{subtitle || "No details"}</small>
    </span>
  );
}

function ActionCluster({ children }) {
  return <span className="admin-action-cluster-v17">{children}</span>;
}

function AdminLoading() {
  return (
    <div className="admin-view-v17">
      <div className="admin-loading-v17"><FiRefreshCw /> Loading admin control center...</div>
    </div>
  );
}

function ProviderCards({ rows, onAction }) {
  if (!rows.length) return <AdminEmptyState icon={FiBriefcase} title="No providers in this state" text="Change filters or check provider subscriptions." />;
  return (
    <div className="admin-card-list-v17">
      {rows.map((row) => (
        <article className="admin-card-v17" key={row.businessId}>
          <div className="admin-section-head-v17">
            <div><strong>{row.businessName}</strong><span>{row.providerName} - {planLabel(row.plan)} - {row.status}</span></div>
            <span className={badgeClass(row.aiCoachAccess ? "platinum" : row.plan)}>{row.aiCoachAccess ? "AI on" : planLabel(row.plan)}</span>
          </div>
          <div className="admin-actions-v13">
            <button type="button" onClick={() => onAction(row, { action: "set_trial" })}>Set trial</button>
            <button type="button" onClick={() => onAction(row, { action: "set_plan", plan: "PLATINUM" })}>Set Platinum</button>
            <button type="button" onClick={() => onAction(row, { action: "expire" })}>Expire</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ExpiredPanel({ customers, providers }) {
  return (
    <div className="admin-grid-2-v17">
      <div className="admin-card-v17">
        <div className="admin-section-head-v17"><div><strong>Expired customers</strong><span>Premium customers who lost Smart Match</span></div></div>
        {customers.length ? customers.map((row) => <div className="admin-feed-row-v17" key={row.userId}><FiUser /><div><strong>{row.fullName || row.username}</strong><span>{formatDate(row.expiresAt)}</span></div></div>) : <AdminEmptyState title="No expired customers" />}
      </div>
      <div className="admin-card-v17">
        <div className="admin-section-head-v17"><div><strong>Expired providers</strong><span>Providers whose Provider Coach should be locked</span></div></div>
        {providers.length ? providers.map((row) => <div className="admin-feed-row-v17" key={row.businessId}><FiBriefcase /><div><strong>{row.businessName}</strong><span>{formatDate(row.expiresAt)}</span></div></div>) : <AdminEmptyState title="No expired providers" />}
      </div>
    </div>
  );
}

function PaymentCards({ rows }) {
  if (!rows.length) return <AdminEmptyState icon={FiCreditCard} title="No payments in this state" />;
  return (
    <div className="admin-card-list-v17">
      {rows.slice(0, 80).map((payment) => (
        <article className="admin-card-v17" key={payment.id}>
          <div className="admin-section-head-v17">
            <div><strong>{payment.internal_reference || payment.transaction_type}</strong><span>{payment.username || payment.full_name || payment.business_name || "Unknown"} - {formatMoney(payment.gross_amount)}</span></div>
            <span className={badgeClass(payment.status)}>{cleanStatus(payment.status)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function UsersPanel({ rows, roleFilter, setRoleFilter, subscriptionFilter, setSubscriptionFilter, onSelect, onCustomerAction, onTest }) {
  return (
    <div className="admin-view-v17">
      <PageIntro icon={FiUsers} title="Users" text="Search, filter, inspect, and safely test customer, provider, and admin accounts without exposing password data." />
      <FilterBar>
        {USER_ROLE_FILTERS.map((filter) => (
          <button type="button" key={filter} className={roleFilter === filter ? "active" : ""} onClick={() => setRoleFilter(filter)}>{filter}</button>
        ))}
        {SUBSCRIPTION_FILTERS.map((filter) => (
          <button type="button" key={filter} className={subscriptionFilter === filter ? "active" : ""} onClick={() => setSubscriptionFilter(filter)}>{filter}</button>
        ))}
      </FilterBar>
      <AdminTable
        rows={rows}
        getKey={(row) => row.id}
        emptyTitle="No users found"
        columns={[
          { key: "name", label: "Name", render: (row) => <AccountCell title={row.fullName || row.name || row.username} subtitle={row.email || row.phone || row.contact || "No contact"} /> },
          { key: "role", label: "Role", render: (row) => <span className={badgeClass(row.role)}>{row.role}</span> },
          { key: "plan", label: "Plan", render: (row) => <span className={badgeClass(row.subscriptionTier || row.plan)}>{planLabel(row.subscriptionTier || row.plan)}</span> },
          { key: "access", label: "Feature access", render: (row) => <FeatureAccessSummary user={row} /> },
          { key: "wallet", label: "Wallet", render: (row) => formatMoney(row.walletBalance) },
          { key: "status", label: "Status", render: (row) => cleanStatus(row.accountStatus || row.subscriptionStatus) },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <ActionCluster>
                <button type="button" onClick={() => onSelect(row)}>Details</button>
                {String(row.role).toLowerCase() === "customer" ? <button type="button" onClick={() => onTest(row)}>Test</button> : null}
                {String(row.role).toLowerCase() === "customer" ? <button type="button" onClick={() => onCustomerAction({ ...row, userId: row.userId || row.id }, { action: "downgrade" })}>Reset free</button> : null}
              </ActionCluster>
            ),
          },
        ]}
      />
    </div>
  );
}

function FilterBar({ children }) {
  return <div className="admin-filter-row-v13 admin-filter-bar-v20"><FiFilter />{children}</div>;
}

function FeatureAccessSummary({ user }) {
  return (
    <span className="admin-feature-pills-v20">
      <span className={badgeClass(user.smartMatchAccess ? "successful" : "locked")}>Smart {user.smartMatchAccess ? "on" : "locked"}</span>
      <span className={badgeClass(user.aiCoachAccess ? "platinum" : "locked")}>Coach {user.aiCoachAccess ? "on" : "locked"}</span>
    </span>
  );
}

function AccessCell({ allowed }) {
  return <span className={badgeClass(allowed ? "successful" : "locked")}>{allowed ? "Allowed" : "Locked"}</span>;
}

function FeatureMatrix({ rows }) {
  return (
    <div className="admin-matrix-wrap-v20">
      <table className="admin-table-v17 admin-matrix-v20">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Free Customer</th>
            <th>Premium Customer</th>
            <th>Free Provider</th>
            <th>Premium Provider</th>
            <th>Platinum Provider</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || row.label}>
              <td>{row.label}</td>
              <td><AccessCell allowed={row.freeCustomer} /></td>
              <td><AccessCell allowed={row.premiumCustomer} /></td>
              <td><AccessCell allowed={row.proProvider} /></td>
              <td><AccessCell allowed={row.premiumProvider} /></td>
              <td><AccessCell allowed={row.platinumProvider} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TestResultCard({ result }) {
  const pass = String(result.status || "").toUpperCase() === "PASS";
  const subject = result.selectedSubject || {};
  return (
    <div className={`admin-test-result-v20 ${pass ? "pass" : "fail"}`}>
      <div className="admin-section-head-v17">
        <div>
          <strong>{pass ? "PASS" : "FAIL"}: {result.featureTested}</strong>
          <span>{subject.name || result.selectedAccount || result.selectedBusiness || "Selected account"} - {formatDate(result.timestamp)}</span>
        </div>
        <span className={badgeClass(pass ? "successful" : "failed")}>{result.actualApiResult || "n/a"}</span>
      </div>
      <div className="admin-result-grid-v20">
        <span>Expected <b>{result.expectedAccess}</b></span>
        <span>Actual <b>{result.actualAccess || result.expectedAccess}</b></span>
        <span>Decision <b>{result.permissionDecision || "checked"}</b></span>
        <span>Tier <b>{planLabel(subject.tier || result.providerPlan || result.plan || "n/a")}</b></span>
      </div>
      <p>{result.reason || (pass ? "Access behavior matched the expected entitlement." : "The entitlement result did not match expectations.")}</p>
      {result.suggestedFix ? <p className="admin-fix-v20">{result.suggestedFix}</p> : null}
      <details className="admin-dev-details-v20">
        <summary>Developer details</summary>
        <pre>{JSON.stringify(result.developerDetails || result, null, 2)}</pre>
      </details>
    </div>
  );
}

function DetailPanel({ detailState, onClose, onCustomerAction, onProviderAction, onTest }) {
  if (!detailState) return null;
  const item = detailState.item || {};
  const title =
    item.fullName ||
    item.business_name ||
    item.businessName ||
    item.internal_reference ||
    item.phone_number ||
    item.service_name ||
    item.username ||
    `Record #${item.id || ""}`;
  const isUser = detailState.type === "user";
  const isBusiness = detailState.type === "business";
  const isPayment = detailState.type === "payment";
  const isSms = detailState.type === "sms";
  const isBooking = detailState.type === "booking";
  return (
    <div className="admin-detail-backdrop-v20" role="presentation" onClick={onClose}>
      <section className="admin-detail-panel-v20" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{cleanStatus(detailState.type)} detail</span>
            <strong>{title}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details"><FiX /></button>
        </header>
        <div className="admin-detail-grid-v20">
          {Object.entries({
            Role: item.role,
            "Subscription tier": planLabel(item.subscriptionTier || item.current_plan || item.plan),
            Status: item.accountStatus || item.subscriptionStatus || item.status || item.businessStatus || item.verification_status,
            "Verification document": item.verification_document_name,
            "Verification notes": item.verification_notes,
            "Verification submitted": item.verification_submitted_at ? formatDate(item.verification_submitted_at) : undefined,
            "Verification reviewed": item.verification_reviewed_at ? formatDate(item.verification_reviewed_at) : undefined,
            "Payment status": item.paymentStatus || item.lastPaymentStatus || item.payment_status,
            "Smart Match": item.smartMatchAccess === undefined ? undefined : item.smartMatchAccess ? "Yes" : "No",
            "Provider Coach": item.aiCoachAccess === undefined ? undefined : item.aiCoachAccess ? "Yes" : "No",
            Wallet: item.walletBalance !== undefined ? formatMoney(item.walletBalance) : item.walletAvailable !== undefined ? formatMoney(item.walletAvailable) : undefined,
            Bookings: item.bookingCount || item.booking_count,
            Phone: item.phone || item.payer_phone,
            "SMS from": item.from_number,
            "SMS to": item.to_number,
            Direction: item.direction,
            Email: item.email,
            Location: item.location || item.booking_address,
            "Created date": formatDate(item.createdAt || item.created_at),
            "Updated date": formatDate(item.updated_at),
          }).filter(([, value]) => value !== undefined && value !== "").map(([label, value]) => (
            <span key={label}><small>{label}</small><b>{value}</b></span>
          ))}
        </div>
        {isUser ? (
          <div className="admin-actions-v13">
            {String(item.role).toLowerCase() === "customer" ? <button type="button" onClick={() => onCustomerAction({ ...item, userId: item.userId || item.id }, { action: "upgrade" })}>Set Premium</button> : null}
            {String(item.role).toLowerCase() === "customer" ? <button type="button" onClick={() => onCustomerAction({ ...item, userId: item.userId || item.id }, { action: "downgrade" })}>Reset Free</button> : null}
            {String(item.role).toLowerCase() === "customer" ? <button type="button" onClick={() => onTest({ feature: "smart_match", userId: item.userId || item.id })}>Test Smart Match</button> : null}
          </div>
        ) : null}
        {isBusiness ? (
          <div className="admin-actions-v13">
            {PROVIDER_PLANS.map((plan) => <button type="button" key={plan} onClick={() => onProviderAction({ ...item, businessId: item.businessId || item.id, businessName: item.businessName || item.business_name }, { action: "set_plan", plan })}>{planLabel(plan)}</button>)}
            <button type="button" onClick={() => onTest({ feature: "ai_coach", businessId: item.businessId || item.id })}>Test Provider Coach</button>
          </div>
        ) : null}
        {isPayment || isSms ? (
          <details className="admin-dev-details-v20" open>
            <summary>{isSms ? "SMS record" : "Callback / payment record"}</summary>
            <pre>{JSON.stringify(item, null, 2)}</pre>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function ReportCard({ title, value, text }) {
  return (
    <article className="admin-card-v17 admin-report-card-v17">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{text}</small>
    </article>
  );
}

function ChecklistCard({ title, items }) {
  return (
    <article className="admin-card-v17 admin-checklist-v17">
      <strong>{title}</strong>
      {items.map((item) => <span key={item}><FiCheckCircle /> {item}</span>)}
    </article>
  );
}
