import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";
import "./App.css";
import logo from "./assets/queless-logo-icon.png";
import fallbackStandIcon from "./assets/queless-logo-icon.png";
import { confirmPasswordReset, loginUser, registerUser, requestPasswordReset, updateAccount } from "./api/authApi.js";
import { deleteMyBarberStand, getBarbers, getMyBarberStand, registerBarberStand, updateMyBarberStand } from "./api/barbersApi.js";
import {
  confirmCashPaymentRequest,
  createBookingRequest,
  getMyBookings,
  updateBookingStatusRequest,
  verifyBookingPaymentRequest,
} from "./api/bookingsApi.js";
import { createMessage, getMessages } from "./api/chatApi.js";
import { addFavorite, getFavorites as getFavoriteRows, removeFavorite } from "./api/favoritesApi.js";
import { getNotifications, markNotificationReadRequest } from "./api/notificationsApi.js";
import { getProfile, saveProfileRequest } from "./api/profilesApi.js";
import { createReview, deleteReview, getBarberReviews, getMyReviews, updateReview } from "./api/reviewsApi.js";
import { getGeolocationErrorMessage, reverseGeocodeCoordinates } from "./utils/locationUtils.js";
import { getMySubscription, startSubscriptionUpgrade, verifySubscriptionUpgrade } from "./api/subscriptionsApi.js";
import { getMyWallet, requestWalletWithdrawal } from "./api/walletApi.js";
import AppHeader from "./components/ui/AppHeader.jsx";
import AccountMenu from "./components/ui/AccountMenu.jsx";
import BottomNav from "./components/ui/BottomNav.jsx";
import MarketplaceMapOverlay from "./components/marketplace/MarketplaceMapOverlay.jsx";
import { getAuthToken, SOCKET_URL } from "./config/api.js";
import useAutoScrollToBottom from "./hooks/useAutoScrollToBottom.js";
import useAvailableTimeSlots from "./hooks/useAvailableTimeSlots.js";
import useBookingAvailability from "./hooks/useBookingAvailability.js";
import useReviewedBookings from "./hooks/useReviewedBookings.js";
import useTheme from "./hooks/useTheme.js";
import {
  barberMatchesBooking,
  dateValueToDate,
  getBookingCooldownInfo,
  getBookingsForCalendar,
} from "./utils/bookingRules.js";
import {
  PHONE_COUNTRIES,
  buildPhoneNumber,
  isValidPhoneNumber,
  sanitizeDigits,
  splitPhoneNumber,
} from "./utils/profileUtils.js";
import { appendStored, readStored, writeStored } from "./utils/storage.js";
import {
  DEFAULT_SERVICE_TYPES,
  getAvailableServices,
  normalizeServiceForBooking,
  serviceMatchesCategory,
} from "./utils/serviceCatalog.js";
import { isBookingPaymentMethodEnabled, isOnlinePaymentMethod } from "./utils/paymentLabels.js";

const BarberProfileSheet = lazy(() => import("./features/barbers/BarberProfileSheet.jsx"));
const AuthScreen = lazy(() => import("./features/auth/AuthScreen.jsx"));
const HomeScreen = lazy(() => import("./pages/HomePage.jsx"));
const CategoriesScreen = lazy(() => import("./pages/CategoriesPage.jsx"));
const CategoryServicesScreen = lazy(() => import("./pages/CategoryServicesPage.jsx"));
const SearchResultsScreen = lazy(() => import("./pages/SearchResultsPage.jsx"));
const InboxScreen = lazy(() => import("./pages/InboxPage.jsx"));
const BookingsScreen = lazy(() => import("./pages/BookingsPage.jsx"));
const ProfileScreen = lazy(() => import("./pages/ProfilePage.jsx"));
const DashboardScreen = lazy(() => import("./pages/DashboardPage.jsx"));
const SettingsScreen = lazy(() => import("./pages/SettingsPage.jsx"));
const AdminPanel = lazy(() => import("./pages/AdminPanel.jsx"));
const BookingModal = lazy(() => import("./features/bookings/BookingModal.jsx"));
const BookingConfirmationScreen = lazy(() => import("./features/bookings/BookingConfirmationScreen.jsx"));
const QuoteRequestModal = lazy(() => import("./features/bookings/QuoteRequestModal.jsx"));
const ChatSheet = lazy(() => import("./features/chat/ChatSheet.jsx"));
const ReportsScreen = lazy(() => import("./features/barbers/ReportsScreen.jsx"));
const TrialUpgradeScreen = lazy(() => import("./features/barbers/TrialUpgradeScreen.jsx"));
const NotificationSheet = lazy(() =>
  import("./features/notifications/Notifications.jsx").then((module) => ({ default: module.NotificationSheet }))
);
const NotificationToast = lazy(() =>
  import("./features/notifications/Notifications.jsx").then((module) => ({ default: module.NotificationToast }))
);
const RegisterBarberModal = lazy(() =>
  import("./features/barbers/BarberStandModals.jsx").then((module) => ({ default: module.RegisterBarberModal }))
);
const EditBarberModal = lazy(() =>
  import("./features/barbers/BarberStandModals.jsx").then((module) => ({ default: module.EditBarberModal }))
);

function upsertById(list = [], item) {
  const index = list.findIndex((entry) => String(entry?.id) === String(item?.id));
  if (index === -1) return [item, ...list];
  const next = [...list];
  next[index] = { ...next[index], ...item };
  return next;
}

function uniqueById(list = []) {
  const seen = new Set();
  return list.filter((item) => {
    const key = String(item?.id ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeByNewest(existing = [], incoming = []) {
  return uniqueById([...(incoming || []), ...(existing || [])]).sort(
    (a, b) => new Date(b?.createdAt || b?.created_at || 0) - new Date(a?.createdAt || a?.created_at || 0)
  );
}


function mergeNotificationsPreservingRead(existing = [], incoming = []) {
  const existingMap = new Map((existing || []).map((item) => [String(item?.id || ""), item]));
  return uniqueById(
    [...(incoming || []), ...(existing || [])].map((item) => {
      const previous = existingMap.get(String(item?.id || ""));
      const merged = previous ? { ...previous, ...item } : item;
      return previous?.read ? { ...merged, read: true } : merged;
    })
  ).sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
}

function getNotificationKeysForUser(username, barbersList = []) {
  if (!username) return [];
  const keys = [username];
  const ownedBarber = (barbersList || []).find(
    (item) => String(item?.ownerUsername || item?.username || "") === String(username)
  );
  if (ownedBarber?.id) keys.push(`barber-${ownedBarber.id}`);
  return [...new Set(keys)];
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function getStoredUsers() {
  return readStored("users", "auth", []);
}

function saveStoredUsers(users) {
  return writeStored("users", "auth", users);
}

function getStoredBarbers() {
  const saved = readStored("barbers", "global", []);
  return Array.isArray(saved) && saved.length ? saved.map(normalizeBarber) : [];
}

function saveStoredBarbers(barbers) {
  return writeStored("barbers", "global", uniqueById(barbers.map(normalizeBarber)));
}


function getBarberStableKey(barber = {}) {
  return [
    String(barber?.id ?? ""),
    String(barber?.ownerUsername || barber?.username || "").toLowerCase(),
    String(barber?.business_name || "").trim().toLowerCase(),
    String(barber?.location || "").trim().toLowerCase(),
  ].join("|");
}

function mergeBarberListsPreservingLocal(serverBarbers = [], localBarbers = []) {
  const localMap = new Map(
    (localBarbers || []).map((item) => [getBarberStableKey(item), normalizeBarber(item)])
  );

  const merged = (serverBarbers || []).map((serverItem, index) => {
    const normalizedServer = normalizeBarber(serverItem, index);
    const localItem =
      localMap.get(getBarberStableKey(normalizedServer)) ||
      (localBarbers || []).find(
        (item) =>
          String(item?.id || "") === String(normalizedServer.id || "") ||
          (String(item?.ownerUsername || "") &&
            String(item?.ownerUsername || "") === String(normalizedServer.ownerUsername || ""))
      );

    return normalizeBarber(
      {
        ...normalizedServer,
        image: normalizedServer.image || localItem?.image || "",
        availability: normalizedServer.availability || localItem?.availability,
        phone: normalizedServer.phone || localItem?.phone || "",
      },
      index
    );
  });

  return uniqueById(merged);
}


const DEFAULT_USER_PROFILE = {
  username: "",
  fullName: "",
  phone: "",
  email: "",
  address: "",
  profilePhoto: "",
};

const DEFAULT_WALLET_STATE = {
  wallet: {
    pending_balance: 0,
    available_balance: 0,
    locked_balance: 0,
    total_earned: 0,
    withdrawn_total: 0,
  },
  transactions: [],
  withdrawals: [],
};

const DEFAULT_SUBSCRIPTION_STATE = {
  tier: "LOCKED",
  name: "No active plan",
  price: 0,
  status: "none",
  is_trial: false,
  trial_days_total: 30,
  trial_days_left: 0,
  fallback_tier_after_trial: null,
  expires_at: null,
  features: {
    rankingWeight: 0,
    analyticsLevel: "none",
    homepageFeatured: false,
    searchPriority: 0,
    topBarberBadge: false,
    verifiedBadge: false,
    adsPlacement: false,
    promotionsEnabled: false,
    marketingPushEnabled: false,
    homeServiceEnabled: false,
    profileCustomizationLevel: "basic",
    visibilityLabel: "Low visibility",
    supportLevel: "self-serve",
    serviceLimit: 0,
    photoLimit: 0,
    videoLimit: 0,
    reviewsEnabled: false,
    earningsTracking: false,
    bookingAnalytics: false,
    customBrandingHighlight: false,
    portfolioEnabled: false,
    beforeAfterGalleryEnabled: false,
    advancedAnalytics: false,
    aiBusinessCoach: false,
    reviewInsights: false,
    videoUploads: false,
    homepageFeature: false,
    priorityRanking: false,
    customBanner: false,
    aiWeeklyReport: false,
  },
};

const VALID_PROVIDER_PLANS = ["PRO", "PREMIUM", "PLATINUM"];

function normalizeProviderPlan(plan) {
  const normalized = String(plan || "").trim().toUpperCase();
  if (normalized === "STANDARD" || normalized === "STARTER" || normalized === "FREE") return "PRO";
  return VALID_PROVIDER_PLANS.includes(normalized) ? normalized : "";
}

function hasProviderAccess(subscription) {
  const plan = normalizeProviderPlan(subscription?.tier);
  const status = String(subscription?.status || "").toLowerCase();
  return Boolean(plan) && (status === "active" || status === "trialing" || subscription?.is_trial);
}

function isFutureDate(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function isPublicProvider(barber) {
  const plan = normalizeProviderPlan(barber?.subscription?.tier || barber?.subscription_tier);
  const businessStatus = String(barber?.business_status || barber?.status || "").toLowerCase();
  const subscriptionStatus = String(barber?.subscription?.status || barber?.subscription_status || "").toLowerCase();
  const trialStatus = String(barber?.trial_status || "").toLowerCase();
  const adminApproved =
    barber?.admin_approved === 1 ||
    barber?.admin_approved === true ||
    ["approved", "manual_approved", "admin_approved"].includes(subscriptionStatus);
  const isDemo = barber?.is_demo === 1 || barber?.is_demo === true;
  const published = barber?.is_published === 1 || barber?.is_published === true || barber?.isPublished === true;
  const validBusinessStatuses = new Set(["active", "approved", "live"]);
  const blockedStatuses = new Set([
    "almost_ready",
    "cancelled",
    "draft",
    "expired",
    "inactive",
    "pending_subscription",
    "pending_payment",
    "payment_failed",
    "plan_required",
    "rejected",
    "subscription_expired",
    "suspended",
    "trial_expired",
  ]);
  const hasActiveSubscription =
    subscriptionStatus === "active" &&
    isFutureDate(barber?.subscription?.expires_at || barber?.subscription_expires_at || barber?.subscriptionEndDate);
  const hasActiveTrial =
    subscriptionStatus === "trialing" &&
    trialStatus === "active" &&
    isFutureDate(barber?.trial_ends_at || barber?.trialEndDate || barber?.subscription?.expires_at);

  return (
    Boolean(plan) &&
    validBusinessStatuses.has(businessStatus) &&
    published &&
    !isDemo &&
    !blockedStatuses.has(subscriptionStatus) &&
    (hasActiveSubscription || hasActiveTrial || adminApproved)
  );
}

const FILTERS = ["All", "Top Rated", "Nearby", "Open Now", "Customer Location", "Verified", "Featured"];

const SERVICE_TYPES = DEFAULT_SERVICE_TYPES;

const DEFAULT_CENTER = [0.3136, 32.5811];
const DEFAULT_IMAGE_SET = [logo, logo, logo];
const LOCATION_STORAGE_KEY = "queless-location";
const APP_BASE_PATH = normalizeAppBasePath(import.meta.env.VITE_BASE_PATH || import.meta.env.BASE_URL);
const APP_PATH = "/";
const HOME_PATH = "/home";
const CATEGORIES_PATH = "/categories";
const BOOKINGS_PATH = "/bookings";
const INBOX_PATH = "/inbox";
const DASHBOARD_PATH = "/dashboard";
const REPORTS_PATH = "/reports";
const PROFILE_PATH = "/profile";
const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/signup";
const REGISTER_PATH = "/register";
const FORGOT_PASSWORD_PATH = "/forgot-password";
const ADMIN_PATH = "/super-admin-access";
const LEGACY_ADMIN_PATH = "/superadminaccess";
const UPGRADE_PATH = "/upgrade";
const LEGACY_UPGRADE_PATH = "/upgrade-plan";
const SERVICES_PATH = "/services";
const MAP_PATH = "/map";
const BOOKING_CONFIRMATION_PATH = "/booking-confirmed";
const BOOKING_ONLINE_PAYMENTS_ENABLED =
  String(import.meta.env.VITE_BOOKING_ONLINE_PAYMENTS_ENABLED || "").toLowerCase() === "true";
const ADMIN_ROLES = new Set(["admin", "superadmin", "super_admin", "super-admin"]);
const PROVIDER_ROLES = new Set(["barber", "provider", "business", "salon", "spa"]);

function normalizeAppBasePath(value) {
  const trimmed = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

function stripAppBasePath(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (!APP_BASE_PATH) return normalized;
  if (normalized === APP_BASE_PATH) return "/";
  if (normalized.startsWith(`${APP_BASE_PATH}/`)) {
    return normalized.slice(APP_BASE_PATH.length) || "/";
  }
  return normalized;
}

function appPath(path = APP_PATH) {
  const nextPath = String(path || APP_PATH);
  const normalized = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return APP_BASE_PATH ? `${APP_BASE_PATH}${normalized === APP_PATH ? "/" : normalized}` : normalized;
}

function getUserRoleValue(user = {}) {
  if (!user) return "";
  return String(user.role || user.accountType || user.account_type || user.userType || user.user_type || "")
    .trim()
    .toLowerCase();
}

function userIsAdmin(user = {}) {
  return ADMIN_ROLES.has(getUserRoleValue(user));
}

function userIsProvider(user = {}) {
  return PROVIDER_ROLES.has(getUserRoleValue(user));
}

function getScreenFromPath(pathname, hasToken) {
  const normalized = stripAppBasePath(pathname);
  if (
    normalized === LOGIN_PATH ||
    normalized === SIGNUP_PATH ||
    normalized === REGISTER_PATH ||
    normalized === FORGOT_PASSWORD_PATH
  ) {
    return hasToken ? "app" : "login";
  }
  if (
    normalized === "/" ||
    normalized === ADMIN_PATH ||
    normalized === LEGACY_ADMIN_PATH ||
    normalized === UPGRADE_PATH ||
    normalized === LEGACY_UPGRADE_PATH
  ) {
    return hasToken ? "app" : "login";
  }
  return hasToken ? "app" : "login";
}

function getAuthModeFromPath(pathname) {
  const normalized = stripAppBasePath(pathname);
  if (normalized === SIGNUP_PATH || normalized === REGISTER_PATH) return "signup";
  if (normalized === FORGOT_PASSWORD_PATH) return "forgot";
  return "login";
}

function getTabFromPath(pathname, user) {
  const normalized = stripAppBasePath(pathname);
  if (normalized === ADMIN_PATH || normalized === LEGACY_ADMIN_PATH) return userIsAdmin(user) ? "admin" : "home";
  if (normalized === UPGRADE_PATH || normalized === LEGACY_UPGRADE_PATH) return "upgrade";
  if (normalized === MAP_PATH) return "home";
  if (normalized === BOOKING_CONFIRMATION_PATH || normalized.startsWith(`${BOOKING_CONFIRMATION_PATH}/`)) return "bookingConfirmation";
  if (normalized === SERVICES_PATH) return "searchResults";
  if (normalized === HOME_PATH || normalized === APP_PATH) return "home";
  if (normalized === CATEGORIES_PATH) return "categories";
  if (normalized === BOOKINGS_PATH) return "bookings";
  if (normalized === INBOX_PATH) return "inbox";
  if (normalized === DASHBOARD_PATH) return userIsAdmin(user) ? "admin" : "dashboard";
  if (normalized === REPORTS_PATH) return userIsAdmin(user) ? "adminReports" : "reports";
  if (normalized === PROFILE_PATH) return "profile";
  return "home";
}

function getBookingIdFromPath(pathname) {
  const normalized = stripAppBasePath(pathname);
  if (!normalized.startsWith(`${BOOKING_CONFIRMATION_PATH}/`)) return "";
  return decodeURIComponent(normalized.slice(BOOKING_CONFIRMATION_PATH.length + 1));
}

function isAdminPath(pathname) {
  const normalized = stripAppBasePath(pathname);
  return normalized === ADMIN_PATH || normalized === LEGACY_ADMIN_PATH;
}

function readSearchRouteParams() {
  const params = new URLSearchParams(window.location.search || "");
  return {
    query: params.get("query") || "",
    location: params.get("location") || "",
  };
}

function isUsableSearchLocation(value) {
  const label = String(value || "").trim();
  return Boolean(label && label !== "Near you" && label !== "Detecting location..." && label !== "Location permission denied");
}

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString()}`;
}

function getBadgeLabel(value) {
  if (!value) return "New";
  return String(value).toLowerCase() === "new barber" ? "New" : value;
}

function generateDates(days = 14) {
  const out = [];
  const today = new Date();

  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      value: d.toISOString().split("T")[0],
      label:
        i === 0
          ? "Today"
          : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-US", {
              weekday: "short",
              day: "numeric",
              month: "short",
            }),
    });
  }

  return out;
}

function formatTo24Hour(timeStr) {
  const raw = String(timeStr || "").trim();
  if (!raw) return "";

  if (/^\d{2}:\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return raw;

  let hours = Number(match[1]);
  const minutes = match[2];
  const modifier = match[3].toUpperCase();

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function timeToMinutes(timeStr) {
  const normalized = formatTo24Hour(timeStr);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return 0;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeRangesOverlap(startA, durationA, startB, durationB) {
  const aStart = timeToMinutes(startA);
  const aEnd = aStart + Number(durationA || 30);
  const bStart = timeToMinutes(startB);
  const bEnd = bStart + Number(durationB || 30);
  return aStart < bEnd && aEnd > bStart;
}

function formatTimeLabel(timeStr) {
  const raw24 = formatTo24Hour(timeStr);
  if (!/^\d{2}:\d{2}$/.test(raw24)) return String(timeStr || "");

  const [hours, minutes] = raw24.split(":").map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function generateTimeSlots() {
  const slots = [];
  for (let hour = 8; hour < 21; hour += 1) {
    for (let mins = 0; mins < 60; mins += 30) {
      const value = `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
      slots.push({
        value,
        label: formatTimeLabel(value),
      });
    }
  }
  return slots;
}

function getAverageRating(reviews = []) {
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
  return Number((total / reviews.length).toFixed(1));
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

function isBusinessOpenNow(barber) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const availabilityStart = timeToMinutes(barber?.availability?.start || barber?.availability_start || "08:00");
  const availabilityEnd = timeToMinutes(barber?.availability?.end || barber?.availability_end || "20:00");
  return currentMinutes >= availabilityStart && currentMinutes < availabilityEnd;
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getBarberServices(barber) {
  if (!barber?.services?.length) {
    return SERVICE_TYPES.map(normalizeServiceForBooking);
  }

  const available = getAvailableServices(barber.services);
  return available.length ? available : barber.services.map(normalizeServiceForBooking);
}

function normalizeTeamMembers(input = []) {
  const source = Array.isArray(input) ? input : [];
  return source
    .map((item, idx) => {
      if (typeof item === "string") {
        return {
          id: `team-${idx}`,
          name: item.trim(),
          title: "Barber",
          is_active: 1,
        };
      }

      return {
        id: item.id ?? `team-${idx}`,
        barber_id: item.barber_id ?? item.barberId ?? null,
        name: String(item.name || "").trim(),
        title: item.title || "Barber",
        bio: item.bio || "",
        image: item.image || "",
        specialties: item.specialties || "",
        is_active: item.is_active ?? item.isActive ?? 1,
      };
    })
    .filter((item) => item.name);
}

function parseTeamMembers(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      title: "Barber",
      specialties: "",
      is_active: true,
    }));
}

function mapServerBooking(item) {
  return {
    id: item.id,
    barberId: item.barber_id,
    barberName: item.business_name || item.barberName || "",
    barberUsername: item.barber_username || "",
    barberOwnerUsername: item.barber_owner_username || "",
    teamMemberId: item.team_member_id || item.teamMemberId || null,
    teamMemberName: item.team_member_name || item.teamMemberName || "",
    teamMemberTitle: item.team_member_title || item.teamMemberTitle || "",
    customerUsername: item.customer_username || "",
    customerName: item.customer_full_name || item.customer_username || "",
    location: item.location || "",
    service: item.service_name,
    date: item.booking_date,
    dateValue: item.booking_date,
    time: formatTo24Hour(item.booking_time),
    timeLabel: formatTimeLabel(item.booking_time),
    price: item.price,
    status: item.status,
    paymentMethod: item.payment_method || item.paymentMethod || "cash",
    paymentStatus: item.payment_status || item.paymentStatus || "unpaid",
    paymentProvider: item.payment_provider || item.paymentProvider || item.payment_method || "",
    paymentReference: item.payment_reference || item.paymentReference || "",
    paymentCustomerPhone: item.payment_customer_phone || item.paymentCustomerPhone || "",
    commissionAmount: Number(item.commission_amount || item.commissionAmount || 0),
    barberAmount: Number(item.barber_amount || item.barberAmount || 0),
    paidAt: item.paid_at || item.paidAt || null,
    serviceDurationMinutes: item.service_duration_minutes || 30,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    cancelledBy: item.cancelled_by || null,
    cancellationReason: item.cancellation_reason || "",
  };
}

function mapServerNotification(item) {
  return {
    id: item.id,
    user: item.user || item.username || "",
    title: item.title || "Notification",
    type: item.type || "system",
    message: item.message || "",
    description: item.description || item.message || "",
    read: Boolean(item.read),
    createdAt: item.created_at || item.createdAt || new Date().toISOString(),
    barberId: item.barber_id || item.barberId || "",
    barberName: item.barber_name || item.barberName || "",
    barberOwnerUsername: item.barber_owner_username || item.barberOwnerUsername || item.barber_username || item.barberUsername || "",
    customerUsername: item.customer_username || item.customerUsername || "",
    customerName: item.customer_name || item.customerName || "",
    targetName: item.target_name || item.targetName || "",
  };
}

function normalizeBarber(barber, index) {
  const fallback = {
    id: barber?.id ?? index + 1,
    ownerUsername: null,
    business_name: "",
    location: "",
    latitude: DEFAULT_CENTER[0],
    longitude: DEFAULT_CENTER[1],
    price_from: 0,
    accepts_wallet: 0,
    accepts_cash: 1,
    stand_type: "individual",
    verified: "New",
    services: [],
    availability: { start: "08:00", end: "20:00" },
    phone: "",
    image: "",
    team_members: [],
  };
  const normalizedPortfolio = Array.isArray(barber.portfolio)
    ? barber.portfolio
    : safeJsonParse(barber.portfolio_json, []);

  return {
    ...fallback,
    ...barber,
    id: Number(barber.id ?? fallback.id),
    ownerUsername: barber.ownerUsername || barber.username || fallback.ownerUsername || null,
    owner_user_id: barber.owner_user_id ?? null,
    business_name: barber.business_name || fallback.business_name,
    location: barber.location || fallback.location,
    latitude: Number(barber.latitude ?? fallback.latitude),
    longitude: Number(barber.longitude ?? fallback.longitude),
    price_from: Number(barber.price_from ?? fallback.price_from),
    accepts_wallet: Number(barber.accepts_wallet ?? barber.acceptsWallet ?? fallback.accepts_wallet ?? 0),
    accepts_cash: Number(barber.accepts_cash ?? barber.acceptsCash ?? fallback.accepts_cash ?? 1),
    stand_type: String(barber.stand_type || barber.standType || fallback.stand_type || "individual").toLowerCase() === "shop" ? "shop" : "individual",
    business_type: String(barber.business_type || barber.businessType || getAvailableServices(barber.services || [])[0]?.category || "Services"),
    home_service_enabled: Number(
      barber.home_service_enabled ??
      barber.homeServiceEnabled ??
      barber.subscription?.features?.homeServiceEnabled ??
      0
    ),
    intro_text: String(barber.intro_text || barber.introText || "").trim(),
    verified: barber.verified || barber.verified_status || barber.badge || fallback.verified,
    subscription: {
      ...DEFAULT_SUBSCRIPTION_STATE,
      ...(barber.subscription || {}),
      tier: barber.subscription?.tier || barber.subscription_tier || DEFAULT_SUBSCRIPTION_STATE.tier,
      status: barber.subscription?.status || barber.subscription_status || DEFAULT_SUBSCRIPTION_STATE.status,
      expires_at: barber.subscription?.expires_at || barber.subscription_expires_at || DEFAULT_SUBSCRIPTION_STATE.expires_at,
      features: {
        ...DEFAULT_SUBSCRIPTION_STATE.features,
        ...(barber.subscription?.features || {}),
      },
    },
    featured: Boolean(barber.featured || barber.subscription?.features?.homepageFeatured),
    services:
      Array.isArray(barber.services) && barber.services.length
        ? barber.services.map((service, idx) =>
            typeof service === "string"
              ? {
                  id: `fallback-${idx}`,
                  ...normalizeServiceForBooking(service, idx),
                }
              : normalizeServiceForBooking(service, idx)
          )
        : [],
    availability:
      barber.availability || {
        start: barber.availability_start || fallback.availability?.start || "08:00",
        end: barber.availability_end || fallback.availability?.end || "20:00",
      },
    phone: barber.phone || fallback.phone || "",
    image: barber.image || fallback.image || logo,
    portfolio: Array.isArray(normalizedPortfolio) ? normalizedPortfolio : [],
    gallery:
      Array.isArray(normalizedPortfolio) && normalizedPortfolio.length
        ? normalizedPortfolio
            .flatMap((item) => [item.afterImage, item.beforeImage].filter(Boolean))
            .slice(0, 6)
        : [barber.image || fallback.image || logo].filter(Boolean).slice(0, 3),
    team_members: normalizeTeamMembers(barber.team_members || barber.teamMembers || fallback.team_members || []),
    teamMembers: normalizeTeamMembers(barber.team_members || barber.teamMembers || fallback.team_members || []),
  };
}

function mapServerReview(item) {
  return {
    ...item,
    id: item.id,
    bookingId: item.booking_id ?? item.bookingId,
    barberId: item.barber_id ?? item.barberId,
    userId: item.user_id ?? item.userId,
    username: item.username || "",
    name: item.full_name || item.name || item.username || "",
    rating: Number(item.rating || 0),
    text: item.review_text ?? item.text ?? "",
    review_text: item.review_text ?? item.text ?? "",
    createdAt: item.created_at ?? item.createdAt,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isStrongPassword(value) {
  const text = String(value || "");
  return text.length >= 8 && /[A-Za-z]/.test(text) && /\d/.test(text);
}

function readAuthUser() {
  return (
    safeJsonParse(localStorage.getItem("lineup_user"), null) ||
    safeJsonParse(sessionStorage.getItem("lineup_user"), null) ||
    safeJsonParse(localStorage.getItem("cutz_user"), null) ||
    safeJsonParse(sessionStorage.getItem("cutz_user"), null)
  );
}

function readStoredQuelessLocation() {
  const saved = safeJsonParse(localStorage.getItem(LOCATION_STORAGE_KEY), null);
  if (saved?.label) return saved;
  const legacyLabel = localStorage.getItem("queless_location_label");
  const legacyCoords = safeJsonParse(localStorage.getItem("queless_location_coords"), null);
  if (legacyLabel) {
    return {
      label: legacyLabel,
      coords: legacyCoords || null,
      source: legacyCoords ? "current" : "manual",
    };
  }
  return null;
}

function getFirstValue(...values) {
  return values.find((value) => String(value || "").trim());
}

function getInitials(...values) {
  const text = String(getFirstValue(...values) || "User").trim();
  if (text.includes("@")) return text.slice(0, 1).toUpperCase();
  const words = text.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "U").toUpperCase();
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readSessionExpiry(token) {
  if (!token || String(token).startsWith("local-")) return null;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return new Date(Number(payload.exp) * 1000).toISOString();
}

function saveAuthSession(token, user, { rememberMe = true } = {}) {
  const storage = rememberMe ? localStorage : sessionStorage;
  const otherStorage = rememberMe ? sessionStorage : localStorage;

  storage.setItem("lineup_token", token || "");
  storage.setItem("lineup_user", JSON.stringify(user));
  otherStorage.removeItem("lineup_token");
  otherStorage.removeItem("lineup_user");
  otherStorage.removeItem("lineup_token_expires_at");

  const expiry = readSessionExpiry(token);
  if (expiry) {
    storage.setItem("lineup_token_expires_at", expiry);
  } else {
    storage.removeItem("lineup_token_expires_at");
  }
}

function clearAuthSession() {
  localStorage.removeItem("lineup_token");
  localStorage.removeItem("lineup_user");
  localStorage.removeItem("lineup_token_expires_at");
  localStorage.removeItem("cutz_token");
  localStorage.removeItem("cutz_user");
  sessionStorage.removeItem("lineup_token");
  sessionStorage.removeItem("lineup_user");
  sessionStorage.removeItem("lineup_token_expires_at");
  sessionStorage.removeItem("cutz_token");
  sessionStorage.removeItem("cutz_user");
}

function App() {
  const [screen, setScreen] = useState(() => getScreenFromPath(window.location.pathname, Boolean(getAuthToken())));
  const [authMode, setAuthMode] = useState(() => getAuthModeFromPath(window.location.pathname));
  const [theme, setTheme] = useTheme();
  const [token, setToken] = useState(getAuthToken());
  const [currentUser, setCurrentUser] = useState(readAuthUser);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(
    () => localStorage.getItem("lineup_token_expires_at") || sessionStorage.getItem("lineup_token_expires_at") || readSessionExpiry(getAuthToken())
  );

  const [activeTab, setActiveTab] = useState(() => getTabFromPath(window.location.pathname, readAuthUser()));
  const initialSearchRoute = readSearchRouteParams();
  const [query, setQuery] = useState(initialSearchRoute.query || "");
  const [searchResultsQuery, setSearchResultsQuery] = useState(initialSearchRoute.query || "");
  const [searchResultsLocation, setSearchResultsLocation] = useState(initialSearchRoute.location || "");
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [previousMobileView, setPreviousMobileView] = useState("home");
  const [mapState, setMapState] = useState({ show: false, category: "All", returnView: "home" });
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");


  const [profile, setProfile] = useState(DEFAULT_USER_PROFILE);
  const [profileSaving, setProfileSaving] = useState(false);
  const [barbers, setBarbers] = useState([]);
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [focusedBookingId, setFocusedBookingId] = useState(() => getBookingIdFromPath(window.location.pathname));
  const [reviewsByBarber, setReviewsByBarber] = useState({});
  const [walletState, setWalletState] = useState(DEFAULT_WALLET_STATE);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMessage, setWalletMessage] = useState("");
  const [subscriptionState, setSubscriptionState] = useState(DEFAULT_SUBSCRIPTION_STATE);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionReady, setSubscriptionReady] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [pendingSubscriptionPayment, setPendingSubscriptionPayment] = useState(null);
  const [trialUpgradeDismissed, setTrialUpgradeDismissed] = useState(false);
  const [upgradeSelectedTier, setUpgradeSelectedTier] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [userLocation, setUserLocation] = useState(() => readStoredQuelessLocation()?.coords || null);
  const [locationLabel, setLocationLabel] = useState(() => readStoredQuelessLocation()?.label || "Near you");
  const [locationMessage, setLocationMessage] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  const [selectedBarber, setSelectedBarber] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showBarberProfile, setShowBarberProfile] = useState(false);
  const [showRegisterBarber, setShowRegisterBarber] = useState(false);
  const [showEditBarber, setShowEditBarber] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [notificationToast, setNotificationToast] = useState(null);
  const [dismissedToastIds, setDismissedToastIds] = useState([]);

  useEffect(() => {
    if (screen === "app") {
      setShowNotifications(false);
    }
  }, [screen, authMode]);

  const getTrialUpgradeDismissKey = () =>
    `lineup:upgrade-dismissed:${currentUser?.username || "guest"}:${new Date().toISOString().slice(0, 10)}`;

  const dismissTrialUpgrade = (targetTab = "dashboard") => {
    const key = getTrialUpgradeDismissKey();
    try {
      sessionStorage.setItem(key, "1");
      localStorage.setItem(key, "1");
    } catch {}
    setTrialUpgradeDismissed(true);
    setActiveTab(targetTab);
  };

  useEffect(() => {
    const key = getTrialUpgradeDismissKey();
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(key) === "1" || localStorage.getItem(key) === "1";
    } catch {}
    setTrialUpgradeDismissed(dismissed);
  }, [currentUser?.username]);

  useEffect(() => {
    if (String(subscriptionState?.tier || "").toUpperCase() !== "LOCKED" && subscriptionState?.status !== "trial_expired") {
      setTrialUpgradeDismissed(false);
    }
  }, [subscriptionState?.tier, subscriptionState?.status]);

  const [chatText, setChatText] = useState("");
  const [chatCustomerUsername, setChatCustomerUsername] = useState("");
  const [chatTargetName, setChatTargetName] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [selectedService, setSelectedService] = useState(SERVICE_TYPES[0].id);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [mtnPaymentPhone, setMtnPaymentPhone] = useState("");
  const [pendingBookingPayment, setPendingBookingPayment] = useState(null);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [typingState, setTypingState] = useState({ active: false, name: "" });
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [reviewedBookings, setReviewedBookings] = useReviewedBookings(currentUser?.username);

  const usernameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const loginRequestRef = useRef(false);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const chatThreadRef = useRef(null);
  const notificationAudioRef = useRef(null);

  const dateOptions = useMemo(() => generateDates(), []);
  const timeOptions = useMemo(() => generateTimeSlots(), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value || "");
  const [selectedTime, setSelectedTime] = useState("");

  const activeConfirmationBooking = useMemo(() => {
    const routeId = focusedBookingId || getBookingIdFromPath(window.location.pathname);
    if (confirmedBooking && (!routeId || String(confirmedBooking.id) === String(routeId))) return confirmedBooking;
    return bookings.find((item) => String(item.id) === String(routeId)) || confirmedBooking || null;
  }, [bookings, confirmedBooking, focusedBookingId]);

  const ownedBarberFromState = useMemo(() => {
    if (!currentUser?.username) return null;
    return (
      barbers.find((item) => String(item?.ownerUsername || item?.username || "") === String(currentUser.username)) ||
      null
    );
  }, [barbers, currentUser?.username]);

  const isAdmin = userIsAdmin(currentUser);
  const effectiveIsBarber = Boolean(
    !isAdmin && (userIsProvider(currentUser) || ownedBarberFromState)
  );
  const barberDayAvailability = useBookingAvailability({
    barberId: selectedBarber?.id,
    bookingDate: selectedDate,
    teamMemberId: selectedTeamMemberId,
    enabled: showBookingModal && !effectiveIsBarber,
  });

  useEffect(() => {
    const openProviderSignup = () => {
      if (effectiveIsBarber) {
        setActiveTab("dashboard");
        return;
      }
      setShowRegisterBarber(true);
    };
    window.addEventListener("marketplace:become-provider", openProviderSignup);
    return () => window.removeEventListener("marketplace:become-provider", openProviderSignup);
  }, [effectiveIsBarber]);

  useEffect(() => {
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    setShowNotifications(false);
    setShowAccountMenu(false);
    setShowEditBarber(false);
    setChatError("");
    setChatStatus("");
    setGlobalError("");
  }, [activeTab]);

  useEffect(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }, [screen, activeTab]);

  useEffect(() => {
    if (token && currentUser) setScreen("app");
  }, [token, currentUser]);

  useEffect(() => {
    if (screen !== "login") return;
    const nextAuthMode = getAuthModeFromPath(window.location.pathname);
    if (nextAuthMode !== authMode) {
      setAuthMode(nextAuthMode);
    }
  }, [screen]);

  useEffect(() => {
    if (screen !== "app") return;
    if (stripAppBasePath(window.location.pathname) === MAP_PATH) {
      setMapState((prev) => ({ ...prev, show: true, category: prev.category || "All", returnView: prev.returnView || "home" }));
      return;
    }
    const nextTab = getTabFromPath(window.location.pathname, currentUser);
    if (nextTab === "bookingConfirmation") {
      setFocusedBookingId(getBookingIdFromPath(window.location.pathname));
      setActiveTab(nextTab);
      return;
    }
    if (nextTab === "searchResults") {
      const routeParams = readSearchRouteParams();
      setSearchResultsQuery(routeParams.query);
      setSearchResultsLocation(routeParams.location);
      if (routeParams.query) setQuery(routeParams.query);
    }
    if (nextTab !== "home" && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [screen, currentUser?.role]);

  useEffect(() => {
    const expectedScreen = getScreenFromPath(window.location.pathname, Boolean(token));
    if (expectedScreen !== screen) {
      setScreen(expectedScreen);
    }
  }, [token, screen]);

  useEffect(() => {
    const logicalTargetPath =
      screen === "app"
        ? mapState.show
          ? MAP_PATH
          : (activeTab === "admin" || activeTab === "adminReports") && isAdmin
          ? ADMIN_PATH
          : activeTab === "upgrade"
          ? UPGRADE_PATH
          : activeTab === "bookingConfirmation"
          ? `${BOOKING_CONFIRMATION_PATH}${activeConfirmationBooking?.id ? `/${encodeURIComponent(activeConfirmationBooking.id)}` : ""}`
          : activeTab === "searchResults"
          ? `${SERVICES_PATH}${window.location.search || ""}`
          : activeTab === "home"
          ? HOME_PATH
          : activeTab === "categories" || activeTab === "categoryServices"
          ? CATEGORIES_PATH
          : activeTab === "bookings"
          ? BOOKINGS_PATH
          : activeTab === "inbox"
          ? INBOX_PATH
          : activeTab === "dashboard"
          ? DASHBOARD_PATH
          : activeTab === "reports"
          ? REPORTS_PATH
          : activeTab === "profile"
          ? PROFILE_PATH
          : APP_PATH
        : authMode === "signup"
        ? SIGNUP_PATH
        : authMode === "forgot"
        ? FORGOT_PASSWORD_PATH
        : LOGIN_PATH;
    const targetPath = appPath(logicalTargetPath);
    const currentPath = `${window.location.pathname}${window.location.search || ""}`;
    if (currentPath !== targetPath) {
      const currentIsAdminPath = isAdminPath(window.location.pathname);
      const targetIsAdminPath = logicalTargetPath === ADMIN_PATH;
      const shouldPush =
        targetIsAdminPath && !currentIsAdminPath;
      window.history[shouldPush ? "pushState" : "replaceState"]({}, "", targetPath);
    }
  }, [activeConfirmationBooking?.id, activeTab, authMode, isAdmin, mapState.show, screen]);

  useEffect(() => {
    const handlePopState = () => {
      const nextScreen = getScreenFromPath(window.location.pathname, Boolean(token));
      setScreen(nextScreen);
      if (nextScreen === "login") {
        setAuthMode(getAuthModeFromPath(window.location.pathname));
        return;
      }
      if (stripAppBasePath(window.location.pathname) === MAP_PATH) {
        setMapState((prev) => ({ ...prev, show: true, category: prev.category || "All", returnView: prev.returnView || "home" }));
        setActiveTab("home");
        return;
      }
      setMapState((prev) => ({ ...prev, show: false }));
      const nextTab = getTabFromPath(window.location.pathname, currentUser);
      if (nextTab === "bookingConfirmation") {
        setFocusedBookingId(getBookingIdFromPath(window.location.pathname));
      }
      if (nextTab === "searchResults") {
        const routeParams = readSearchRouteParams();
        setSearchResultsQuery(routeParams.query);
        setSearchResultsLocation(routeParams.location);
        if (routeParams.query) setQuery(routeParams.query);
      }
      setActiveTab(nextTab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentUser?.role, token]);

  useEffect(() => {
    if (screen !== "app") return;
    setShowNotifications(false);
  }, [screen]);

  useEffect(() => {
    if (!notifications.length || showNotifications || showChat || showBookingModal) return;

    const latestUnread = notifications.find(
      (item) => !item.read && !dismissedToastIds.includes(String(item.id))
    );
    if (!latestUnread) return;

    if (String(notificationToast?.id || "") === String(latestUnread.id || "")) return;

    setNotificationToast({
      id: latestUnread.id,
      title: latestUnread.title || "New notification",
      message: latestUnread.description || latestUnread.message || "",
      type: latestUnread.type || "system",
    });

    playNotificationSound();

    const timeout = setTimeout(() => {
      setNotificationToast((current) =>
        String(current?.id || "") === String(latestUnread.id || "") ? null : current
      );
    }, 3200);

    return () => clearTimeout(timeout);
  }, [
    notifications,
    showNotifications,
    showChat,
    showBookingModal,
    notificationToast?.id,
    dismissedToastIds,
  ]);

  useEffect(() => {
    if (!currentUser?.username) return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: {
        token: getAuthToken(),
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join");
    });

    socket.on("receive_message", (message) => {
      if (!message) return;

      const activeChatMatch =
        selectedBarber?.id &&
        chatCustomerUsername &&
        String(message.barberId || "") === String(selectedBarber.id || "") &&
        String(message.customerUsername || "") === String(chatCustomerUsername || "");

      if (activeChatMatch) {
        setMessages((prev) =>
          uniqueById([...prev, { ...message, seen: Boolean(message.seen) }]).sort(
            (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
          )
        );
      }

      const fromOtherUser = String(message.sender || "") !== String(currentUser.username || "");
      if (fromOtherUser) {
        const incomingNotification = {
          id: message.id ? `msg-${message.id}` : makeId("ntf"),
          user: currentUser.username,
          type: "message",
          barberId: message.barberId,
          barberName: message.barberName,
          barberOwnerUsername: message.barberOwnerUsername || message.barberUsername || "",
          customerUsername: message.customerUsername,
          customerName: message.customerName || message.customerUsername,
          targetName:
            effectiveIsBarber
              ? message.customerName || message.customerUsername
              : message.barberName,
          title: "New message",
          message: `${effectiveIsBarber ? message.customerName || message.customerUsername || "Customer" : message.barberName || "Business"} sent you a message.`,
          createdAt: message.createdAt || new Date().toISOString(),
          read: false,
        };
        appendNotificationSafely(incomingNotification);
      }
    });

    socket.on("receive_notification", (notification) => {
      if (!notification) return;
      appendNotificationSafely(notification);
    });

    socket.on("booking_updated", (booking) => {
      if (!booking) return;
      setBookings((prev) => upsertById(prev, booking));
      writeStored("bookings", "global", upsertById(readStored("bookings", "global", []), booking));
    });

    socket.on("typing", (payload) => {
      const sameChat =
        selectedBarber?.id &&
        chatCustomerUsername &&
        String(payload?.barberId || "") === String(selectedBarber.id || "") &&
        String(payload?.customerUsername || "") === String(chatCustomerUsername || "");

      if (!sameChat) return;

      setTypingState({
        active: true,
        name: payload?.name || "Someone",
      });
    });

    socket.on("stop_typing", (payload) => {
      const sameChat =
        !payload ||
        (
          selectedBarber?.id &&
          chatCustomerUsername &&
          String(payload?.barberId || "") === String(selectedBarber.id || "") &&
          String(payload?.customerUsername || "") === String(chatCustomerUsername || "")
        );

      if (!sameChat) return;

      setTypingState({
        active: false,
        name: "",
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser?.username, currentUser?.role, selectedBarber?.id, chatCustomerUsername]);

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (!currentUser?.username) return;
    fetchProfile(currentUser.username);
    fetchFavorites(currentUser.username);
    fetchBookings(currentUser.username, effectiveIsBarber ? "barber" : "customer");
    fetchMyReviews(currentUser.username);
    fetchNotifications();
    fetchWallet();
  }, [currentUser?.username, currentUser?.role, effectiveIsBarber, barbers.length]);

  useEffect(() => {
    if (!pendingBookingPayment?.bookingId || !currentUser?.username) return;

    const handleReturnToBooking = () => {
      if (document.visibilityState === "visible") {
        verifyCurrentBookingPayment(pendingBookingPayment.bookingId, true);
      }
    };

    window.addEventListener("focus", handleReturnToBooking);
    document.addEventListener("visibilitychange", handleReturnToBooking);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        verifyCurrentBookingPayment(pendingBookingPayment.bookingId, true);
      }
    }, 12000);

    return () => {
      window.removeEventListener("focus", handleReturnToBooking);
      document.removeEventListener("visibilitychange", handleReturnToBooking);
      clearInterval(interval);
    };
  }, [pendingBookingPayment?.bookingId, currentUser?.username]);

  useEffect(() => {
    if (!currentUser?.username || (!effectiveIsBarber && !isAdmin)) {
      setPendingSubscriptionPayment(null);
      setSubscriptionState(DEFAULT_SUBSCRIPTION_STATE);
      setSubscriptionReady(true);
      return;
    }

    setSubscriptionReady(false);
    fetchSubscription();
  }, [currentUser?.username, effectiveIsBarber, isAdmin]);

  useEffect(() => {
    if (!pendingSubscriptionPayment?.reference || !currentUser?.username) return;

    const handleSubscriptionReturn = () => {
      if (document.visibilityState === "visible") {
        verifyCurrentSubscription(pendingSubscriptionPayment.reference, true);
      }
    };

    window.addEventListener("focus", handleSubscriptionReturn);
    document.addEventListener("visibilitychange", handleSubscriptionReturn);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        verifyCurrentSubscription(pendingSubscriptionPayment.reference, true);
      }
    }, 12000);

    return () => {
      window.removeEventListener("focus", handleSubscriptionReturn);
      document.removeEventListener("visibilitychange", handleSubscriptionReturn);
      clearInterval(interval);
    };
  }, [pendingSubscriptionPayment?.reference, currentUser?.username]);

  useEffect(() => {
    if (!selectedBarber?.id) return;
    fetchReviewsForBarber(selectedBarber.id);
  }, [selectedBarber?.id]);

  useEffect(() => {
    if (!selectedBarber) return;
    const services = getBarberServices(selectedBarber);
    if (services.length) {
      setSelectedService(services[0].id);
    }
    const teamMembers = normalizeTeamMembers(selectedBarber.team_members || selectedBarber.teamMembers || []);
    const activeTeamMembers = teamMembers.filter((item) => Number(item.is_active ?? 1) === 1);
    setSelectedTeamMemberId(
      String(selectedBarber.stand_type || selectedBarber.standType || "individual") === "shop" && activeTeamMembers.length
        ? String(activeTeamMembers[0].id)
        : ""
    );
  }, [selectedBarber]);

  useEffect(() => {
    if (!selectedBarber) return;
    setSelectedPaymentMethod("cash");
    setMtnPaymentPhone(profile.phone || "");
    setPendingBookingPayment(null);
  }, [selectedBarber, profile.phone]);

  useEffect(() => {
    const ids = [...new Set((barbers || []).map((item) => Number(item?.id)).filter(Boolean))];
    if (!ids.length) return;
    ids.forEach((id) => {
      if (!reviewsByBarber[id]) {
        fetchReviewsForBarber(id);
      }
    });
  }, [barbers]);

  useEffect(() => {
    if (!selectedBarber?.id || !chatCustomerUsername) return;
    fetchMessages(selectedBarber.id, chatCustomerUsername);
  }, [selectedBarber?.id, chatCustomerUsername]);

  useEffect(() => {
    if (!currentUser?.username) return;

    const interval = setInterval(() => {
      fetchBookings(currentUser.username, effectiveIsBarber ? "barber" : "customer");
    }, 8000);

    return () => clearInterval(interval);
  }, [currentUser?.username, currentUser?.role, effectiveIsBarber]);

  useEffect(() => {
    if (!showChat || !selectedBarber?.id || !chatCustomerUsername) return;
    fetchMessages(selectedBarber.id, chatCustomerUsername);
  }, [showChat, selectedBarber?.id, chatCustomerUsername]);

  useAutoScrollToBottom(chatThreadRef, [messages, typingState], showChat);

  useEffect(() => {
    if (!currentUser?.username) return;
    writeStored("notifications", currentUser.username, notifications);
  }, [notifications, currentUser?.username]);


  const vibrate = (pattern = 10) => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {}
  };

  const playNotificationSound = () => {
    try {
      if (!notificationAudioRef.current) {
        notificationAudioRef.current = new Audio("/notification.mp3");
        notificationAudioRef.current.volume = 0.6;
      }
      notificationAudioRef.current.currentTime = 0;
      notificationAudioRef.current.play().catch(() => {});
    } catch {}
  };

  const showSystemToast = (title, message, type = "system") => {
    const id = makeId("toast");
    setDismissedToastIds((prev) => prev.filter((item) => item !== String(id)));
    setNotificationToast({ id, title, message, type });
  };

  const appendNotificationSafely = (incoming) => {
    if (!incoming) return;

    setNotifications((prev) => {
      const exists = prev.some((item) => {
        const sameId =
          String(item?.id || "") &&
          String(incoming?.id || "") &&
          String(item.id) === String(incoming.id);

        const sameMessageFingerprint =
          String(item?.type || "") === String(incoming?.type || "") &&
          String(item?.barberId || "") === String(incoming?.barberId || "") &&
          String(item?.customerUsername || "") === String(incoming?.customerUsername || "") &&
          String(item?.message || "") === String(incoming?.message || "") &&
          Math.abs(
            new Date(item?.createdAt || 0).getTime() -
              new Date(incoming?.createdAt || 0).getTime()
          ) < 5000;

        return sameId || sameMessageFingerprint;
      });

      if (exists) return prev;
      return mergeByNewest(prev, [incoming]);
    });
  };

  const openToastNotification = async () => {
    if (!notificationToast?.id) {
      setShowNotifications(true);
      setNotificationToast(null);
      return;
    }

    const target = notifications.find(
      (item) => String(item.id) === String(notificationToast.id)
    );

    setNotificationToast(null);

    if (target) {
      await handleNotificationOpen(target);
    } else {
      setShowNotifications(true);
    }
  };

  useEffect(() => {
    if (globalError) {
      showSystemToast("Something needs attention", globalError, "system");
    }
  }, [globalError]);

  useEffect(() => {
    if (reviewSuccess) {
      showSystemToast("Review update", reviewSuccess, "system");
    }
  }, [reviewSuccess]);

  const clearAuthMessages = () => {
    setAuthError("");
    setAuthSuccess("");
  };

const fetchBarbers = async () => {
  try {
    setBarbersLoading(true);
    setGlobalError("");

    const [res, mineResult] = await Promise.all([
      getBarbers(),
      currentUser?.username ? getMyBarberStand().catch(() => null) : Promise.resolve(null),
    ]);

    const incoming = Array.isArray(res?.barbers)
      ? res.barbers.map(normalizeBarber)
      : Array.isArray(res)
      ? res.map(normalizeBarber)
      : [];
    const mine = mineResult?.barber ? [normalizeBarber(mineResult.barber, incoming.length)] : [];

    const localBarbers = getStoredBarbers().filter(isPublicProvider);
    const mergedIncoming = [...mine, ...incoming];
    const next = mergedIncoming.length
      ? mergeBarberListsPreservingLocal(mergedIncoming, localBarbers)
      : [];

    setBarbers(next);
    saveStoredBarbers(next.filter(isPublicProvider));
  } catch {
    setBarbers([]);
    saveStoredBarbers([]);
    setGlobalError("");
  } finally {
    setBarbersLoading(false);
  }
};

  const fetchProfile = async (username) => {
    try {
      const data = await getProfile(username);
      const next = { ...DEFAULT_USER_PROFILE, ...(data || {}), username };
      setProfile(next);
      writeStored("profile", username, next);
    } catch {
      const saved = readStored("profile", username, null);
      setProfile(saved ? { ...DEFAULT_USER_PROFILE, ...saved, username } : { ...DEFAULT_USER_PROFILE, username });
    }
  };

  const fetchFavorites = async (username) => {
    try {
      const data = await getFavoriteRows(username);
      const ids = Array.isArray(data)
        ? data.map((item) => Number(item.barber_id ?? item.barberId ?? item.id)).filter(Boolean)
        : [];
      setFavorites(ids);
      writeStored("favorites", username, ids);
    } catch {
      setFavorites(readStored("favorites", username, []));
    }
  };

  const fetchBookings = async (username, role) => {
    try {
      const data = await getMyBookings();
      const rows = Array.isArray(data?.bookings) ? data.bookings : [];
      const next = rows.map(mapServerBooking);

      setBookings(next);
      writeStored("bookings", "global", next);
    } catch {
      const saved = readStored("bookings", "global", []);
      const filtered = Array.isArray(saved)
        ? saved.filter((item) =>
            role === "barber"
              ? item.barberOwnerUsername === username || item.ownerUsername === username || item.barberUsername === username
              : item.customerUsername === username
          )
        : [];
      setBookings(filtered);
    }
  };

  const fetchReviewsForBarber = async (barberId) => {
    try {
      const data = await getBarberReviews(barberId);
      const serverReviews = (Array.isArray(data) ? data : data?.reviews || []).map(mapServerReview);
      const localReviews = readStored("reviews", String(barberId), []);
      const next = mergeByNewest(localReviews, serverReviews);
      setReviewsByBarber((prev) => ({ ...prev, [barberId]: next }));
      writeStored("reviews", String(barberId), next);
    } catch {
      setReviewsByBarber((prev) => ({ ...prev, [barberId]: readStored("reviews", String(barberId), []) }));
    }
  };

  const fetchMyReviews = async (username) => {
    try {
      const data = await getMyReviews();
      const serverReviews = (Array.isArray(data) ? data : data?.reviews || []).map(mapServerReview);
      const nextReviewed = serverReviews.reduce((acc, review) => {
        if (review.bookingId) acc[String(review.bookingId)] = review;
        return acc;
      }, {});

      setReviewedBookings(nextReviewed);
      writeStored("reviewedBookings", username, nextReviewed);
    } catch {
      setReviewedBookings(readStored("reviewedBookings", username, {}));
    }
  };

  const fetchNotifications = async () => {
    if (!currentUser?.username) return;

    try {
      const data = await getNotifications();
      const incoming = Array.isArray(data?.notifications)
        ? data.notifications.map(mapServerNotification)
        : [];

      const stored = readStored("notifications", currentUser.username, []);
      const merged = mergeNotificationsPreservingRead(stored, incoming);

      writeStored("notifications", currentUser.username, merged);
      setNotifications(merged);
    } catch {
      setNotifications(readStored("notifications", currentUser.username, []));
    }
  };

  const fetchWallet = async () => {
    if (!currentUser?.username) return;
    if (!effectiveIsBarber && !isAdmin) {
      setWalletState(DEFAULT_WALLET_STATE);
      setWalletMessage("");
      return;
    }

    try {
      const data = await getMyWallet();
      setWalletState({
        wallet: data?.wallet || DEFAULT_WALLET_STATE.wallet,
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        withdrawals: Array.isArray(data?.withdrawals) ? data.withdrawals : [],
      });
    } catch {
      setWalletState(DEFAULT_WALLET_STATE);
    }
  };

  const fetchSubscription = async () => {
    if (!currentUser?.username || (!effectiveIsBarber && !isAdmin)) {
      setSubscriptionState(DEFAULT_SUBSCRIPTION_STATE);
      setSubscriptionReady(true);
      return;
    }

    try {
      setSubscriptionLoading(true);
      const data = await getMySubscription();
      setSubscriptionState({
        ...DEFAULT_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      });
    } catch (error) {
      setSubscriptionState(isAdmin
        ? {
            ...DEFAULT_SUBSCRIPTION_STATE,
            tier: "PLATINUM",
            name: "Admin preview",
            status: "admin_preview",
            adminPreview: true,
          }
        : {
            ...DEFAULT_SUBSCRIPTION_STATE,
            tier: "LOCKED",
            name: "No active plan",
            status: "pending_payment",
          });
      if (!isAdmin) {
        setSubscriptionMessage(error?.status === 403 ? "We could not load your subscription details. Please refresh or contact support." : "");
      }
    } finally {
      setSubscriptionLoading(false);
      setSubscriptionReady(true);
    }
  };

  const fetchMessages = async (barberId, customerUsername) => {
    const scope = `${barberId}:${customerUsername}`;
    try {
      const data = await getMessages({ barberId, customerUsername });
      const next = Array.isArray(data) ? data : [];
      setMessages(next);
      writeStored("messages", scope, next);
    } catch {
      setMessages(readStored("messages", scope, []));
    }
  };

  const persistNotificationUpdate = (updatedList) => {
    if (!currentUser?.username) return;

    const keys = getNotificationKeysForUser(currentUser.username, barbers);

    keys.forEach((key) => {
      const existing = readStored("notifications", key, []);
      const merged = mergeNotificationsPreservingRead(
        existing.map((storedItem) => {
          const match = updatedList.find((item) => String(item.id) === String(storedItem.id));
          return match ? { ...storedItem, ...match } : storedItem;
        }),
        []
      );
      writeStored("notifications", key, merged);
    });
  };

  const markNotificationRead = async (notificationId) => {
    const nextList = notifications.map((item) =>
      String(item.id) === String(notificationId)
        ? { ...item, read: true }
        : item
    );

    setNotifications(nextList);
    setDismissedToastIds((prev) => [
      ...new Set([...prev, String(notificationId)])
    ]);

    if (String(notificationToast?.id || "") === String(notificationId)) {
      setNotificationToast(null);
    }

    writeStored("notifications", currentUser?.username || "guest", nextList);
    persistNotificationUpdate(nextList);

    try {
      await markNotificationReadRequest(notificationId);
    } catch {
      // keep local read state
    }
  };

  const markAllNotificationsRead = async () => {
    const unread = notifications.filter((item) => !item.read);
    if (!unread.length) return;

    const nextList = notifications.map((item) => ({ ...item, read: true }));
    setNotifications(nextList);
    setNotificationToast(null);
    setDismissedToastIds((prev) => [
      ...new Set([...prev, ...unread.map((item) => String(item.id))]),
    ]);

    writeStored("notifications", currentUser?.username || "guest", nextList);
    persistNotificationUpdate(nextList);

    try {
      await Promise.all(
        unread.map((item) =>
          markNotificationReadRequest(item.id)
        )
      );
    } catch {
      // keep local read state
    }
  };

  const openConversation = ({ barber, customerUsername, targetName }) => {
    if (!barber?.id || !customerUsername) return;

    const isSelfMessage =
      currentUser?.username &&
      barber.ownerUsername === currentUser.username &&
      customerUsername === currentUser.username;

    setSelectedBarber(barber);
    setChatCustomerUsername(customerUsername);
    setChatTargetName(targetName || barber.business_name || customerUsername);
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowNotifications(false);
    setShowChat(true);
    setMessages([]);
    setChatStatus("");
    setGlobalError("");

    if (isSelfMessage) {
      setChatError("You cannot message yourself.");
      return;
    }

    setChatError("");
  };

  const handleRegister = async () => {
    clearAuthMessages();
    const username = usernameRef.current?.value?.trim() || "";
    const email = emailRef.current?.value?.trim() || "";
    const password = passwordRef.current?.value || "";
    const confirm = confirmPasswordRef.current?.value || "";

    if (!email) {
      setAuthError("Email is required.");
      return;
    }

    if (!isValidEmail(email)) {
      setAuthError("Please enter a valid email address.");
      return;
    }

    if (!username || !password) {
      setAuthError("Username and password are required.");
      return;
    }

    if (String(password || "").length > MAX_PASSWORD_LENGTH) {
      setAuthError(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (!isStrongPassword(password)) {
      setAuthError(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters, with a letter and a number.`);
      return;
    }

    if (password !== confirm) {
      setAuthError("Passwords do not match.");
      return;
    }

    try {
      setAuthLoading(true);
      const data = await registerUser({ username, email, password, role: "customer" });

      setAuthSuccess(data?.message || "Account created. You can now log in.");
      setAuthMode("login");
      if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
    } catch (error) {
      if (error.status) {
        setAuthError(error.message);
        return;
      }

      const users = getStoredUsers();
      if (users.some((item) => item.username === username)) {
        setAuthError("Username already exists.");
      } else if (users.some((item) => String(item.email || "").toLowerCase() === email.toLowerCase())) {
        setAuthError("An account with this email already exists.");
      } else {
        saveStoredUsers([...users, { username, email, password, role: "customer" }]);
        setAuthSuccess("Account created. You can now log in.");
        setAuthMode("login");
        if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async ({ rememberMe = true } = {}) => {
    if (loginRequestRef.current || authLoading) return;
    clearAuthMessages();
    const username = usernameRef.current?.value?.trim() || "";
    const password = passwordRef.current?.value || "";

    if (!username || !password) {
      setAuthError("Username and password are required.");
      return;
    }

    try {
      loginRequestRef.current = true;
      setAuthLoading(true);
      const data = await loginUser({ username, password });
      const nextToken = data.token || "";
      saveAuthSession(nextToken, data.user, { rememberMe });
      setSessionExpiresAt(readSessionExpiry(nextToken));
      setToken(data.token || "");
      setCurrentUser(data.user);
      setActiveTab(isAdminPath(window.location.pathname) && data.user?.role === "admin" ? "admin" : "home");
      setScreen("app");
    } catch (error) {
      const users = getStoredUsers();
      const identifier = String(username || "").toLowerCase();
      const found = users.find(
        (item) =>
          (String(item.username || "").toLowerCase() === identifier ||
            String(item.email || "").toLowerCase() === identifier) &&
          item.password === password
      );
      if (!found) {
        setAuthError(error.message);
      } else {
        const ownsBarberStand = getStoredBarbers().some(
          (item) => String(item.ownerUsername || item.username || "") === String(found.username)
        );
        const user = {
          username: found.username,
          role: ownsBarberStand ? "barber" : found.role || "customer",
        };
        saveAuthSession(`local-${username}`, user, { rememberMe });
        setSessionExpiresAt(null);
        setToken(`local-${username}`);
        setCurrentUser(user);
        setActiveTab(isAdminPath(window.location.pathname) && user.role === "admin" ? "admin" : "home");
        setScreen("app");
      }
    } finally {
      loginRequestRef.current = false;
      setAuthLoading(false);
    }
  };

  const saveProfile = async (nextProfile) => {
    if (!currentUser?.username) return;
    try {
      setProfileSaving(true);
      if (nextProfile.phone) {
        const { countryCode, localNumber } = splitPhoneNumber(nextProfile.phone);
        if (!isValidPhoneNumber(countryCode, localNumber)) {
          throw new Error(`Please enter a valid phone number for ${countryCode}.`);
        }
      }
      if (nextProfile.email && !isValidEmail(nextProfile.email)) {
        throw new Error("Please enter a valid email address.");
      }
      const payload = {
        username: currentUser.username,
        fullName: nextProfile.fullName || "",
        phone: nextProfile.phone || "",
        email: nextProfile.email || "",
        address: nextProfile.address || "",
        profilePhoto: nextProfile.profilePhoto || "",
      };
      const data = await saveProfileRequest(payload);
      const saved = { ...DEFAULT_USER_PROFILE, ...data };
      setProfile(saved);
      writeStored("profile", currentUser.username, saved);
      setGlobalError("");
      return saved;
    } catch (error) {
      const fallback = { ...DEFAULT_USER_PROFILE, ...nextProfile, username: currentUser.username };
      setProfile(fallback);
      writeStored("profile", currentUser.username, fallback);
      setGlobalError("");
      return fallback;
    } finally {
      setProfileSaving(false);
    }
  };

  const sendPasswordResetCode = async () => {
    const email = emailRef.current?.value?.trim() || "";
    if (!email) {
      setAuthError("Email is required.");
      return false;
    }

    if (!isValidEmail(email)) {
      setAuthError("Please enter a valid email address.");
      return false;
    }

      try {
        setAuthLoading(true);
        setAuthError("");
        const data = await requestPasswordReset(email);
        if (passwordRef.current) passwordRef.current.value = "";
        if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
        setAuthSuccess(data?.devCode ? `Reset code sent. Dev code: ${data.devCode}` : data?.message || "If an account exists with this email, a reset code has been sent.");
        setAuthMode("reset");
        showSystemToast("Reset code sent", "Check your email for the verification code.", "system");
        return true;
      } catch (error) {
        setAuthError(error.message || "Could not send reset code.");
        return false;
      } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = emailRef.current?.value?.trim() || "";
    const code = passwordRef.current?.value?.trim();
    const newPassword = confirmPasswordRef.current?.value || "";

    if (!email || !code || !newPassword) {
      setAuthError("Email, code, and new password are required.");
      return;
    }

    if (!isValidEmail(email)) {
      setAuthError("Please enter a valid email address.");
      return;
    }

    if (String(newPassword || "").length > MAX_PASSWORD_LENGTH) {
      setAuthError(`New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setAuthError(`New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters, with a letter and a number.`);
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError("");
      await confirmPasswordReset({ email, code, newPassword });
      if (passwordRef.current) passwordRef.current.value = "";
      if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
      setAuthSuccess("Password reset complete. You can log in now.");
      setAuthMode("login");
      showSystemToast("Password reset", "You can log in with your new password.", "system");
    } catch (error) {
      setAuthError(error.message || "Could not reset password.");
    } finally {
      setAuthLoading(false);
    }
  };

  const updateCurrentAccount = async ({ username, currentPassword, newPassword }) => {
    if (!currentUser?.username) return false;

    const previousUsername = currentUser.username;
    const nextUsername = String(username || "").trim();
    const wantsUsernameChange = nextUsername && nextUsername !== previousUsername;
    const wantsPasswordChange = Boolean(newPassword);

    if (wantsPasswordChange && String(newPassword || "").length > MAX_PASSWORD_LENGTH) {
      setAccountMessage(`New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`);
      return false;
    }

    if (wantsPasswordChange && !isStrongPassword(newPassword)) {
      setAccountMessage(`New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters, with a letter and a number.`);
      return false;
    }

    try {
      setAccountLoading(true);
      setAccountMessage("");

      const data = await updateAccount({
        username: nextUsername,
        currentPassword,
        newPassword,
      });

      const nextUser = {
        ...currentUser,
        ...(data?.user || {}),
        username: data?.user?.username || nextUsername || previousUsername,
      };

      if (data?.token) {
        localStorage.setItem("lineup_token", data.token);
        localStorage.setItem("lineup_token_expires_at", readSessionExpiry(data.token) || "");
        setSessionExpiresAt(readSessionExpiry(data.token));
        setToken(data.token);
      }
      localStorage.setItem("lineup_user", JSON.stringify(nextUser));
      setCurrentUser(nextUser);

      if (wantsUsernameChange) {
        const nextProfile = { ...profile, username: nextUser.username };
        setProfile(nextProfile);
        writeStored("profile", nextUser.username, nextProfile);
        setBarbers((prev) => {
          const renamedBarbers = prev.map((item) =>
            String(item.ownerUsername || "") === String(previousUsername)
              ? { ...item, ownerUsername: nextUser.username }
              : item
          );
          saveStoredBarbers(renamedBarbers);
          return renamedBarbers;
        });
      }

      setAccountMessage(data?.message || "Account updated.");
      showSystemToast("Settings saved", "Your account settings were updated.", "system");
      return true;
    } catch (error) {
      const users = getStoredUsers();
      const stored = users.find((item) => item.username === previousUsername);

      if (stored && stored.password === currentPassword) {
        if (wantsUsernameChange && users.some((item) => item.username === nextUsername)) {
          setAccountMessage("Username already exists.");
          return false;
        }

        const nextUser = {
          ...currentUser,
          username: nextUsername || previousUsername,
        };
        const nextUsers = users.map((item) =>
          item.username === previousUsername
            ? {
                ...item,
                username: nextUser.username,
                password: wantsPasswordChange ? newPassword : item.password,
              }
            : item
        );
        saveStoredUsers(nextUsers);
      localStorage.setItem("lineup_user", JSON.stringify(nextUser));
        setCurrentUser(nextUser);

        const nextProfile = { ...profile, username: nextUser.username };
        setProfile(nextProfile);
        writeStored("profile", nextUser.username, nextProfile);
        setBarbers((prev) => {
          const renamedBarbers = prev.map((item) =>
            String(item.ownerUsername || "") === String(previousUsername)
              ? { ...item, ownerUsername: nextUser.username }
              : item
          );
          saveStoredBarbers(renamedBarbers);
          return renamedBarbers;
        });
        setAccountMessage("Account updated locally.");
        return true;
      }

      setAccountMessage(error.message || "Could not update account.");
      return false;
    } finally {
      setAccountLoading(false);
    }
  };

  const saveQuelessLocation = ({ label, coords = null, source = "manual" }) => {
    const cleanLabel = String(label || "").trim() || "Near you";
    const payload = { label: cleanLabel, coords, source };
    setUserLocation(coords);
    setLocationLabel(cleanLabel);
    setLocationMessage("");
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem("queless_location_label", cleanLabel);
    if (coords) {
      localStorage.setItem("queless_location_coords", JSON.stringify(coords));
    } else {
      localStorage.removeItem("queless_location_coords");
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location detection.");
      return;
    }
    setLocationLoading(true);
    setLocationMessage("");
    setLocationLabel("Detecting location...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        let nextLabel = "";
        try {
          nextLabel = await reverseGeocodeCoordinates(nextLocation);
        } catch {
          nextLabel = "";
        }
        saveQuelessLocation({
          label: nextLabel || "Location detected near your current area",
          coords: nextLocation,
          source: "current",
        });
        if (!nextLabel) setLocationMessage("Location detected, but the place name could not be loaded.");
        setLocationLoading(false);
      },
      (error) => {
        const savedLabel = readStoredQuelessLocation()?.label || "Near you";
        setLocationLabel(savedLabel);
        setLocationMessage(getGeolocationErrorMessage(error));
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const changeLocation = (nextLocation) => {
    const cleanLocation = String(nextLocation || "").trim();
    if (!cleanLocation) return;
    saveQuelessLocation({ label: cleanLocation, coords: null, source: "manual" });
  };

  const clearLocation = () => {
    setUserLocation(null);
    setLocationLabel("Near you");
    setLocationMessage("");
    localStorage.removeItem(LOCATION_STORAGE_KEY);
    localStorage.removeItem("queless_location_coords");
    localStorage.removeItem("queless_location_label");
  };

  const toggleFavorite = async (barberId) => {
    if (!currentUser?.username) return;
    const id = Number(barberId);
    const isFav = favorites.includes(id);

    try {
      if (isFav) {
        await removeFavorite({ username: currentUser.username, barberId });
        const next = favorites.filter((item) => Number(item) !== id);
        setFavorites(next);
        writeStored("favorites", currentUser.username, next);
        vibrate(6);
        vibrate(6);
      } else {
        await addFavorite({ username: currentUser.username, barberId: id });
        const next = [...new Set([...favorites, id])];
        setFavorites(next);
        writeStored("favorites", currentUser.username, next);
      }
    } catch (error) {
      const next = isFav
        ? favorites.filter((item) => Number(item) !== id)
        : [...new Set([...favorites, id])];
      setFavorites(next);
      writeStored("favorites", currentUser.username, next);
      setGlobalError("");
    }
  };

const registerBarber = async (payload) => {
    if (!currentUser?.username) return;
    const selectedServices = Array.isArray(payload.services)
      ? payload.services.map(normalizeServiceForBooking)
      : String(payload.services || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map(normalizeServiceForBooking);

    const alreadyHasBarberStand =
      effectiveIsBarber ||
      barbers.some((item) => String(item.ownerUsername || "") === String(currentUser.username || ""));

    if (alreadyHasBarberStand) {
      setShowRegisterBarber(false);
      setGlobalError("This account already has a business profile.");
      return;
    }

    const selectedPlan = normalizeProviderPlan(payload.selectedPlan || payload.plan);
    const startsTrial = false;

    const normalizedName = String(payload.businessName || "").trim().toLowerCase().replace(/\s+/g, " ");
    const duplicateBusiness = getStoredBarbers().some(
      (item) => String(item.business_name || "").trim().toLowerCase().replace(/\s+/g, " ") === normalizedName
    );
    if (duplicateBusiness) {
      setGlobalError("A business with this name already exists. If this is your business, report it for review.");
      return;
    }

    try {
      const data = await registerBarberStand({
        business_name: payload.businessName,
        location: payload.location,
        latitude: Number(payload.latitude || DEFAULT_CENTER[0]),
        longitude: Number(payload.longitude || DEFAULT_CENTER[1]),
        price_from: Number(payload.pricing || 0),
        image: payload.image || profile.profilePhoto || "",
        services: selectedServices,
        stand_type: payload.standType || "individual",
        business_type: payload.businessType || "barber",
        home_service_enabled: Boolean(payload.homeServiceEnabled),
        intro_text: payload.introText || "",
        portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
        team_members: payload.standType === "shop" ? parseTeamMembers(payload.teamMembers) : [],
        accepts_wallet: Boolean(payload.acceptsWallet),
        accepts_cash: true,
        selected_plan: selectedPlan || "",
        access_type: "subscription",
        start_free_trial: false,
      });

      const createdBarber = data?.barber ? normalizeBarber(data.barber, 0) : null;
      if (createdBarber) {
        setBarbers((prev) => mergeBarberListsPreservingLocal([createdBarber], prev));
        const publicStored = mergeBarberListsPreservingLocal([createdBarber], getStoredBarbers()).filter(isPublicProvider);
        saveStoredBarbers(publicStored);
        setSubscriptionState({
          ...DEFAULT_SUBSCRIPTION_STATE,
          ...(createdBarber.subscription || {}),
          features: {
            ...DEFAULT_SUBSCRIPTION_STATE.features,
            ...(createdBarber.subscription?.features || {}),
          },
        });
      }
      await fetchBarbers();
      if (data?.next_step === "upgrade" || !startsTrial) {
        setSubscriptionMessage(data?.message || "Your business has been saved, but it will only go live after you start a trial or subscribe.");
      }
    } catch (error) {
      setGlobalError(
        error?.payload?.code === "DUPLICATE_BUSINESS_NAME"
          ? "A business with this name already exists. If this is your business, you can report or claim it."
          : error.message || "Your business has been saved, but it will only go live after you start a trial or subscribe."
      );
      return;
    }

    const upgradedUser = {
      ...currentUser,
      role: "provider",
    };
      localStorage.setItem("lineup_user", JSON.stringify(upgradedUser));
    setCurrentUser(upgradedUser);

    const users = getStoredUsers();
    saveStoredUsers(
      users.map((item) =>
        item.username === currentUser.username ? { ...item, role: "provider" } : item
      )
    );

    setShowRegisterBarber(false);
    if (startsTrial) {
      setActiveTab("dashboard");
    } else {
      openUpgradePlan(selectedPlan || "PRO");
    }

    const uploadNotification = {
      id: makeId("ntf"),
      user: upgradedUser.username,
      type: "system",
      title: startsTrial ? "Business profile uploaded" : "Business draft saved",
      message: startsTrial
        ? "Your business page was uploaded successfully."
        : "Your business has been saved, but it will only go live after you start a trial or subscribe.",
      createdAt: new Date().toISOString(),
      read: false,
    };
    appendStored("notifications", upgradedUser.username, uploadNotification);
    fetchNotifications();
    setGlobalError("");
  };

const updateBarberStand = async (payload) => {
    if (!currentUser?.username || !myBarberProfile) return;
    const selectedServices = Array.isArray(payload.services)
      ? payload.services.map(normalizeServiceForBooking)
      : String(payload.services || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map(normalizeServiceForBooking);

    const nextBarber = normalizeBarber(
      {
        ...myBarberProfile,
        business_name: payload.businessName,
        location: payload.location,
        price_from: Number(payload.pricing || 0),
        services: selectedServices,
        availability: { start: payload.scheduleStart, end: payload.scheduleEnd },
        latitude: Number(payload.latitude || DEFAULT_CENTER[0]),
        longitude: Number(payload.longitude || DEFAULT_CENTER[1]),
        image: payload.image || myBarberProfile.image || "",
        accepts_wallet: payload.acceptsWallet ? 1 : 0,
        accepts_cash: 1,
        stand_type: payload.standType || "individual",
        business_type: payload.businessType || myBarberProfile.business_type || "barber",
        home_service_enabled: payload.homeServiceEnabled ? 1 : 0,
        intro_text: payload.introText || "",
        portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : myBarberProfile.portfolio || [],
        team_members: payload.standType === "shop" ? parseTeamMembers(payload.teamMembers) : [],
        verified: getBadgeLabel(myBarberProfile.verified || "New"),
        ownerUsername: currentUser.username,
      },
      0
    );

    const localUpdated = getStoredBarbers().map((item) =>
      String(item.id) === String(myBarberProfile.id) ? nextBarber : item
    );
    saveStoredBarbers(localUpdated);
    setBarbers(localUpdated);
    setSelectedBarber(nextBarber);

    try {
      await updateMyBarberStand({
        business_name: nextBarber.business_name,
        location: nextBarber.location,
        latitude: nextBarber.latitude,
        longitude: nextBarber.longitude,
        price_from: nextBarber.price_from,
        image: nextBarber.image || "",
        services: nextBarber.services,
        stand_type: nextBarber.stand_type || "individual",
        business_type: nextBarber.business_type || "barber",
        home_service_enabled: Boolean(nextBarber.home_service_enabled),
        intro_text: nextBarber.intro_text || "",
        portfolio: nextBarber.portfolio || [],
        team_members: nextBarber.team_members || [],
        accepts_wallet: Boolean(nextBarber.accepts_wallet),
        accepts_cash: true,
      });

      await fetchBarbers();
    } catch (error) {
      // local state already updated
    }

    setShowEditBarber(false);

    const updateNotification = {
      id: makeId("ntf"),
      user: currentUser.username,
      type: "system",
      title: "Business profile updated",
      message: "Your business details were saved.",
      createdAt: new Date().toISOString(),
      read: false,
    };
    appendStored("notifications", currentUser.username, updateNotification);
    showSystemToast("Business updated", "Your business changes were saved.", "system");
    fetchNotifications();
  };

const deleteBarberStand = async () => {
    if (!currentUser?.username || !myBarberProfile) return;

    const confirmed = window.confirm(
      "Are you sure you want to hide this business profile? It will no longer be visible to customers, and your trial history will be preserved."
    );
    if (!confirmed) return;

    try {
      await deleteMyBarberStand();
    } catch (error) {
      // fallback to local removal below
    }

    const remainingBarbers = getStoredBarbers().filter(
      (item) =>
        String(item.ownerUsername || "") !== String(currentUser.username || "") &&
        String(item.id || "") !== String(myBarberProfile.id || "")
    );
    saveStoredBarbers(remainingBarbers);
    setBarbers(remainingBarbers);

    const updatedUser = { ...currentUser, role: "customer" };
      localStorage.setItem("lineup_user", JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);

    const users = getStoredUsers();
    saveStoredUsers(
      users.map((item) =>
        item.username === currentUser.username ? { ...item, role: "customer" } : item
      )
    );

    setSelectedBarber(null);
    setActiveTab("home");
    setShowRegisterBarber(false);
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowEditBarber(false);
    setShowChat(false);
    const removalNotification = {
      id: makeId("ntf"),
      user: currentUser.username,
      type: "system",
      title: "Business profile removed",
      message: "This account is now back to customer mode.",
      createdAt: new Date().toISOString(),
      read: false,
    };
    appendStored("notifications", currentUser.username, removalNotification);
    fetchNotifications();
    setGlobalError("");
  };

  const createBooking = async () => {
    if (!selectedBarber || !currentUser?.username || !selectedDate || !selectedTime || creatingBooking) return;
    if (effectiveIsBarber) {
      setGlobalError("Business accounts cannot place bookings.");
      return;
    }

    const cooldown = getBookingCooldownInfo(bookings, currentUser, selectedBarber);
    if (cooldown.blocked) {
      setGlobalError(cooldown.reason);
      return;
    }

    const paymentAllowed = isBookingPaymentMethodEnabled(selectedPaymentMethod, {
      onlinePaymentsEnabled: BOOKING_ONLINE_PAYMENTS_ENABLED,
    });
    if (!paymentAllowed) {
      setGlobalError("Online payments are coming later. Choose cash for now.");
      return;
    }
    const mobileMoneyPhone = String(mtnPaymentPhone || "").trim();
    if (isOnlinePaymentMethod(selectedPaymentMethod) && !/^(\+?256|0)?[37]\d{8}$/.test(mobileMoneyPhone.replace(/\s+/g, ""))) {
      setGlobalError("Enter a valid Uganda phone number for MTN Mobile Money.");
      return;
    }
    const teamMembers = normalizeTeamMembers(selectedBarber.team_members || selectedBarber.teamMembers || []);
    const activeTeamMembers = teamMembers.filter((item) => Number(item.is_active ?? 1) === 1);
    const requiresTeamMember =
      String(selectedBarber.stand_type || selectedBarber.standType || "individual") === "shop" &&
      activeTeamMembers.length > 0;
    const selectedTeamMember = activeTeamMembers.find((item) => String(item.id) === String(selectedTeamMemberId));
    if (requiresTeamMember && !selectedTeamMember) {
      setGlobalError("Choose a service provider from this business before booking.");
      return;
    }

    try {
      setCreatingBooking(true);
      setGlobalError("");

      const services = getBarberServices(selectedBarber);
      const serviceObj =
        services.find((item) => String(item.id) === String(selectedService)) || services[0];

      if (!serviceObj?.id) {
        throw new Error("Please select a valid service.");
      }

      const data = await createBookingRequest({
        barber_id: Number(selectedBarber.id),
        service_id: serviceObj.id,
        booking_date: selectedDate,
        booking_time: selectedTime,
        payment_method: selectedPaymentMethod,
        payment_phone: isOnlinePaymentMethod(selectedPaymentMethod) ? mobileMoneyPhone : profile.phone,
        idempotencyKey: makeId("booking-payment"),
        team_member_id: selectedTeamMember?.id || null,
      });

      const created = data?.booking;
      if (!created) throw new Error("Booking was not returned by the server.");

      const nextBooking = mapServerBooking({
        ...created,
        business_name: selectedBarber.business_name,
        location: selectedBarber.location,
        payment_method: selectedPaymentMethod,
        team_member_id: selectedTeamMember?.id || created.team_member_id || null,
        team_member_name: selectedTeamMember?.name || created.team_member_name || "",
        team_member_title: selectedTeamMember?.title || created.team_member_title || "",
      });

      setBookings((prev) => [nextBooking, ...prev]);
      writeStored(
        "bookings",
        "global",
        uniqueById([nextBooking, ...readStored("bookings", "global", [])])
      );

      if (data?.payment?.reference) {
        setPendingBookingPayment({
          bookingId: nextBooking.id,
          reference: data.payment.reference,
          provider: data.payment.provider,
          status: data.payment.status,
          grossAmount: Number(data.payment.gross_amount || 0),
          commissionAmount: Number(data.payment.commission_amount || 0),
          barberAmount: Number(data.payment.barber_amount || 0),
          instructions: data.payment.instructions || "",
          phoneNumber: nextBooking.paymentCustomerPhone || mobileMoneyPhone || profile.phone || "",
        });
      } else {
        setPendingBookingPayment(null);
      }

      vibrate([12, 30, 12]);
      showSystemToast(
        data?.payment?.reference ? "Payment started" : "Booking confirmed",
        data?.payment?.reference
          ? "Approve the mobile money prompt to secure your booking."
          : "Your booking was created successfully.",
        "booking"
      );
      if (!data?.payment?.reference) {
        setShowBookingModal(false);
        setConfirmedBooking(nextBooking);
        setFocusedBookingId(String(nextBooking.id || ""));
      }
      setShowBarberProfile(false);
      setActiveTab(data?.payment?.reference ? "bookings" : "bookingConfirmation");
      fetchBookings(currentUser.username, effectiveIsBarber ? "barber" : "customer");
      fetchNotifications();
      fetchWallet();
    } catch (error) {
      setGlobalError(error.message || "Could not create booking.");
    } finally {
      setCreatingBooking(false);
    }
  };


  const updateBookingStatus = async (bookingId, status) => {
    const existingBooking = bookings.find((item) => String(item.id) === String(bookingId));
    if (!existingBooking) return;

    try {
      const data = await updateBookingStatusRequest(bookingId, status);

      const updatedBooking = data?.booking
        ? mapServerBooking({
            ...data.booking,
            business_name: existingBooking.barberName,
            location: existingBooking.location,
            customer_username: existingBooking.customerUsername,
            customer_full_name: existingBooking.customerName,
          })
        : { ...existingBooking, status };

      setBookings((prev) =>
        prev.map((item) => (String(item.id) === String(bookingId) ? updatedBooking : item))
      );
      writeStored(
        "bookings",
        "global",
        readStored("bookings", "global", []).map((item) =>
          String(item.id) === String(bookingId) ? updatedBooking : item
        )
      );

      if (currentUser?.username) {
        fetchBookings(currentUser.username, effectiveIsBarber ? "barber" : "customer");
      }
      vibrate([10, 20, 10]);
      showSystemToast("Booking updated", `Status changed to ${status}.`, "booking");
      fetchNotifications();
    } catch (error) {
      setGlobalError(error.message || "Could not update booking.");
    }
  };

  const verifyCurrentBookingPayment = async (bookingId = pendingBookingPayment?.bookingId, silent = false) => {
    if (!bookingId || !currentUser?.username) return false;

    try {
      setCreatingBooking(true);
      const data = await verifyBookingPaymentRequest(bookingId);
      const updatedBooking = data?.booking ? mapServerBooking(data.booking) : null;

      if (updatedBooking) {
        setBookings((prev) => upsertById(prev, updatedBooking));
        writeStored(
          "bookings",
          "global",
          upsertById(readStored("bookings", "global", []), updatedBooking)
        );
      }

      setPendingBookingPayment(null);
      setShowBookingModal(false);
      if (updatedBooking) {
        setConfirmedBooking(updatedBooking);
        setFocusedBookingId(String(updatedBooking.id || bookingId));
        setActiveTab("bookingConfirmation");
      }
      showSystemToast("Booking confirmed", data?.message || "Payment confirmed and booking secured.", "booking");
      fetchBookings(currentUser.username, "customer");
      fetchNotifications();
      return true;
    } catch (error) {
      if (!silent) {
        setGlobalError(error.message || "Payment has not completed yet.");
      }
      return false;
    } finally {
      setCreatingBooking(false);
    }
  };

  const getFriendlyPaymentError = (error) => {
    if (error?.status === 401) return "Your session has expired. Please log in again.";
    if (error?.status === 403) return "You do not have permission to complete this action.";
    return error?.message || "Payment failed. Please try again.";
  };

  const startCurrentSubscriptionUpgrade = async (request, fallbackProvider = "mtn_mobile_money") => {
    const payload =
      typeof request === "object" && request !== null
        ? request
        : { tier: request, provider: fallbackProvider, method: fallbackProvider };
    const tier = String(payload.tier || "PREMIUM").toUpperCase();
    const provider = String(payload.provider || payload.method || fallbackProvider || "mtn_mobile_money").toLowerCase();

    try {
      setSubscriptionLoading(true);
      setSubscriptionMessage("");
      const idempotencyKey = makeId("subscription-upgrade");
      const data = await startSubscriptionUpgrade(
        {
          tier,
          planId: tier,
          billingCycle: payload.billingCycle || payload.billing_cycle || "monthly",
          provider,
          method: provider,
          payment_phone: payload.phoneNumber || payload.payment_phone || profile.phone,
          phoneNumber: payload.phoneNumber || payload.payment_phone || profile.phone,
          cardDetails: payload.cardDetails,
        },
        idempotencyKey
      );

      setPendingSubscriptionPayment({
        reference: data?.payment?.reference || "",
        tier,
        provider,
      });
      if (provider === "trial" && data?.subscription) {
        setSubscriptionState({
          ...DEFAULT_SUBSCRIPTION_STATE,
          ...data.subscription,
          features: {
            ...DEFAULT_SUBSCRIPTION_STATE.features,
            ...(data.subscription.features || {}),
          },
        });
        setPendingSubscriptionPayment(null);
        fetchBarbers();
        setActiveTab(effectiveIsBarber ? "dashboard" : "profile");
      }
      setSubscriptionMessage(data?.message || `Approve the ${provider} payment prompt.`);
      return true;
    } catch (error) {
      setSubscriptionMessage(getFriendlyPaymentError(error));
      return false;
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const verifyCurrentSubscription = async (reference = pendingSubscriptionPayment?.reference, silent = false) => {
    if (!reference) return false;

    try {
      setSubscriptionLoading(true);
      const data = await verifySubscriptionUpgrade(reference);
      setSubscriptionState({
        ...DEFAULT_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      });
      setPendingSubscriptionPayment(null);
      setSubscriptionMessage(data?.message || "Subscription upgraded successfully.");
      showSystemToast("Subscription upgraded", data?.message || "Your plan is now active.", "system");
      fetchBarbers();
      setActiveTab(effectiveIsBarber ? "dashboard" : "profile");
      return true;
    } catch (error) {
      if (!silent) {
        setSubscriptionMessage(getFriendlyPaymentError(error) || "Subscription payment has not completed yet.");
      }
      return false;
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const requestCurrentWithdrawal = async (amount) => {
    try {
      setWalletLoading(true);
      setWalletMessage("");
      const data = await requestWalletWithdrawal(amount, makeId("withdrawal"));
      setWalletState({
        wallet: data?.wallet || DEFAULT_WALLET_STATE.wallet,
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        withdrawals: Array.isArray(data?.withdrawals) ? data.withdrawals : [],
      });
      setWalletMessage(data?.message || "Withdrawal requested.");
      showSystemToast("Withdrawal requested", data?.message || "Withdrawal request created.", "system");
    } catch (error) {
      setWalletMessage(error.message || "Could not request withdrawal.");
    } finally {
      setWalletLoading(false);
    }
  };

  const confirmCashPayment = async (bookingId) => {
    const existingBooking = bookings.find((item) => String(item.id) === String(bookingId));
    if (!existingBooking) return;

    try {
      const data = await confirmCashPaymentRequest(bookingId);
      const updatedBooking = data?.booking
        ? mapServerBooking({
            ...data.booking,
            business_name: existingBooking.barberName,
            location: existingBooking.location,
            customer_username: existingBooking.customerUsername,
            customer_full_name: existingBooking.customerName,
          })
        : { ...existingBooking, paymentStatus: "paid", paidAt: new Date().toISOString() };

      setBookings((prev) =>
        prev.map((item) => (String(item.id) === String(bookingId) ? updatedBooking : item))
      );
      writeStored(
        "bookings",
        "global",
        readStored("bookings", "global", []).map((item) =>
          String(item.id) === String(bookingId) ? updatedBooking : item
        )
      );
      fetchBookings(currentUser?.username || "", effectiveIsBarber ? "barber" : "customer");
      fetchNotifications();
      showSystemToast("Payment confirmed", "Cash payment marked as received.", "booking");
    } catch (error) {
      setGlobalError(error.message || "Could not confirm cash payment.");
    }
  };


  const cancelBooking = async (bookingId) => {
    try {
      const data = await updateBookingStatusRequest(bookingId, "cancelled");

      const target = bookings.find((item) => String(item.id) === String(bookingId));
      const cancelled = data?.booking
        ? mapServerBooking({
            ...data.booking,
            business_name: target?.barberName,
            location: target?.location,
            customer_username: target?.customerUsername,
            customer_full_name: target?.customerName,
          })
        : { ...(target || {}), status: "cancelled" };

      setBookings((prev) =>
        prev.map((item) => (String(item.id) === String(bookingId) ? cancelled : item))
      );
      writeStored(
        "bookings",
        "global",
        readStored("bookings", "global", []).map((item) =>
          String(item.id) === String(bookingId) ? cancelled : item
        )
      );

      fetchBookings(currentUser?.username || "", effectiveIsBarber ? "barber" : "customer");
      fetchNotifications();
    } catch (error) {
      setGlobalError(error.message || "Could not cancel booking.");
    }
  };

  const submitReview = async (booking, rating, text) => {
    if (!booking?.id || !booking?.barberId || !currentUser?.username) return;

    const reviewedMap = readStored("reviewedBookings", currentUser.username, reviewedBookings || {});
    if (reviewedMap[String(booking.id)]) {
      setReviewSuccess("You already submitted a review for this booking.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }

    const localReview = {
      id: makeId("rvw"),
      bookingId: booking.id,
      barberId: booking.barberId,
      username: currentUser.username,
      name: profile.fullName || currentUser.username,
      rating: Number(rating || 5),
      text: text || "",
      createdAt: new Date().toISOString(),
    };
    let submittedReview = localReview;

    try {
      const data = await createReview({
        bookingId: booking.id,
        barberId: booking.barberId,
        username: currentUser.username,
        name: profile.fullName || currentUser.username,
        rating: Number(rating || 5),
        text,
      });
      const savedReview = mapServerReview(data?.review || data || localReview);
      submittedReview = savedReview;
      const next = mergeByNewest(reviewsByBarber[booking.barberId] || [], [savedReview]);
      setReviewsByBarber((prev) => ({
        ...prev,
        [booking.barberId]: next,
      }));
      writeStored("reviews", String(booking.barberId), next);
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("already been reviewed")) {
        await fetchMyReviews(currentUser.username);
        setReviewSuccess("You already submitted a review for this booking.");
        setTimeout(() => setReviewSuccess(""), 2200);
        return;
      }

      const next = mergeByNewest(reviewsByBarber[booking.barberId] || [], [localReview]);
      submittedReview = localReview;
      setReviewsByBarber((prev) => ({ ...prev, [booking.barberId]: next }));
      writeStored("reviews", String(booking.barberId), next);
      setGlobalError("");
    }

    const nextReviewed = {
      ...reviewedMap,
      [String(booking.id)]: submittedReview,
    };
    setReviewedBookings(nextReviewed);
    writeStored("reviewedBookings", currentUser.username, nextReviewed);

    setReviewSuccess("Review submitted successfully.");
    setTimeout(() => setReviewSuccess(""), 2200);

    await fetchReviewsForBarber(booking.barberId);
  };

  const editBookingReview = async (booking, rating, text) => {
    if (!booking?.id || !booking?.barberId || !currentUser?.username) return;

    const existingReview =
      (reviewsByBarber[booking.barberId] || []).find(
        (item) => String(item.booking_id || item.bookingId) === String(booking.id)
      ) || reviewedBookings?.[String(booking.id)];

    if (!existingReview?.id) {
      setReviewSuccess("Could not find the review to edit.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }

    try {
      const data = await updateReview(existingReview.id, {
        rating: Number(rating || existingReview.rating || 5),
        review_text: text,
      });
      const savedReview = data?.review || { ...existingReview, rating: Number(rating || 5), review_text: text };
      const next = (reviewsByBarber[booking.barberId] || []).map((item) =>
        String(item.id) === String(savedReview.id) ? savedReview : item
      );
      setReviewsByBarber((prev) => ({ ...prev, [booking.barberId]: next }));
      writeStored("reviews", String(booking.barberId), next);
      setReviewSuccess("Review updated.");
    } catch (error) {
      setReviewSuccess(error.message || "Could not update review.");
    }
    setTimeout(() => setReviewSuccess(""), 2200);
  };

  const deleteBookingReview = async (booking) => {
    if (!booking?.id || !booking?.barberId) return;
    const existingReview =
      (reviewsByBarber[booking.barberId] || []).find(
        (item) => String(item.booking_id || item.bookingId) === String(booking.id)
      ) || reviewedBookings?.[String(booking.id)];

    if (!existingReview?.id) {
      setReviewSuccess("Could not find the review to delete.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }

    try {
      await deleteReview(existingReview.id);
      const next = (reviewsByBarber[booking.barberId] || []).filter(
        (item) => String(item.id) !== String(existingReview.id)
      );
      setReviewsByBarber((prev) => ({ ...prev, [booking.barberId]: next }));
      writeStored("reviews", String(booking.barberId), next);

      const nextReviewed = { ...(reviewedBookings || {}) };
      delete nextReviewed[String(booking.id)];
      setReviewedBookings(nextReviewed);
      writeStored("reviewedBookings", currentUser.username, nextReviewed);
      setReviewSuccess("Review deleted.");
    } catch (error) {
      setReviewSuccess(error.message || "Could not delete review.");
    }
    setTimeout(() => setReviewSuccess(""), 2200);
  };

  const sendMessage = async () => {
    if (!selectedBarber?.id || !chatText.trim() || !currentUser?.username || !chatCustomerUsername) {
      return;
    }

    const isSelfMessage =
      selectedBarber.ownerUsername === currentUser.username &&
      chatCustomerUsername === currentUser.username;

    if (isSelfMessage) {
      setChatError("You cannot message yourself.");
      setChatStatus("");
      return;
    }

    const scope = `${selectedBarber.id}:${chatCustomerUsername}`;

    try {
      setChatError("");
      setChatStatus("Sending...");

      const data = await createMessage({
        barberId: selectedBarber.id,
        barberName: selectedBarber.business_name,
        customerUsername: chatCustomerUsername,
        sender: currentUser.username,
        text: chatText.trim(),
      });

      const next = [...messages, data];
      setMessages(next);
      writeStored("messages", scope, next);
      setChatText("");
      setChatStatus("Sent ✓");
      emitTyping("");
      vibrate(8);
      showSystemToast("Message sent", "Your message was delivered.", "message");

      if (socketRef.current) {
        const recipient =
          effectiveIsBarber
            ? chatCustomerUsername
            : selectedBarber.ownerUsername || chatCustomerUsername;

        socketRef.current.emit("send_message", {
          to: recipient,
          message: {
            ...data,
            barberId: selectedBarber.id,
            barberName: selectedBarber.business_name,
            barberOwnerUsername: selectedBarber.ownerUsername || "",
            customerUsername: chatCustomerUsername,
            customerName:
              effectiveIsBarber
                ? chatTargetName || chatCustomerUsername
                : profile.fullName || currentUser.username,
            createdAt: data?.createdAt || new Date().toISOString(),
          },
        });

        socketRef.current.emit("send_notification", {
          to: recipient,
          notification: {
            id: makeId("ntf"),
            user: recipient,
            type: "message",
            barberId: selectedBarber.id,
            barberName: selectedBarber.business_name,
            barberOwnerUsername: selectedBarber.ownerUsername || "",
            customerUsername: chatCustomerUsername,
            customerName:
              effectiveIsBarber
                ? chatTargetName || chatCustomerUsername
                : profile.fullName || currentUser.username,
            targetName: selectedBarber.business_name,
            title: "New message",
            message:
              effectiveIsBarber
                ? `${selectedBarber.business_name} sent you a message.`
                : `${currentUser.username} sent you a message.`,
            createdAt: data?.createdAt || new Date().toISOString(),
            read: false,
          },
        });
      }

      fetchMessages(selectedBarber.id, chatCustomerUsername);
      fetchNotifications();

      setTimeout(() => {
        setChatStatus("");
      }, 1600);
    } catch (error) {
      const localMessage = {
        id: makeId("msg"),
        barberId: selectedBarber.id,
        barberName: selectedBarber.business_name,
        customerUsername: chatCustomerUsername,
        sender: currentUser.username,
        text: chatText.trim(),
        createdAt: new Date().toISOString(),
      };
      const next = uniqueById([...messages, localMessage]).sort(
        (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      );
      setMessages(next);
      writeStored("messages", scope, next);

      const recipient =
        effectiveIsBarber
          ? chatCustomerUsername
          : selectedBarber.ownerUsername || chatCustomerUsername;

      const notificationPayload = {
        id: makeId("ntf"),
        user: recipient,
        type: "message",
        barberId: selectedBarber.id,
        barberName: selectedBarber.business_name,
        barberOwnerUsername: selectedBarber.ownerUsername || "",
        customerUsername: chatCustomerUsername,
        customerName:
          effectiveIsBarber
            ? chatTargetName || chatCustomerUsername
            : profile.fullName || currentUser.username,
        targetName: selectedBarber.business_name,
        title: "New message",
        message:
          effectiveIsBarber
            ? `${selectedBarber.business_name} sent you a message.`
            : `${currentUser.username} sent you a message.`,
        createdAt: localMessage.createdAt,
        read: false,
      };

      if (selectedBarber.ownerUsername && currentUser.username !== selectedBarber.ownerUsername) {
        appendStored("notifications", `barber-${selectedBarber.id}`, notificationPayload);
      } else {
        appendStored("notifications", chatCustomerUsername, notificationPayload);
      }

      if (socketRef.current) {
        socketRef.current.emit("send_message", {
          to: recipient,
          message: {
            ...localMessage,
            barberOwnerUsername: selectedBarber.ownerUsername || "",
            customerName:
              effectiveIsBarber
                ? chatTargetName || chatCustomerUsername
                : profile.fullName || currentUser.username,
          },
        });
        socketRef.current.emit("send_notification", {
          to: recipient,
          notification: notificationPayload,
        });
      }
      setChatText("");
      setChatStatus("Sent ✓");
      fetchMessages(selectedBarber.id, chatCustomerUsername);
      setTimeout(() => setChatStatus(""), 1600);
    }
  };

  const logout = (message = "") => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    clearAuthSession();
    setToken("");
    setSessionExpiresAt(null);
    setCurrentUser(null);
    setQuery("");
    setSelectedFilter("All");
    setSelectedCategory("All");
    setNotifications([]);
    setMessages([]);
    setBookings([]);
    setFavorites([]);
    setSelectedBarber(null);
    setActiveTab("home");
    setAuthMode("login");
    setScreen("login");
    setActiveTab("home");
    setShowBookingModal(false);
    setShowBarberProfile(false);
    setShowRegisterBarber(false);
    setShowNotifications(false);
    setShowEditBarber(false);
    setShowChat(false);
    setShowAccountMenu(false);
    clearAuthMessages();
    window.history.replaceState({}, "", appPath(LOGIN_PATH));
    if (message) {
      setAuthError(message);
    }
  };

  useEffect(() => {
    const unauthorizedListener = (event) => {
      logout(event?.detail?.message || "Session expired. Please log in again.");
    };

    window.addEventListener("lineup:unauthorized", unauthorizedListener);
    return () => window.removeEventListener("lineup:unauthorized", unauthorizedListener);
  }, []);

  useEffect(() => {
    if (!token || String(token).startsWith("local-")) return undefined;

    const expiry = readSessionExpiry(token);
    setSessionExpiresAt(expiry);

    if (!expiry) return undefined;

    const msUntilExpiry = new Date(expiry).getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      logout("Session expired. Please log in again.");
      return undefined;
    }

    const timer = window.setTimeout(() => {
      logout("Session expired. Please log in again.");
    }, msUntilExpiry);

    return () => window.clearTimeout(timer);
  }, [token]);

  const enrichedBarbers = useMemo(() => {
    const seen = new Set();

    return barbers
      .map((barber, index) => {
        const normalized = normalizeBarber(barber, index);
        const reviews = reviewsByBarber[normalized.id] || [];
        const rating = getAverageRating(reviews);
        const distance =
          userLocation && normalized.latitude && normalized.longitude
            ? formatDistance(
                haversineDistance(
                  userLocation.latitude,
                  userLocation.longitude,
                  Number(normalized.latitude),
                  Number(normalized.longitude)
                )
              )
            : `${index + 2} km away`;

        return {
          ...normalized,
          rating,
          reviews,
          reviewCount: reviews.length,
          image: normalized.image || fallbackStandIcon,
          gallery: [normalized.image || fallbackStandIcon, ...DEFAULT_IMAGE_SET].slice(0, 3),
          distance,
          isFavorite: favorites.includes(Number(normalized.id)),
        };
      })
      .filter((barber) => {
        const key = `${Number(barber.id)}|${(barber.ownerUsername || '').toLowerCase()}|${(barber.business_name || '').toLowerCase()}|${(barber.location || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [barbers, reviewsByBarber, favorites, userLocation]);

  const filteredBarbers = useMemo(() => {
    let items = enrichedBarbers.filter((barber) => {
      if (!isPublicProvider(barber)) return false;
      const q = query.toLowerCase();
      return (
        barber.business_name.toLowerCase().includes(q) ||
        (barber.business_type || "").toLowerCase().includes(q) ||
        (barber.intro_text || "").toLowerCase().includes(q) ||
        (barber.ownerUsername || "").toLowerCase().includes(q) ||
        (barber.location || "").toLowerCase().includes(q) ||
        (barber.services || []).some((service) =>
          `${service.service_name || service.name || service.title || service} ${service.category || ""} ${service.description || ""}`.toLowerCase().includes(q)
        )
      );
    });

    if (selectedCategory !== "All") {
      items = items.filter((barber) =>
        (barber.services || []).some((service) => serviceMatchesCategory(service, selectedCategory))
      );
    }

    if (selectedFilter === "Top Rated") {
      items = items.filter((item) => item.reviewCount > 0 && item.rating >= 4);
    }

    if (selectedFilter === "Nearby" && userLocation) {
      items = [...items].sort((a, b) => {
        const aKm = haversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          Number(a.latitude),
          Number(a.longitude)
        );
        const bKm = haversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          Number(b.latitude),
          Number(b.longitude)
        );
        return aKm - bKm;
      });
    }

    if (selectedFilter === "Open Now") {
      items = items.filter((item) => isBusinessOpenNow(item));
    }

    if (selectedFilter === "Customer Location") {
      items = items.filter(
        (item) =>
          Number(item.home_service_enabled || item.subscription?.features?.homeServiceEnabled || 0) === 1 ||
          (item.services || []).some((service) => service.location_type === "customer_location")
      );
    }

    if (selectedFilter === "Verified") {
      items = items.filter((item) =>
        ["verified", "certified"].includes(String(item.verified || item.verified_status || "").toLowerCase())
      );
    }

    if (selectedFilter === "Featured") {
      items = items.filter((item) => item.featured || item.subscription?.features?.homepageFeatured);
    }

    return [...items].sort((a, b) => {
      const tierDiff =
        Number(b.subscription?.features?.rankingWeight || 0) -
        Number(a.subscription?.features?.rankingWeight || 0);
      if (tierDiff !== 0) return tierDiff;
      const featuredDiff =
        Number(Boolean(b.subscription?.features?.homepageFeatured)) -
        Number(Boolean(a.subscription?.features?.homepageFeatured));
      if (featuredDiff !== 0) return featuredDiff;
      return Number(b.rating || 0) - Number(a.rating || 0);
    });
  }, [enrichedBarbers, query, selectedCategory, selectedFilter, userLocation]);

  const myBarberProfile = useMemo(() => {
    if (!currentUser?.username) return null;
    return enrichedBarbers.find((item) => String(item.ownerUsername || "") === String(currentUser.username || "")) || null;
  }, [enrichedBarbers, currentUser]);

  const favoriteBarbers = useMemo(
    () => enrichedBarbers.filter((barber) => isPublicProvider(barber) && favorites.includes(Number(barber.id))),
    [enrichedBarbers, favorites]
  );

  const activeConfirmationProvider = useMemo(() => {
    if (!activeConfirmationBooking) return null;
    return (
      enrichedBarbers.find((item) => String(item.id) === String(activeConfirmationBooking.barberId || "")) ||
      enrichedBarbers.find((item) => String(item.business_name || "") === String(activeConfirmationBooking.barberName || "")) ||
      null
    );
  }, [activeConfirmationBooking, enrichedBarbers]);

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.read),
    [notifications]
  );

  const unreadMessages = useMemo(
    () =>
      messages.filter((item) => {
        const sender = String(item.sender || item.from || item.senderUsername || "");
        const recipient = String(item.recipient || item.to || item.recipientUsername || item.customerUsername || "");
        const fromCurrentUser = sender && sender === String(currentUser?.username || "");
        const addressedToCurrentUser = !recipient || recipient === String(currentUser?.username || "");
        const hasUnreadFlag = item.unread === true || item.read === false || item.status === "unread";
        return Boolean(sender) && !fromCurrentUser && addressedToCurrentUser && hasUnreadFlag;
      }).length,
    [messages, currentUser]
  );

  const profileImage = useMemo(
    () =>
      getFirstValue(
        currentUser?.profile_photo,
        currentUser?.profilePhoto,
        currentUser?.profileImage,
        currentUser?.avatar_url,
        currentUser?.photoURL,
        profile?.image,
        profile?.profilePhoto,
        profile?.profile_photo_url
      ) || "",
    [currentUser, profile]
  );

  const profileInitials = useMemo(
    () => getInitials(profile?.fullName, currentUser?.fullName, currentUser?.name, profile?.email, currentUser?.email, currentUser?.username),
    [currentUser, profile]
  );

  const blockingBookings = useMemo(() => {
    if (!selectedBarber?.id || !selectedDate) return [];

    const serverBookings = Array.isArray(barberDayAvailability?.bookings)
      ? barberDayAvailability.bookings.map((item) => ({
          id: item.id,
          time: item.booking_time,
          serviceDurationMinutes: item.service_duration_minutes || 30,
          status: item.status,
          teamMemberId: item.team_member_id || null,
        }))
      : [];

    const localBookings = bookings
      .filter(
        (item) =>
          Number(item.barberId) === Number(selectedBarber.id) &&
          (!selectedTeamMemberId || String(item.teamMemberId || "") === String(selectedTeamMemberId)) &&
          item.dateValue === selectedDate &&
          ["pending", "confirmed"].includes(String(item.status || "").toLowerCase())
      )
      .map((item) => ({
        id: item.id,
        time: item.time,
        serviceDurationMinutes: item.serviceDurationMinutes || 30,
        status: item.status,
        teamMemberId: item.teamMemberId || null,
      }));

    return uniqueById([...serverBookings, ...localBookings]);
  }, [barberDayAvailability, bookings, selectedBarber, selectedDate, selectedTeamMemberId]);

  const availableTimeSlots = useAvailableTimeSlots({
    timeOptions,
    blockingBookings,
    selectedDate,
    selectedBarber,
    selectedService,
    selectedTime,
    setSelectedTime,
    getServices: getBarberServices,
    rangesOverlap: timeRangesOverlap,
  });

  const bookingCooldownInfo = useMemo(
    () => getBookingCooldownInfo(bookings, currentUser, selectedBarber),
    [bookings, currentUser, selectedBarber]
  );

  const topBarbers = filteredBarbers.slice(0, 2);

  const emitTyping = (value) => {
    if (!socketRef.current || !selectedBarber?.id || !chatCustomerUsername || !currentUser?.username) return;

    const recipient =
      effectiveIsBarber
        ? chatCustomerUsername
        : selectedBarber.ownerUsername || chatCustomerUsername;

    const payload = {
      barberId: selectedBarber.id,
      customerUsername: chatCustomerUsername,
      name:
        effectiveIsBarber
          ? myBarberProfile?.business_name || currentUser.username
          : profile.fullName || currentUser.username,
    };

    if (String(value || "").trim()) {
      socketRef.current.emit("typing", { to: recipient, payload });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit("stop_typing", { to: recipient, payload });
      }, 1200);
    } else {
      socketRef.current.emit("stop_typing", { to: recipient, payload });
    }
  };

  const handleNotificationOpen = async (notification) => {
    if (!notification) return;

    if (notification.id) {
      await markNotificationRead(notification.id);
    }

    setNotificationToast(null);
    setShowNotifications(false);

    const notificationType = String(notification.type || "").toLowerCase();
    const notificationTitle = String(notification.title || "").toLowerCase();

    if (notificationType === "message" || notificationTitle.includes("message")) {
      const barberCandidate =
        enrichedBarbers.find((item) => String(item.id) === String(notification.barberId || "")) ||
        enrichedBarbers.find(
          (item) =>
            String(item.ownerUsername || "") === String(notification.barberOwnerUsername || "") ||
            String(item.business_name || "").toLowerCase() === String(notification.barberName || "").toLowerCase()
        ) ||
        (currentUser?.username
          ? enrichedBarbers.find((item) => String(item.ownerUsername || "") !== String(currentUser.username || ""))
          : null) ||
        myBarberProfile ||
        selectedBarber;

      if (barberCandidate) {
        openConversation({
          barber: barberCandidate,
          customerUsername:
            effectiveIsBarber
              ? notification.customerUsername || chatCustomerUsername || ""
              : currentUser?.username || notification.customerUsername || "",
          targetName:
            effectiveIsBarber
        ? notification.customerName || notification.customerUsername || "Customer"
              : notification.targetName || notification.barberName || barberCandidate.business_name,
        });
        setActiveTab("home");
        return;
      }

      setShowChat(true);
      setActiveTab("home");
      return;
    }

    if (notificationType === "booking" || notificationTitle.includes("booking")) {
      setActiveTab(effectiveIsBarber ? "dashboard" : "bookings");
      return;
    }

    if (notificationType === "system") {
      if ((notification.title || "").toLowerCase().includes("business profile")) {
        setActiveTab(effectiveIsBarber ? "dashboard" : "profile");
        return;
      }
      setActiveTab("profile");
      return;
    }

    setActiveTab("bookings");
  };

  const handleAccountMenuNavigate = (target) => {
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowChat(false);
    setShowNotifications(false);
    setShowRegisterBarber(false);
    setShowEditBarber(false);
    setAccountMessage("");

    if (target === "admin" && !isAdmin) {
      setActiveTab("home");
      return;
    }

    if ((target === "dashboard" || target === "reports") && !effectiveIsBarber) {
      setActiveTab("profile");
      return;
    }

    if (target === "admin" && isAdmin) {
      setPreviousMobileView(activeTab === "admin" ? "home" : activeTab || "home");
    }

    setActiveTab(target);
  };

  const exitAdminAccess = (target = "home") => {
    setShowAccountMenu(false);
    setShowNotifications(false);
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    setPreviousMobileView("home");
    setActiveTab(target);
    window.history.replaceState({}, "", appPath(APP_PATH));
  };

  const subscriptionTier = String(subscriptionState?.tier || "").toUpperCase();
  const trialAccessExpired =
    effectiveIsBarber &&
    !isAdmin &&
    screen === "app" &&
    subscriptionReady &&
    !subscriptionLoading &&
    !subscriptionState?.is_trial &&
    (subscriptionTier === "LOCKED" || subscriptionState?.status === "trial_expired");
  const showTrialUpgradeScreen = trialAccessExpired && !trialUpgradeDismissed;
  const openUpgradePlan = (tier = "") => {
    const normalized = normalizeProviderPlan(tier);
    setUpgradeSelectedTier(normalized || normalizeProviderPlan(myBarberProfile?.selected_plan || myBarberProfile?.subscription_tier || subscriptionState?.tier) || "");
    setPreviousMobileView(activeTab || "profile");
    if (stripAppBasePath(window.location.pathname) !== UPGRADE_PATH) {
      window.history.pushState({}, "", appPath(UPGRADE_PATH));
    }
    setActiveTab("upgrade");
  };

  const closeUpgradePlan = () => {
    const fallbackTab = previousMobileView === "upgrade" ? (effectiveIsBarber ? "dashboard" : "profile") : previousMobileView || (effectiveIsBarber ? "dashboard" : "profile");
    const logicalPath = stripAppBasePath(window.location.pathname);
    if (logicalPath === UPGRADE_PATH || logicalPath === LEGACY_UPGRADE_PATH) {
      window.history.pushState({}, "", appPath(APP_PATH));
    }
    setActiveTab(fallbackTab);
  };

  const submitQuoteRequest = (payload) => {
    if (!currentUser?.username || !selectedBarber) return;
    const quoteRequest = {
      id: makeId("quote"),
      customerUsername: currentUser.username,
      providerId: selectedBarber.id,
      providerName: selectedBarber.business_name,
      serviceId: payload.serviceId,
      serviceName: payload.serviceName,
      description: payload.description,
      budget: payload.budget,
      preferredDate: payload.preferredDate,
      location: payload.location,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    appendStored("quote_requests", currentUser.username, quoteRequest);
    if (selectedBarber.ownerUsername) {
      appendStored("quote_requests", selectedBarber.ownerUsername, quoteRequest);
    }
    showSystemToast("Quote request sent", `${selectedBarber.business_name} can respond with price and availability.`, "booking");
    setShowQuoteModal(false);
    setShowBarberProfile(false);
    setActiveTab("bookings");
  };

  const openProviderProfile = (provider) => {
    if (!provider) return;
    const isOwner = currentUser?.username && String(provider.ownerUsername || "") === String(currentUser.username);
    if (!isOwner && !isPublicProvider(provider)) {
      setGlobalError("This business is not available yet.");
      setShowBarberProfile(false);
      setSelectedBarber(null);
      return;
    }
    setSelectedBarber(provider);
    setShowBarberProfile(true);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    setMapState((prev) => ({ ...prev, show: false }));
  };

  const openSearchResults = (value, locationOverride) => {
    const cleanQuery = String(value || "").trim();
    if (!cleanQuery) return false;
    const nextLocation = isUsableSearchLocation(locationOverride)
      ? String(locationOverride).trim()
      : isUsableSearchLocation(locationLabel)
      ? String(locationLabel).trim()
      : "";
    const params = new URLSearchParams();
    params.set("query", cleanQuery);
    if (nextLocation) params.set("location", nextLocation);
    setQuery(cleanQuery);
    setSearchResultsQuery(cleanQuery);
    setSearchResultsLocation(nextLocation);
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    setMapState((prev) => ({ ...prev, show: false }));
    setPreviousMobileView(activeTab || "home");
    window.history.pushState({}, "", appPath(`${SERVICES_PATH}?${params.toString()}`));
    setActiveTab("searchResults");
    return true;
  };

  const openCategoryServices = (category) => {
    const nextCategory = category || "All";
    setSelectedCategory(nextCategory);
    setPreviousMobileView(activeTab === "categoryServices" ? "home" : activeTab || "home");
    setActiveTab("categoryServices");
  };

  const openMarketplaceMap = (category = selectedCategory || "All") => {
    setMapState({
      show: true,
      category: category || "All",
      returnView: activeTab || "home",
    });
    window.history.pushState({}, "", appPath(MAP_PATH));
  };

  const closeMarketplaceMap = () => {
    setMapState((prev) => ({ ...prev, show: false }));
    const returnTab = mapState.returnView && mapState.returnView !== "map" ? mapState.returnView : "home";
    setActiveTab(returnTab);
  };

  const content = (
    <>
      {activeTab !== "bookingConfirmation" && (
      <AppHeader
        theme={theme}
        setTheme={setTheme}
        unreadCount={unreadNotifications.length}
        locationLabel={locationLabel}
        locationMessage={locationMessage}
        locationLoading={locationLoading}
        profileImage={profileImage}
        profileInitials={profileInitials}
        onUseCurrentLocation={requestLocation}
        onManualLocation={changeLocation}
        onClearLocation={clearLocation}
        onOpenMenu={() => {
          setShowAccountMenu((value) => !value);
          setShowNotifications(false);
        }}
        onOpenProfile={() => {
          setShowAccountMenu(false);
          setShowNotifications(false);
          setActiveTab("profile");
        }}
        onOpenNotifications={() => {
          setShowNotifications(true);
          setShowAccountMenu(false);
          fetchNotifications();
        }}
      />
      )}

      {activeTab !== "bookingConfirmation" && (
      <AccountMenu
        show={showAccountMenu}
        isBarber={effectiveIsBarber}
        isAdmin={isAdmin}
        accountName={profile.fullName || currentUser?.username}
          accountType={isAdmin ? "admin" : effectiveIsBarber ? "provider" : "customer"}
        onNavigate={handleAccountMenuNavigate}
        onClose={() => setShowAccountMenu(false)}
        onLogout={logout}
      />
      )}

      <NotificationToast
        toast={notificationToast}
        onOpen={openToastNotification}
        onClose={() => {
          if (notificationToast?.id) {
            setDismissedToastIds((prev) => [
              ...new Set([...prev, String(notificationToast.id)])
            ]);
          }
          setNotificationToast(null);
        }}
      />

      {globalError && <div className="global-error-v4">{globalError}</div>}
      {reviewSuccess && <div className="auth-success">{reviewSuccess}</div>}

      {activeTab === "bookingConfirmation" && (
        <BookingConfirmationScreen
          booking={activeConfirmationBooking}
          provider={activeConfirmationProvider}
          onViewDetails={() => {
            setFocusedBookingId(String(activeConfirmationBooking?.id || ""));
            setConfirmedBooking(activeConfirmationBooking);
            setActiveTab("bookings");
          }}
          onBackHome={() => {
            setConfirmedBooking(null);
            setFocusedBookingId("");
            setActiveTab("home");
          }}
        />
      )}

      {activeTab === "home" && (
        <div className="tab-scene-v5">
          <HomeScreen
            query={query}
            setQuery={setQuery}
            selectedFilter={selectedFilter}
            setSelectedFilter={setSelectedFilter}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            filteredBarbers={filteredBarbers}
            topBarbers={topBarbers}
            selectedBarber={selectedBarber}
            openBarber={openProviderProfile}
            toggleFavorite={toggleFavorite}
            requestLocation={requestLocation}
            locationLabel={locationLabel}
              locationLoading={locationLoading}
              onOpenCategory={openCategoryServices}
              onOpenMap={openMarketplaceMap}
              onSearchSubmit={openSearchResults}
              onBecomeProvider={() => {
                if (effectiveIsBarber) {
                  setActiveTab("dashboard");
                  return;
                }
                setShowRegisterBarber(true);
              }}
              barbersLoading={barbersLoading}
              userLocation={userLocation}
            />
        </div>
      )}

      {activeTab === "categories" && (
        <div className="tab-scene-v5">
          <CategoriesScreen
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            onOpenCategory={openCategoryServices}
          />
        </div>
      )}

      {activeTab === "categoryServices" && (
        <div className="tab-scene-v5">
          <CategoryServicesScreen
            category={selectedCategory}
            providers={enrichedBarbers.filter(isPublicProvider)}
            onBack={() => setActiveTab(previousMobileView === "categoryServices" ? "home" : previousMobileView || "home")}
            onOpenProvider={openProviderProfile}
            onOpenMap={openMarketplaceMap}
          />
        </div>
      )}

      {activeTab === "searchResults" && (
        <div className="tab-scene-v5">
          <SearchResultsScreen
            query={searchResultsQuery || query}
            location={searchResultsLocation}
            providers={enrichedBarbers.filter(isPublicProvider)}
            onBack={() => setActiveTab(previousMobileView === "searchResults" ? "home" : previousMobileView || "home")}
            onOpenProvider={openProviderProfile}
            onOpenCategory={openCategoryServices}
            onOpenMap={openMarketplaceMap}
          />
        </div>
      )}

      {activeTab === "bookings" && (
        <div className="tab-scene-v5">
          <BookingsScreen
          role={effectiveIsBarber ? "barber" : "customer"}
          bookings={bookings}
          completeBooking={(id) => updateBookingStatus(id, "completed")}
          approveBooking={(id) => updateBookingStatus(id, "confirmed")}
          rejectBooking={(id) => updateBookingStatus(id, "rejected")}
          cancelBooking={cancelBooking}
          confirmCashPayment={confirmCashPayment}
          myBarberProfile={myBarberProfile}
          submitReview={submitReview}
          editReview={editBookingReview}
          deleteReview={deleteBookingReview}
          reviewedBookings={reviewedBookings}
          barberMatchesBooking={barberMatchesBooking}
          formatTimeLabel={formatTimeLabel}
          focusBookingId={focusedBookingId}
        />
        </div>
      )}

      {activeTab === "inbox" && (
        <div className="tab-scene-v5">
          <InboxScreen messages={messages} />
        </div>
      )}

      {activeTab === "profile" && (
        <div className="tab-scene-v5">
          <ProfileScreen
          currentUser={currentUser}
          accountType={effectiveIsBarber ? "barber" : "customer"}
          profile={profile}
          setProfile={setProfile}
          saveProfile={saveProfile}
          profileSaving={profileSaving}
          walletState={walletState}
          walletLoading={walletLoading}
          walletMessage={walletMessage}
          bookings={bookings}
          subscriptionState={subscriptionState}
          subscriptionLoading={subscriptionLoading}
          subscriptionMessage={subscriptionMessage}
          pendingSubscriptionPayment={pendingSubscriptionPayment}
          onUpgradeSubscription={startCurrentSubscriptionUpgrade}
          onVerifySubscription={verifyCurrentSubscription}
          onOpenUpgradePlan={openUpgradePlan}
          onRequestWithdrawal={requestCurrentWithdrawal}
          favoriteBarbers={favoriteBarbers}
          myBarberProfile={myBarberProfile}
          onOpenBarber={(barber) => {
            setSelectedBarber(barber);
            setShowBarberProfile(true);
          }}
          onRegisterBarber={() => setShowRegisterBarber(true)}
          onEditBarber={() => {
            setSelectedBarber(myBarberProfile);
            setShowEditBarber(true);
          }}
          onDeleteBarberStand={deleteBarberStand}
          logout={logout}
          phoneCountries={PHONE_COUNTRIES}
          splitPhoneNumber={splitPhoneNumber}
          sanitizeDigits={sanitizeDigits}
          buildPhoneNumber={buildPhoneNumber}
          isValidPhoneNumber={isValidPhoneNumber}
          fileToDataUrl={fileToDataUrl}
          theme={theme}
          setTheme={setTheme}
        />
        </div>
      )}

      {effectiveIsBarber && activeTab === "dashboard" && (
        <div className="tab-scene-v5">
          <DashboardScreen
          barber={myBarberProfile}
          bookings={bookings}
          notifications={notifications.filter((item) => String(item.user).startsWith("barber-") || String(item.user) === String(currentUser?.username || ""))}
          subscription={subscriptionState}
          approveBooking={(id) => updateBookingStatus(id, "confirmed")}
          rejectBooking={(id) => updateBookingStatus(id, "rejected")}
          completeBooking={(id) => updateBookingStatus(id, "completed")}
          confirmCashPayment={confirmCashPayment}
          currentUser={currentUser}
          onOpenConversation={(booking) => openConversation({
            barber: myBarberProfile,
            customerUsername: booking.customerUsername,
            targetName: booking.customerName || booking.customerUsername,
          })}
          onOpenManageStand={() => {
            setSelectedBarber(myBarberProfile);
            setShowEditBarber(true);
          }}
          onOpenReports={() => setActiveTab("reports")}
          onOpenUpgradePlan={openUpgradePlan}
          getBookingsForCalendar={getBookingsForCalendar}
          dateValueToDate={dateValueToDate}
          formatMoney={formatMoney}
          getBadgeLabel={getBadgeLabel}
          formatTimeLabel={formatTimeLabel}
        />
        </div>
      )}

      {effectiveIsBarber && activeTab === "reports" && (
        <div className="tab-scene-v5">
          <ReportsScreen
          barber={myBarberProfile}
          bookings={bookings}
          subscription={subscriptionState}
          reviews={myBarberProfile ? (reviewsByBarber[myBarberProfile.id] || []) : []}
          onUpgradePlan={() => openUpgradePlan("PREMIUM")}
        />
      </div>
      )}

      {isAdmin && (activeTab === "admin" || activeTab === "adminReports") && (
        <div className="tab-scene-v5">
          <AdminPanel
            currentUser={currentUser}
            initialSection={activeTab === "adminReports" ? "reports" : "dashboard"}
            onBackToApp={() => exitAdminAccess(previousMobileView === "admin" ? "home" : previousMobileView || "home")}
            onGoDashboard={() => exitAdminAccess("home")}
          />
        </div>
      )}

      {activeTab === "settings" && (
        <div className="tab-scene-v5">
          <SettingsScreen
            currentUser={currentUser}
            accountType={effectiveIsBarber ? "barber" : "customer"}
            profile={profile}
            onUpdateAccount={updateCurrentAccount}
            accountLoading={accountLoading}
            accountMessage={accountMessage}
            sessionExpiresAt={sessionExpiresAt}
          />
        </div>
      )}

      {activeTab !== "bookingConfirmation" && (
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isBarber={effectiveIsBarber}
        isAdmin={isAdmin}
        currentUser={currentUser}
        unreadMessages={unreadMessages}
        isOverlayOpen={activeTab === "upgrade" || showTrialUpgradeScreen || mapState.show || showBarberProfile || showBookingModal || showQuoteModal || showChat || showRegisterBarber || showEditBarber || showNotifications || showAccountMenu}
      />
      )}

      <MarketplaceMapOverlay
        show={mapState.show}
        theme={theme}
        category={mapState.category}
        providers={mapState.category && mapState.category !== "All" ? enrichedBarbers.filter(isPublicProvider) : filteredBarbers.length ? filteredBarbers : enrichedBarbers.filter(isPublicProvider)}
        userLocation={userLocation}
        locationLabel={locationLabel}
        locationMessage={locationMessage}
        locationLoading={locationLoading}
        unreadCount={unreadNotifications.length}
        onClose={closeMarketplaceMap}
        onOpenNotifications={() => {
          setShowNotifications(true);
          fetchNotifications();
        }}
        onUseCurrentLocation={requestLocation}
        onManualLocation={changeLocation}
        onRefreshProviders={fetchBarbers}
        onOpenProvider={openProviderProfile}
      />

      <BarberProfileSheet
        show={showBarberProfile}
        barber={selectedBarber ? { ...selectedBarber, reviews: reviewsByBarber[selectedBarber.id] || [], reviewCount: (reviewsByBarber[selectedBarber.id] || []).length, rating: getAverageRating(reviewsByBarber[selectedBarber.id] || []) } : selectedBarber}
        currentUser={currentUser}
        currentUserIsBarber={effectiveIsBarber}
        fallbackImage={fallbackStandIcon}
        onClose={() => setShowBarberProfile(false)}
        onToggleFavorite={toggleFavorite}
        onBook={() => {
          setShowBookingModal(true);
          setShowChat(false);
          setShowQuoteModal(false);
        }}
        onRequestQuote={() => {
          setShowQuoteModal(true);
          setShowBookingModal(false);
          setShowChat(false);
        }}
        onOpenChat={() => openConversation({
          barber: selectedBarber,
          customerUsername: currentUser?.username || "",
          targetName: selectedBarber?.business_name || "Provider",
        })}
      />

      <BookingModal
        show={showBookingModal}
        barber={selectedBarber}
        dateOptions={dateOptions}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        timeSlots={availableTimeSlots}
        selectedService={selectedService}
        setSelectedService={setSelectedService}
        selectedTeamMemberId={selectedTeamMemberId}
        setSelectedTeamMemberId={setSelectedTeamMemberId}
        selectedPaymentMethod={selectedPaymentMethod}
        setSelectedPaymentMethod={setSelectedPaymentMethod}
        paymentPhone={mtnPaymentPhone}
        setPaymentPhone={setMtnPaymentPhone}
        pendingPayment={pendingBookingPayment}
        onVerifyPayment={verifyCurrentBookingPayment}
        onClose={() => setShowBookingModal(false)}
        onConfirm={createBooking}
        creatingBooking={creatingBooking}
        bookingCooldownInfo={bookingCooldownInfo}
      />

      <QuoteRequestModal
        show={showQuoteModal}
        provider={selectedBarber}
        onClose={() => setShowQuoteModal(false)}
        onSubmit={submitQuoteRequest}
      />

      <ChatSheet
        show={showChat}
        barber={selectedBarber}
        messages={messages}
        currentUser={currentUser}
        chatText={chatText}
        setChatText={setChatText}
        targetName={chatTargetName}
        chatStatus={chatStatus}
        chatError={chatError}
        typingState={typingState}
        onTyping={emitTyping}
        onSend={sendMessage}
        chatThreadRef={chatThreadRef}
        onClose={() => {
          setShowChat(false);
          setChatError("");
          setChatStatus("");
          setTypingState({ active: false, name: "" });
        }}
      />

{showNotifications && (
        <NotificationSheet
          show={showNotifications}
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onOpenNotification={handleNotificationOpen}
          onMarkRead={markNotificationRead}
          onMarkAllRead={markAllNotificationsRead}
        />
      )}

      <EditBarberModal
        show={showEditBarber}
        barber={myBarberProfile}
        onClose={() => setShowEditBarber(false)}
        onSubmit={updateBarberStand}
      />

      <RegisterBarberModal
        show={showRegisterBarber}
        profile={profile}
        onClose={() => setShowRegisterBarber(false)}
        onSubmit={registerBarber}
      />

      {(showTrialUpgradeScreen || activeTab === "upgrade") && (
        <TrialUpgradeScreen
          barber={myBarberProfile}
          bookings={bookings}
          reviews={myBarberProfile ? reviewsByBarber[myBarberProfile.id] || [] : []}
          subscription={subscriptionState}
          pendingPayment={pendingSubscriptionPayment}
          loading={subscriptionLoading}
          message={subscriptionMessage}
          onUpgrade={startCurrentSubscriptionUpgrade}
          onVerify={verifyCurrentSubscription}
          initialSelectedTier={showTrialUpgradeScreen ? (normalizeProviderPlan(myBarberProfile?.selected_plan || subscriptionState?.tier) || "PRO") : upgradeSelectedTier}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onClose={() => {
            if (showTrialUpgradeScreen) {
              dismissTrialUpgrade(effectiveIsBarber ? "dashboard" : "profile");
              return;
            }
            closeUpgradePlan();
          }}
          onChooseLater={() => {
            if (showTrialUpgradeScreen) {
              dismissTrialUpgrade(effectiveIsBarber ? "dashboard" : "profile");
              return;
            }
            closeUpgradePlan();
          }}
        />
      )}
    </>
  );

  const appContent = content;

  const isAuthScreen = screen === "login";

  return (
    <div className={`app-wrap-v4 ${theme} ${isAuthScreen ? "app-auth-v4" : ""}`}>
      <div className={`phone-frame-v4 ${isAuthScreen ? "phone-frame-auth-v4" : ""}`}>
        <div className={`screen-v4 ${isAuthScreen ? "screen-auth-v4" : ""}`}>
          <Suspense fallback={<div className="content-v4 standard-page-v4">Loading...</div>}>
            {screen === "login" ? (
              <AuthScreen
                authMode={authMode}
                setAuthMode={setAuthMode}
                authError={authError}
                authSuccess={authSuccess}
                authLoading={authLoading}
                usernameRef={usernameRef}
                emailRef={emailRef}
                passwordRef={passwordRef}
                confirmPasswordRef={confirmPasswordRef}
                handleLogin={handleLogin}
                handleRegister={handleRegister}
                sendPasswordResetCode={sendPasswordResetCode}
                handlePasswordReset={handlePasswordReset}
                clearAuthMessages={clearAuthMessages}
              />
            ) : (
              appContent
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default App;
