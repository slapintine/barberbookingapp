import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";
import "./App.css";
import logo from "./assets/queless-logo-icon.png";
import { resolveProviderImage, NEUTRAL_PLACEHOLDER } from "./utils/providerImage.js";
import { sanitizeErrorMessage } from "./utils/errorMessages.js";
import { confirmPasswordReset, getMe, loginUser, logoutUser, registerUser, requestPasswordReset, updateAccount } from "./api/authApi.js";
import { deleteMyBarberStand, getBarbers, getMyBarberStand, publishMyBarberStand, registerBarberStand, updateMyBarberStand } from "./api/barbersApi.js";
import {
  confirmCashPaymentRequest,
  createBookingRequest,
  getMyBookings,
  rescheduleBookingRequest,
  updateBookingStatusRequest,
  verifyBookingPaymentRequest,
} from "./api/bookingsApi.js";
import { createMessage, getMessages } from "./api/chatApi.js";
import { createQuoteRequest, getMyQuoteRequests } from "./api/quoteRequestsApi.js";
import { addFavorite, getFavorites as getFavoriteRows, removeFavorite } from "./api/favoritesApi.js";
import { getNotifications, markNotificationReadRequest } from "./api/notificationsApi.js";
import { getProfile, saveProfileRequest } from "./api/profilesApi.js";
import { createReview, deleteReview, getBarberReviews, getManagedBarberReviews, getMyReviews, setReviewPublicBlock, updateReview } from "./api/reviewsApi.js";
import { getGeolocationErrorMessage, reverseGeocodeCoordinates } from "./utils/locationUtils.js";
import { getMySubscription, startSubscriptionUpgrade, verifySubscriptionUpgrade } from "./api/subscriptionsApi.js";
import {
  getMyCustomerSubscription,
  startCustomerSubscriptionUpgrade,
  verifyCustomerSubscriptionUpgrade,
} from "./api/customerSubscriptionsApi.js";
import { getSubscriptionSummary } from "./api/subscriptionSummaryApi.js";
import { normalizeProviderData } from "./utils/providerData.js";
import { buildStandDraftUpdatePayload } from "./utils/standDraftPayload.js";
import { getCustomerWallet, getMyWallet, requestWalletWithdrawal } from "./api/walletApi.js";
import AppHeader from "./components/ui/AppHeader.jsx";
import AccountMenu from "./components/ui/AccountMenu.jsx";
import BottomNav from "./components/ui/BottomNav.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import PaymentFlowModal from "./components/payments/PaymentFlowModal.jsx";
import ProviderDiscoveryMapOverlay from "./components/service-discovery/ProviderDiscoveryMapOverlay.jsx";
import ProviderProfileSkeleton from "./features/barbers/ProviderProfileSkeleton.jsx";
import OverlayErrorBoundary from "./components/OverlayErrorBoundary.jsx";
import PageErrorBoundary from "./components/PageErrorBoundary.jsx";
import { NotificationSheet, NotificationToast } from "./features/notifications/Notifications.jsx";
import { apiFetch, getAuthToken, getRefreshToken, SOCKET_URL } from "./config/api.js";
import { listenForForegroundNotifications } from "./pushNotifications.js";
import { getMtnReadiness, getMtnUnavailableMessage } from "./utils/paymentReadiness.js";
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
import { normalizeAppBasePath } from "./utils/appBasePath.js";
import {
  DEFAULT_SERVICE_TYPES,
  getAvailableServices,
  normalizeServiceForBooking,
  serviceMatchesCategory,
} from "./utils/serviceCatalog.js";
import { DEFAULT_CUSTOMER_SUBSCRIPTION_STATE, isCustomerPremiumActive } from "./utils/customerPremium.js";
import { resolveEntitlements } from "./utils/entitlements.js";
import { isPublicServiceProvider } from "./utils/providerDiscovery.js";
import { CUSTOMER_PREMIUM_PLAN } from "./utils/subscriptionPlans.js";
import {
  MOBILE_MONEY_COMING_SOON_MESSAGE,
  PARTIAL_PROMO_COMING_SOON_MESSAGE,
  PAYMENTS_COMING_SOON_MESSAGE,
  PAYMENTS_ENABLED,
  WALLET_PAYMENTS_COMING_SOON_MESSAGE,
} from "./utils/launchFlags.js";

// Provider profile is created as a retryable lazy inside the component (keyed by
// a retry counter) so a failed chunk import can be re-attempted in place.
const importBarberProfileSheet = () => import("./features/barbers/BarberProfileSheet.jsx");
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
const HelpCenterScreen = lazy(() => import("./pages/HelpCenterPage.jsx"));
const PoliciesScreen = lazy(() => import("./pages/PoliciesPage.jsx"));
const SupportScreen = lazy(() => import("./pages/SupportPage.jsx"));
const AdminPanel = lazy(() => import("./pages/AdminPanel.jsx"));
const BookingModal = lazy(() => import("./features/bookings/BookingModal.jsx"));
const BookingConfirmationScreen = lazy(() => import("./features/bookings/BookingConfirmationScreen.jsx"));
const QuoteRequestModal = lazy(() => import("./features/bookings/QuoteRequestModal.jsx"));
const ChatSheet = lazy(() => import("./features/chat/ChatSheet.jsx"));
const ReportsScreen = lazy(() => import("./features/barbers/ReportsScreen.jsx"));
const ProviderCoachChatScreen = lazy(() => import("./features/barbers/ProviderCoachChatScreen.jsx"));
const SmartMatchPage = lazy(() => import("./features/smart-match/SmartMatchPage.jsx"));
const TrialUpgradeScreen = lazy(() => import("./features/barbers/TrialUpgradeScreen.jsx"));
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

const IMAGE_UPLOAD_LIMIT_MB = 20;
const IMAGE_UPLOAD_LIMIT_BYTES = IMAGE_UPLOAD_LIMIT_MB * 1024 * 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file?.size > IMAGE_UPLOAD_LIMIT_BYTES) {
      reject(new Error("This image is too large. Please upload a smaller image."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function getStoredUsers() {
  const rawUsers = readStored("users", "auth", []);
  const safeUsers = rawUsers.map((user) => {
    const { password, ...safeUser } = user || {};
    return safeUser;
  });
  if (rawUsers.some((user) => Object.prototype.hasOwnProperty.call(user || {}, "password"))) {
    writeStored("users", "auth", safeUsers);
  }
  return safeUsers;
}

function saveStoredUsers(users) {
  return writeStored(
    "users",
    "auth",
    (users || []).map((user) => {
      const { password, ...safeUser } = user || {};
      return safeUser;
    })
  );
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

function mergeBarberListsPreservingLocal(serverBarbers = []) {
  return uniqueById((serverBarbers || []).map(normalizeBarber));
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
    imageUploadLimitMb: 0,
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

const VALID_PROVIDER_PLANS = ["FREE", "PREMIUM", "PLATINUM"];

function normalizeProviderPlan(plan) {
  const normalized = String(plan || "").trim().toUpperCase();
  return VALID_PROVIDER_PLANS.includes(normalized) ? normalized : "";
}

function hasProviderAccess(subscription) {
  const plan = normalizeProviderPlan(subscription?.tier);
  const status = String(subscription?.status || "").toLowerCase();
  return Boolean(plan) && status === "active";
}

function isPublicProvider(barber) {
  return isPublicServiceProvider(barber);
}

const FILTERS = ["All", "Top Rated", "Nearby", "Open Now", "Customer Location", "Verified", "Featured"];

const SERVICE_TYPES = DEFAULT_SERVICE_TYPES;

const DEFAULT_CENTER = [0.3136, 32.5811];
const LOCATION_STORAGE_KEY = "queless-location";
const APP_BASE_PATH = normalizeAppBasePath(import.meta.env.VITE_BASE_PATH || import.meta.env.BASE_URL);
const APP_ASSET_BASE = import.meta.env.BASE_URL || "/";
const APP_PATH = "/";
const HOME_PATH = "/home";
const CATEGORIES_PATH = "/categories";
const BOOKINGS_PATH = "/bookings";
const INBOX_PATH = "/inbox";
const DASHBOARD_PATH = "/dashboard";
const REPORTS_PATH = "/reports";
const AI_COACH_PATH = "/provider/ai-coach";
const PROFILE_PATH = "/profile";
const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/signup";
const REGISTER_PATH = "/register";
const FORGOT_PASSWORD_PATH = "/forgot-password";
const ADMIN_PATH = "/super-admin-access";
const ADMIN_SMS_PATH = "/admin/sms";
const LEGACY_ADMIN_PATH = "/superadminaccess";
const UPGRADE_PATH = "/upgrade";
const LEGACY_UPGRADE_PATH = "/upgrade-plan";
const SERVICES_PATH = "/services";
const MAP_PATH = "/map";
const SMART_MATCH_PATH = "/smart-match";
const HELP_PATH = "/help";
const POLICIES_PATH = "/policies";
const SUPPORT_PATH = "/support";
const BOOKING_CONFIRMATION_PATH = "/booking-confirmed";
const BOOKING_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const BOOKING_REFRESH_FALLBACK_INTERVAL_MS = 2 * 60 * 1000;
const BOOKING_REFRESH_RATE_LIMIT_FALLBACK_MS = 5 * 60 * 1000;
const BOOKING_REFRESH_MAX_BACKOFF_MS = 15 * 60 * 1000;
const BOOKING_ONLINE_PAYMENTS_ENABLED =
  PAYMENTS_ENABLED && String(import.meta.env.VITE_BOOKING_ONLINE_PAYMENTS_ENABLED || "").toLowerCase() === "true";
const ADMIN_ROLES = new Set(["admin", "superadmin", "super_admin", "super-admin"]);
const PROVIDER_ROLES = new Set(["barber", "provider", "business", "salon", "spa"]);

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
    normalized === ADMIN_SMS_PATH ||
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
  if (normalized === ADMIN_SMS_PATH) return userIsAdmin(user) ? "adminSms" : "home";
  if (normalized === ADMIN_PATH || normalized === LEGACY_ADMIN_PATH) return userIsAdmin(user) ? "admin" : "home";
  if (normalized === UPGRADE_PATH || normalized === LEGACY_UPGRADE_PATH) return "upgrade";
  if (normalized === MAP_PATH) return "home";
  if (normalized === SMART_MATCH_PATH) return "smartMatch";
  if (normalized === BOOKING_CONFIRMATION_PATH || normalized.startsWith(`${BOOKING_CONFIRMATION_PATH}/`)) return "bookingConfirmation";
  if (normalized === SERVICES_PATH) return "searchResults";
  if (normalized === HELP_PATH) return "help";
  if (normalized === POLICIES_PATH) return "policies";
  if (normalized === SUPPORT_PATH) return "support";
  if (normalized === HOME_PATH || normalized === APP_PATH) return "home";
  if (normalized === CATEGORIES_PATH) return "categories";
  if (normalized === BOOKINGS_PATH) return "bookings";
  if (normalized === INBOX_PATH) return "inbox";
  if (normalized === DASHBOARD_PATH) return userIsAdmin(user) ? "admin" : "dashboard";
  if (normalized === REPORTS_PATH) return userIsAdmin(user) ? "adminReports" : "reports";
  if (normalized === AI_COACH_PATH) return userIsAdmin(user) ? "adminReports" : "aiCoach";
  if (normalized === PROFILE_PATH) return "profile";
  return "home";
}

function isAuthRoutePath(pathname) {
  const normalized = stripAppBasePath(pathname);
  return normalized === LOGIN_PATH || normalized === SIGNUP_PATH || normalized === REGISTER_PATH || normalized === FORGOT_PASSWORD_PATH;
}

function getDefaultTabForUser(user = {}) {
  if (userIsAdmin(user)) return "admin";
  if (userIsProvider(user)) return "dashboard";
  return "home";
}

function getPostLoginTab(pathname, user = {}) {
  const normalized = stripAppBasePath(pathname);
  if (!normalized || normalized === APP_PATH || isAuthRoutePath(pathname)) {
    return getDefaultTabForUser(user);
  }

  const requestedTab = getTabFromPath(pathname, user);
  if (requestedTab === "dashboard" && !userIsProvider(user) && !userIsAdmin(user)) return "home";
  if ((requestedTab === "admin" || requestedTab === "adminReports" || requestedTab === "adminSms") && !userIsAdmin(user)) {
    return getDefaultTabForUser(user);
  }
  if ((requestedTab === "reports" || requestedTab === "aiCoach") && !userIsProvider(user)) return getDefaultTabForUser(user);
  return requestedTab || getDefaultTabForUser(user);
}

function getBookingIdFromPath(pathname) {
  const normalized = stripAppBasePath(pathname);
  if (!normalized.startsWith(`${BOOKING_CONFIRMATION_PATH}/`)) return "";
  return decodeURIComponent(normalized.slice(BOOKING_CONFIRMATION_PATH.length + 1));
}

function isAdminPath(pathname) {
  const normalized = stripAppBasePath(pathname);
  return normalized === ADMIN_PATH || normalized === ADMIN_SMS_PATH || normalized === LEGACY_ADMIN_PATH;
}

function getRetryAfterMs(error) {
  const retryAfter = String(error?.retryAfter || "").trim();
  if (!retryAfter) return 0;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
}

function readSearchRouteParams() {
  let params = null;
  try {
    params = new URLSearchParams(window?.location?.search || "");
  } catch (error) {
    console.error("Could not read search route params", error);
  }
  return {
    query: params?.get?.("query") || "",
    location: params?.get?.("location") || "",
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
    return [];
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
    .flatMap((item) => {
      const name = item.trim();
      return name ? [name] : [];
    })
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
    location: item.booking_address || item.bookingAddress || item.location || "",
    bookingLocationType: item.booking_location_type || item.bookingLocationType || "provider_location",
    bookingAddress: item.booking_address || item.bookingAddress || item.location || "",
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
  const canonical = normalizeProviderData(barber, {
    defaultLatitude: DEFAULT_CENTER[0],
    defaultLongitude: DEFAULT_CENTER[1],
  });
  barber = canonical;
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
    stand_type: "individual",
    business_type: String(barber.business_type || barber.businessType || getAvailableServices(barber.services || [])[0]?.category || "Services"),
    map_icon_type: String(barber.map_icon_type || barber.mapIconType || barber.iconCategory || ""),
    home_service_enabled: Number(
      barber.home_service_enabled ??
      barber.homeServiceEnabled ??
      barber.subscription?.features?.homeServiceEnabled ??
      0
    ),
    intro_text: String(barber.intro_text || barber.introText || "").trim(),
    verified: barber.verified || barber.verified_status || barber.badge || fallback.verified,
    verified_status: barber.verified_status || barber.verified || fallback.verified,
    review_status: barber.review_status || "pending_review",
    is_verified: Boolean(barber.is_verified),
    is_suspended: Boolean(barber.is_suspended),
    is_banned: Boolean(barber.is_banned),
    verification_change_reason: barber.verification_change_reason || "",
    moderation_note: barber.moderation_note || "",
    document_name: barber.document_name || barber.verification_document_name || "",
    verification_document_name: barber.verification_document_name || barber.document_name || "",
    verification_notes: barber.verification_notes || "",
    verification_submitted_at: barber.verification_submitted_at || null,
    verification_reviewed_at: barber.verification_reviewed_at || null,
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
              : normalizeServiceForBooking(service, idx, { preserveEmptyTitle: true })
          )
        : [],
    availability:
      barber.availability || {
        start: barber.availability_start || fallback.availability?.start || "08:00",
        end: barber.availability_end || fallback.availability?.end || "20:00",
      },
    phone: barber.phone || fallback.phone || "",
    image: barber.image || fallback.image || "",
    portfolio: Array.isArray(normalizedPortfolio) ? normalizedPortfolio : [],
    gallery:
      Array.isArray(normalizedPortfolio) && normalizedPortfolio.length
        ? normalizedPortfolio
            .flatMap((item) => [item.afterImage, item.beforeImage].filter(Boolean))
            .slice(0, 6)
        : [barber.image || fallback.image].filter(Boolean).slice(0, 3),
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
    blockedFromPublic: Boolean(item.blockedFromPublic || Number(item.blocked_from_public || 0) === 1),
    blockedByUsername: item.blocked_by_username || item.blockedByUsername || "",
    blockedAt: item.blocked_at || item.blockedAt || null,
    blockReason: item.block_reason || item.blockReason || "",
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

function getBookingCreationErrorMessage(error) {
  const message = sanitizeErrorMessage(error, "Could not create booking.");
  if (/booking_details.*(?:must|should).*string/i.test(message)) {
    return "We couldn't submit the extra booking details. Please review them and try again.";
  }
  return message;
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

const LOGIN_ERROR_MESSAGES = {
  USER_NOT_FOUND: "No account found with that username or email.",
  INVALID_PASSWORD: "Incorrect username/email or password.",
  INVALID_CREDENTIALS: "Incorrect username/email or password.",
  ACCOUNT_INACTIVE: "This account is not active. Please contact support or verify your account.",
  ACCOUNT_UNVERIFIED: "This account is not active. Please contact support or verify your account.",
  VALIDATION_ERROR: "",
};

function getLoginErrorMessage(error) {
  if (error?.serverUnavailable || [502, 503, 504].includes(Number(error?.status))) {
    return "We're having trouble connecting to the server. Please try again in a moment.";
  }
  const code = error?.code || error?.payload?.code || "";
  const fallback = "Could not log in. Please check your connection and try again.";
  return sanitizeErrorMessage(
    LOGIN_ERROR_MESSAGES[code] || error?.userMessage || error?.message || fallback,
    fallback
  );
}

function saveAuthSession(token, user, { rememberMe = true, refreshToken = "" } = {}) {
  const storage = rememberMe ? localStorage : sessionStorage;
  const otherStorage = rememberMe ? sessionStorage : localStorage;

  storage.setItem("lineup_token", token || "");
  storage.setItem("lineup_user", JSON.stringify(user));
  storage.setItem("lineup_refresh_token", refreshToken);
  otherStorage.removeItem("lineup_token");
  otherStorage.removeItem("lineup_user");
  otherStorage.removeItem("lineup_token_expires_at");
  otherStorage.removeItem("lineup_refresh_token");

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
  localStorage.removeItem("lineup_refresh_token");
  localStorage.removeItem("cutz_token");
  localStorage.removeItem("cutz_user");
  sessionStorage.removeItem("lineup_token");
  sessionStorage.removeItem("lineup_user");
  sessionStorage.removeItem("lineup_token_expires_at");
  sessionStorage.removeItem("lineup_refresh_token");
  sessionStorage.removeItem("cutz_token");
  sessionStorage.removeItem("cutz_user");
}

function App() {
  const [screen, setScreen] = useState(() => getScreenFromPath(window.location.pathname, Boolean(getAuthToken())));
  const [authMode, setAuthMode] = useState(() => getAuthModeFromPath(window.location.pathname));
  const [theme, setTheme] = useTheme();
  const [showInitialLoadingScreen, setShowInitialLoadingScreen] = useState(true);
  const [token, setToken] = useState(getAuthToken());
  const [currentUser, setCurrentUser] = useState(readAuthUser);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(
    () => localStorage.getItem("lineup_token_expires_at") || sessionStorage.getItem("lineup_token_expires_at") || readSessionExpiry(getAuthToken())
  );
  // False until a stored token has been validated against /auth/me on boot.
  // With no token there is nothing to check, so guests are ready immediately.
  const [sessionChecked, setSessionChecked] = useState(() => !getAuthToken());

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
  const [barbersError, setBarbersError] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
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
  const [subscriptionSummary, setSubscriptionSummary] = useState(null);
  const [customerSubscriptionState, setCustomerSubscriptionState] = useState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
  const [customerSubscriptionPlan, setCustomerSubscriptionPlan] = useState(null);
  const [customerSubscriptionLoading, setCustomerSubscriptionLoading] = useState(false);
  const [customerSubscriptionMessage, setCustomerSubscriptionMessage] = useState("");
  const [pendingCustomerSubscriptionPayment, setPendingCustomerSubscriptionPayment] = useState(null);
  const [customerPremiumPaymentOpen, setCustomerPremiumPaymentOpen] = useState(false);
  const [trialUpgradeDismissed, setTrialUpgradeDismissed] = useState(false);
  const [upgradeSelectedTier, setUpgradeSelectedTier] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [userLocation, setUserLocation] = useState(() => readStoredQuelessLocation()?.coords || null);
  const [locationLabel, setLocationLabel] = useState(() => readStoredQuelessLocation()?.label || "Near you");
  const [locationMessage, setLocationMessage] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [bookingOnlinePaymentsReady, setBookingOnlinePaymentsReady] = useState(false);
  const [bookingPaymentReadinessMessage, setBookingPaymentReadinessMessage] = useState("");
  const [walletTopupReady, setWalletTopupReady] = useState(false);
  const [walletTopupReadinessMessage, setWalletTopupReadinessMessage] = useState("");

  const [selectedBarber, setSelectedBarber] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [smartMatchInitial, setSmartMatchInitial] = useState({});
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const quoteIdempotencyRef = useRef("");
  const [showBarberProfile, setShowBarberProfile] = useState(false);
  const [providerChunkAttempt, setProviderChunkAttempt] = useState(0);
  // Recreate the lazy on each retry so a failed dynamic import is re-attempted
  // rather than re-subscribing to the cached rejected promise.
  const ProviderProfileLazy = useMemo(
    () => lazy(importBarberProfileSheet),
    [providerChunkAttempt]
  );
  const [showRegisterBarber, setShowRegisterBarber] = useState(false);
  const [showEditBarber, setShowEditBarber] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [deleteStandConfirmOpen, setDeleteStandConfirmOpen] = useState(false);
  const [deleteStandLoading, setDeleteStandLoading] = useState(false);
  const [supportTopic, setSupportTopic] = useState("Contact Support");
  const [notificationToast, setNotificationToast] = useState(null);
  const [dismissedToastIds, setDismissedToastIds] = useState([]);

  useEffect(() => {
    const removeTimer = window.setTimeout(() => setShowInitialLoadingScreen(false), 1800);

    return () => {
      window.clearTimeout(removeTimer);
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    async function loadPaymentReadiness() {
      if (!PAYMENTS_ENABLED) {
        setWalletTopupReady(false);
        setWalletTopupReadinessMessage(WALLET_PAYMENTS_COMING_SOON_MESSAGE);
        setBookingOnlinePaymentsReady(false);
        setBookingPaymentReadinessMessage(MOBILE_MONEY_COMING_SOON_MESSAGE);
        return;
      }
      try {
        const health = await apiFetch("/api/payments/mtn/health");
        const readiness = getMtnReadiness(health);
        const ready = readiness.ready;
        if (cancelled) return;
        const unavailableMessage = getMtnUnavailableMessage(readiness.reasonCode);
        if (import.meta.env.DEV && !ready) {
          console.warn("[Queless payments] MTN readiness check did not pass.", {
            apiBaseConfigured: Boolean(import.meta.env.VITE_API_URL),
            reasonCode: readiness.reasonCode,
            serverReachable: health?.serverReachable !== false,
          });
        }
        setWalletTopupReady(ready);
        setWalletTopupReadinessMessage(
          ready ? "MTN Mobile Money is ready for wallet top-ups." : unavailableMessage
        );

        if (!BOOKING_ONLINE_PAYMENTS_ENABLED) {
          setBookingOnlinePaymentsReady(false);
          setBookingPaymentReadinessMessage(getMtnUnavailableMessage("PROVIDER_DISABLED"));
          return;
        }

        setBookingOnlinePaymentsReady(ready);
        setBookingPaymentReadinessMessage(
          ready
            ? "MTN Mobile Money is ready."
            : unavailableMessage
        );
      } catch (error) {
        if (cancelled) return;
        const offlineMessage = getMtnUnavailableMessage("SERVER_UNREACHABLE");
        if (import.meta.env.DEV) {
          console.warn("[Queless payments] Payment status endpoint could not be reached.", {
            apiBaseConfigured: Boolean(import.meta.env.VITE_API_URL),
            browserOffline: typeof navigator !== "undefined" && navigator.onLine === false,
            status: Number(error?.status || 0),
            serverUnavailable: Boolean(error?.serverUnavailable),
          });
        }
        setWalletTopupReady(false);
        setWalletTopupReadinessMessage(offlineMessage);
        setBookingOnlinePaymentsReady(false);
        setBookingPaymentReadinessMessage(offlineMessage);
      }
    }

    loadPaymentReadiness();
    return () => {
      cancelled = true;
    };
  }, []);

  const [chatText, setChatText] = useState("");
  const [chatCustomerUsername, setChatCustomerUsername] = useState("");
  const [chatTargetName, setChatTargetName] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [selectedService, setSelectedService] = useState(SERVICE_TYPES[0].id);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [mtnPaymentPhone, setMtnPaymentPhone] = useState("");

  useEffect(() => {
    if (!["cash", "provider_direct", "mtn_mobile_money", "airtel_money", "wallet_balance", "wallet"].includes(String(selectedPaymentMethod || "").toLowerCase())) {
      setSelectedPaymentMethod("cash");
    }
  }, [bookingOnlinePaymentsReady, selectedPaymentMethod]);
  const [bookingLocationType, setBookingLocationType] = useState("provider_location");
  const [bookingAddress, setBookingAddress] = useState("");
  const [bookingLocationDetecting, setBookingLocationDetecting] = useState(false);
  const [pendingBookingPayment, setPendingBookingPayment] = useState(null);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [typingState, setTypingState] = useState({ active: false, name: "" });
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [reviewNotice, setReviewNotice] = useState({ message: "", tone: "info" });
  const [reviewedBookings, setReviewedBookings] = useReviewedBookings(currentUser?.username);
  const [reviewBlockUsageByBarber, setReviewBlockUsageByBarber] = useState({});

  const usernameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const loginRequestRef = useRef(false);
  const socketRef = useRef(null);
  const providerOpenRef = useRef({ id: null, at: 0 });
  const typingTimeoutRef = useRef(null);
  const chatThreadRef = useRef(null);
  const notificationAudioRef = useRef(null);
  const bookingFetchInFlightRef = useRef(null);
  const bookingRefreshStateRef = useRef({
    lastFetchedAt: 0,
    retryBlockedUntil: 0,
    consecutiveFailures: 0,
  });

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

  // Shape raw quote-request rows into the props RequestCard expects, joining
  // provider name/image/service from the loaded barbers so the Requests tab is
  // readable even though the API returns only ids.
  const enrichedQuoteRequests = useMemo(() => {
    return (quoteRequests || []).map((row) => {
      const providerId = row.provider_id ?? row.providerId ?? null;
      const provider = barbers.find((item) => String(item?.id) === String(providerId)) || null;
      const serviceId = row.service_id ?? row.serviceId ?? null;
      const service = provider
        ? getBarberServices(provider).find((item) => String(item?.id) === String(serviceId))
        : null;
      return {
        id: row.id,
        kind: row.kind || "quote",
        status: row.status || "pending",
        createdAt: row.created_at || row.createdAt || null,
        preferredDate: row.preferred_date || row.preferredDate || "",
        location: row.location || "",
        description: row.description || "",
        budget: row.budget != null ? row.budget : null,
        providerId,
        providerName: provider?.business_name || row.provider_name || row.business_name || "Provider",
        providerImage: provider?.image || "",
        serviceId,
        serviceName: service?.service_name || row.service_name || "Service",
        customerName: row.customer_full_name || row.customer_name || row.customer_username || "",
      };
    });
  }, [quoteRequests, barbers]);
  const {
    availability: barberDayAvailability,
    loading: barberDayAvailabilityLoading,
    error: barberDayAvailabilityError,
  } = useBookingAvailability({
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
    window.addEventListener("service-discovery:become-provider", openProviderSignup);
    return () => window.removeEventListener("service-discovery:become-provider", openProviderSignup);
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
    if (isAuthRoutePath(window.location.pathname)) {
      const defaultTab = getDefaultTabForUser(currentUser);
      if (activeTab !== defaultTab) setActiveTab(defaultTab);
      return;
    }
    if (nextTab !== activeTab) {
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
          : activeTab === "adminSms" && isAdmin
          ? ADMIN_SMS_PATH
          : (activeTab === "admin" || activeTab === "adminReports") && isAdmin
          ? ADMIN_PATH
          : activeTab === "upgrade"
          ? UPGRADE_PATH
          : activeTab === "bookingConfirmation"
          ? `${BOOKING_CONFIRMATION_PATH}${activeConfirmationBooking?.id ? `/${encodeURIComponent(activeConfirmationBooking.id)}` : ""}`
          : activeTab === "searchResults"
          ? `${SERVICES_PATH}${window.location.search || ""}`
          : activeTab === "smartMatch"
          ? SMART_MATCH_PATH
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
          : activeTab === "aiCoach"
          ? AI_COACH_PATH
          : activeTab === "profile"
          ? PROFILE_PATH
          : activeTab === "help"
          ? HELP_PATH
          : activeTab === "policies"
          ? POLICIES_PATH
          : activeTab === "support"
          ? SUPPORT_PATH
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

    // Real-time read receipt: the other party opened our message. Flip the
    // matching outgoing bubble to "seen" instantly (no refetch). Same event
    // the website emits, so read receipts work across web and app.
    socket.on("message_seen", (payload) => {
      const messageId = payload?.messageId;
      if (messageId == null) return;
      setMessages((prev) =>
        prev.map((item) =>
          String(item.id) === String(messageId) ? { ...item, seen: true } : item
        )
      );
    });

    socket.on("receive_notification", (notification) => {
      if (!notification) return;
      // Don't notify the sender about their own message — only append
      // notifications actually addressed to this user.
      const me = String(currentUser?.username || "");
      if (
        notification.type === "message" &&
        me &&
        notification.user &&
        String(notification.user) !== me &&
        !String(notification.user).startsWith("barber-")
      ) {
        return;
      }
      appendNotificationSafely(notification);
    });

    socket.on("booking_updated", (booking) => {
      if (!booking) return;
      const normalizedBooking =
        booking.business_name || booking.booking_date || booking.payment_status
          ? mapServerBooking(booking)
          : booking;
      bookingRefreshStateRef.current.lastFetchedAt = Date.now();
      setBookings((prev) => upsertById(prev, normalizedBooking));
      writeStored("bookings", "global", upsertById(readStored("bookings", "global", []), normalizedBooking));
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
  }, [currentUser?.username, currentUser?.role, sessionChecked]);

  useEffect(() => {
    // Protected loaders must only run for a genuinely authenticated session.
    // A stale stored user with no token must stay in guest mode (no auth calls),
    // and we wait for the boot session check so an invalid token is cleared first.
    if (!currentUser?.username || !getAuthToken() || !sessionChecked) return;
    fetchProfile(currentUser.username);
    fetchFavorites(currentUser.username);
    fetchBookings(currentUser.username, effectiveIsBarber ? "barber" : "customer");
    fetchQuoteRequests();
    fetchMyReviews(currentUser.username);
    fetchNotifications();
    fetchWallet();
  }, [currentUser?.username, currentUser?.role, effectiveIsBarber, barbers.length, sessionChecked]);

  // Reconcile the stored session once on load. This keeps guests in guest mode
  // and silently clears stale/expired credentials without any warning toast.
  useEffect(() => {
    const dropToGuest = () => {
      clearAuthSession();
      setToken("");
      setSessionExpiresAt(null);
      setCurrentUser(null);
    };

    const authToken = getAuthToken();
    if (!authToken) {
      // A stored user with no token is a stale session — return to guest mode.
      if (currentUser) dropToGuest();
      setSessionChecked(true);
      return undefined;
    }

    let cancelled = false;
    getMe()
      .then((data) => {
        if (cancelled) return;
        const freshUser = data?.user || data;
        if (freshUser?.username) {
          setCurrentUser((prev) => ({ ...(prev || {}), ...freshUser }));
          const storage = localStorage.getItem("lineup_token") ? localStorage : sessionStorage;
          storage.setItem("lineup_user", JSON.stringify(freshUser));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        // Only clear on an explicit auth rejection. Tolerate offline/network
        // failures so a flaky connection never logs the user out.
        if (error?.status === 401 || error?.status === 403) {
          dropToGuest();
        }
      })
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });

    return () => {
      cancelled = true;
    };
    // Run once on mount; later session changes are handled by login/logout flows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (!sessionChecked) return;
    setSubscriptionReady(false);
    fetchSubscription();
  }, [currentUser?.username, effectiveIsBarber, isAdmin, sessionChecked]);

  useEffect(() => {
    if (!currentUser?.username || effectiveIsBarber || isAdmin) {
      setPendingCustomerSubscriptionPayment(null);
      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setCustomerSubscriptionPlan(null);
      return;
    }

    if (!sessionChecked) return;
    fetchCustomerSubscription();
  }, [currentUser?.username, effectiveIsBarber, isAdmin, sessionChecked]);

  useEffect(() => {
    if (!currentUser?.username) { setSubscriptionSummary(null); return; }
    fetchSubscriptionSummary();
  }, [currentUser?.username]);

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
    if (!pendingCustomerSubscriptionPayment?.reference || !currentUser?.username) return;

    const handleCustomerPremiumReturn = () => {
      if (document.visibilityState === "visible") {
        verifyCurrentCustomerPremium(pendingCustomerSubscriptionPayment.reference, true);
      }
    };

    window.addEventListener("focus", handleCustomerPremiumReturn);
    document.addEventListener("visibilitychange", handleCustomerPremiumReturn);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        verifyCurrentCustomerPremium(pendingCustomerSubscriptionPayment.reference, true);
      }
    }, 12000);

    return () => {
      window.removeEventListener("focus", handleCustomerPremiumReturn);
      document.removeEventListener("visibilitychange", handleCustomerPremiumReturn);
      clearInterval(interval);
    };
  }, [pendingCustomerSubscriptionPayment?.reference, currentUser?.username]);

  useEffect(() => {
    if (!selectedBarber?.id) return;
    fetchReviewsForBarber(selectedBarber.id);
  }, [selectedBarber?.id]);

  useEffect(() => {
    if (!selectedBarber?.id || !currentUser?.username) return;
    const ownsProfile =
      selectedBarber.ownerUsername === currentUser.username ||
      selectedBarber.owner_username === currentUser.username ||
      Number(selectedBarber.owner_user_id || selectedBarber.ownerUserId || 0) === Number(currentUser.id || 0);
    const providerTier = String(
      selectedBarber.subscription?.tier ||
      selectedBarber.subscription_tier ||
      subscriptionState?.tier ||
      ""
    ).toUpperCase();
    const providerPlanStatus = String(
      selectedBarber.subscription?.status ||
      selectedBarber.subscription_status ||
      subscriptionState?.status ||
      ""
    ).toLowerCase();
    const canManageReviews =
      providerTier === "PLATINUM" &&
      !["expired", "cancelled", "canceled", "inactive", "locked", "pending_payment"].includes(providerPlanStatus);
    if (ownsProfile && canManageReviews) fetchManagedReviewsForBarber(selectedBarber.id);
  }, [
    selectedBarber?.id,
    selectedBarber?.ownerUsername,
    selectedBarber?.owner_username,
    selectedBarber?.owner_user_id,
    selectedBarber?.ownerUserId,
    selectedBarber?.subscription?.tier,
    selectedBarber?.subscription?.status,
    selectedBarber?.subscription_tier,
    selectedBarber?.subscription_status,
    subscriptionState?.tier,
    subscriptionState?.status,
    currentUser?.username,
    currentUser?.id,
  ]);

  useEffect(() => {
    if (!selectedBarber) return;
    const services = getBarberServices(selectedBarber);
    if (services.length) {
      setSelectedService(services[0].id);
    }
    const teamMembers = normalizeTeamMembers(selectedBarber.team_members || selectedBarber.teamMembers || []);
    const activeTeamMembers = teamMembers.filter((item) => Number(item.is_active ?? 1) === 1);
    setSelectedTeamMemberId(activeTeamMembers.length ? String(activeTeamMembers[0].id) : "");
  }, [selectedBarber]);

  useEffect(() => {
    if (!selectedBarber) return;
    setSelectedPaymentMethod(PAYMENTS_ENABLED ? "mtn_mobile_money" : "cash");
    setMtnPaymentPhone(profile.phone || "");
    setPendingBookingPayment(null);
  }, [selectedBarber, profile.phone]);

  useEffect(() => {
    const ids = [...new Set((barbers || []).flatMap((item) => {
      const id = Number(item?.id);
      return id ? [id] : [];
    }))];
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

    const refreshWhenUseful = ({ force = false } = {}) => {
      const now = Date.now();
      const refreshState = bookingRefreshStateRef.current;
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const stale = now - refreshState.lastFetchedAt >= BOOKING_REFRESH_MIN_INTERVAL_MS;

      if (!force && (!visible || !stale || now < refreshState.retryBlockedUntil)) return;

      fetchBookings(currentUser.username, effectiveIsBarber ? "barber" : "customer", {
        force,
        preserveOnError: true,
      });
    };

    const handleReturnToApp = () => refreshWhenUseful({ force: false });

    window.addEventListener("focus", handleReturnToApp);
    document.addEventListener("visibilitychange", handleReturnToApp);

    const interval = setInterval(() => {
      refreshWhenUseful({ force: false });
    }, BOOKING_REFRESH_FALLBACK_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleReturnToApp);
      document.removeEventListener("visibilitychange", handleReturnToApp);
      clearInterval(interval);
    };
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
        notificationAudioRef.current = new Audio(`${APP_ASSET_BASE}notification.mp3`);
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

  const notifyBookingUpdate = (booking) => {
    if (!socketRef.current || !booking || !currentUser?.username) return;

    const recipient = effectiveIsBarber
      ? booking.customerUsername
      : booking.barberOwnerUsername || booking.barberUsername;

    if (!recipient || String(recipient) === String(currentUser.username)) return;
    socketRef.current.emit("booking_updated", { to: recipient, booking });
  };

  useEffect(() => {
    if (!currentUser?.username) return undefined;

    let unsubscribe = () => {};
    let active = true;

    listenForForegroundNotifications((incoming) => {
      if (!active) return;
      const normalized = mapServerNotification({
        ...incoming,
        user: currentUser.username,
        read: false,
      });
      appendNotificationSafely(normalized);
      setNotificationToast({
        id: normalized.id,
        title: normalized.title,
        message: normalized.message,
        type: normalized.type,
      });
      playNotificationSound();
    }).then((cleanup) => {
      if (active && typeof cleanup === "function") unsubscribe = cleanup;
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUser?.username]);

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
    if (!globalError) return;
    // Never surface raw auth/session errors as a global toast on public pages.
    // Login prompts are handled at the point of the intentional protected action.
    if (/not authorized|no token|please log in|session expired/i.test(globalError)) return;
    const rateLimited = /too many requests|rate limited|pause for a moment|try again shortly/i.test(globalError);
    const friendlyMessage = rateLimited
      ? "Your work is still here. Please wait a moment, then try again."
      : globalError;
    showSystemToast(rateLimited ? "Please pause a moment" : "We need one small fix", friendlyMessage, "system");
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
    setBarbersError("");
    setGlobalError("");

    const canLoadMine = Boolean(currentUser?.username && getAuthToken() && sessionChecked);
    const [res, mineResult] = await Promise.all([
      getBarbers(),
      canLoadMine ? getMyBarberStand().catch(() => null) : Promise.resolve(null),
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
    setBarbersError("We could not load providers.");
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
    if (!getAuthToken()) return;
    try {
      const data = await getFavoriteRows();
      const ids = Array.isArray(data)
        ? data.flatMap((item) => {
            const id = Number(item.barber_id ?? item.barberId ?? item.id);
            return id ? [id] : [];
          })
        : [];
      setFavorites(ids);
      writeStored("favorites", username, ids);
    } catch (error) {
      // Favorites are a background load — never surface an auth/connection error
      // as a global toast. Fall back to the empty list silently.
      setFavorites([]);
      if (error?.isAuthError || error?.status === 401) return;
    }
  };

  const fetchBookings = async (username, role, options = {}) => {
    if (!getAuthToken()) return false;
    const now = Date.now();
    const refreshState = bookingRefreshStateRef.current;

    if (!options.force && now < refreshState.retryBlockedUntil) {
      return false;
    }

    if (bookingFetchInFlightRef.current) {
      return bookingFetchInFlightRef.current;
    }

    const request = (async () => {
      try {
        const data = await getMyBookings();
      const rows = Array.isArray(data?.bookings) ? data.bookings : [];
      const next = rows.map(mapServerBooking);

      setBookings(next);
      writeStored("bookings", "global", next);
        bookingRefreshStateRef.current = {
          lastFetchedAt: Date.now(),
          retryBlockedUntil: 0,
          consecutiveFailures: 0,
        };
        return true;
      } catch (error) {
        const retryAfterMs = getRetryAfterMs(error);
        const previousFailures = refreshState.consecutiveFailures || 0;
        const fallbackBackoffMs =
          error?.status === 429
            ? BOOKING_REFRESH_RATE_LIMIT_FALLBACK_MS
            : Math.min(BOOKING_REFRESH_MAX_BACKOFF_MS, 2 ** previousFailures * 15000);
        const backoffMs = Math.min(
          BOOKING_REFRESH_MAX_BACKOFF_MS,
          Math.max(retryAfterMs, fallbackBackoffMs)
        );

        bookingRefreshStateRef.current = {
          ...bookingRefreshStateRef.current,
          retryBlockedUntil: Date.now() + backoffMs,
          consecutiveFailures: previousFailures + 1,
        };

        if (!options.preserveOnError) {
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
        return false;
      } finally {
        bookingFetchInFlightRef.current = null;
      }
    })();

    bookingFetchInFlightRef.current = request;
    return request;
  };

  const fetchQuoteRequests = async () => {
    if (!getAuthToken()) return;
    try {
      const data = await getMyQuoteRequests();
      const rows = Array.isArray(data?.quote_requests)
        ? data.quote_requests
        : Array.isArray(data)
        ? data
        : [];
      setQuoteRequests(rows);
    } catch (error) {
      // Requests are a non-critical secondary view: keep whatever we have and
      // surface nothing intrusive if the endpoint is briefly unavailable.
      if (import.meta.env.DEV) console.warn("Could not load quote requests", error);
    }
  };

  const fetchReviewsForBarber = async (barberId) => {
    try {
      const data = await getBarberReviews(barberId);
      const serverReviews = (Array.isArray(data) ? data : data?.reviews || []).map(mapServerReview);
      const next = serverReviews;
      setReviewsByBarber((prev) => ({ ...prev, [barberId]: next }));
      if (data?.reviewBlockUsage) {
        setReviewBlockUsageByBarber((prev) => ({ ...prev, [barberId]: data.reviewBlockUsage }));
      }
      writeStored("reviews", String(barberId), next);
    } catch {
      setReviewsByBarber((prev) => ({ ...prev, [barberId]: [] }));
    }
  };

  const fetchManagedReviewsForBarber = async (barberId) => {
    try {
      const data = await getManagedBarberReviews(barberId);
      const serverReviews = (Array.isArray(data) ? data : data?.reviews || []).map(mapServerReview);
      setReviewsByBarber((prev) => ({ ...prev, [barberId]: serverReviews }));
      if (data?.reviewBlockUsage) {
        setReviewBlockUsageByBarber((prev) => ({ ...prev, [barberId]: data.reviewBlockUsage }));
      }
    } catch (error) {
      setReviewNotice({
        message: error.message || "Could not load provider review controls.",
        tone: "error",
      });
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

  useEffect(() => {
    if (!currentUser?.username || !getAuthToken() || !sessionChecked || screen !== "app") return undefined;

    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, 20000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchNotifications();
    };
    window.addEventListener("focus", fetchNotifications);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", fetchNotifications);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser?.username, screen, sessionChecked]);

  const fetchWallet = async () => {
    if (!currentUser?.username) return;

    try {
      setWalletLoading(true);
      const data = effectiveIsBarber || isAdmin ? await getMyWallet() : await getCustomerWallet();
      setWalletState({
        wallet: data?.wallet || DEFAULT_WALLET_STATE.wallet,
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        withdrawals: Array.isArray(data?.withdrawals) ? data.withdrawals : [],
        topups: Array.isArray(data?.topups) ? data.topups : [],
      });
    } catch {
      setWalletState(DEFAULT_WALLET_STATE);
    } finally {
      setWalletLoading(false);
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

  const fetchSubscriptionSummary = async () => {
    if (!currentUser?.username) { setSubscriptionSummary(null); return; }
    try {
      const data = await getSubscriptionSummary();
      if (data?.success) {
        setSubscriptionSummary(data);
        if (data.customer?.subscription) {
          setCustomerSubscriptionState({
            ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE,
            ...data.customer.subscription,
            features: {
              ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE.features,
              ...(data.customer.subscription.features || {}),
            },
          });
        }
      }
    } catch { /* non-fatal — existing per-role fetches remain source of truth */ }
  };

  const fetchCustomerSubscription = async () => {
    if (!currentUser?.username || effectiveIsBarber || isAdmin) {
      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setCustomerSubscriptionPlan(null);
      setCustomerSubscriptionMessage("");
      return;
    }

    try {
      setCustomerSubscriptionLoading(true);
      const data = await getMyCustomerSubscription();
      setCustomerSubscriptionPlan(data?.plan || null);
      setCustomerSubscriptionState({
        ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      });
      setPendingCustomerSubscriptionPayment(data?.pendingPayment?.reference ? data.pendingPayment : null);
      setCustomerSubscriptionMessage("");
    } catch {
      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setPendingCustomerSubscriptionPayment(null);
      setCustomerSubscriptionMessage("Premium status is temporarily unavailable. You can still use the app while we reconnect.");
    } finally {
      setCustomerSubscriptionLoading(false);
    }
  };

  const fetchMessages = async (barberId, customerUsername) => {
    const scope = `${barberId}:${customerUsername}`;
    if (!getAuthToken()) {
      setMessages(readStored("messages", scope, []));
      return;
    }
    try {
      const data = await getMessages({ barberId, customerUsername });
      const next = Array.isArray(data) ? data : [];
      setMessages(next);
      writeStored("messages", scope, next);
      // Opening the thread = reading it: tell each sender their incoming
      // message was seen so their bubble flips to "Seen" in real time. Keyed
      // by stable username; only for messages addressed to us and not own.
      const me = currentUser?.username;
      if (socketRef.current && me) {
        next
          .filter((item) => item?.sender && String(item.sender) !== String(me) && !item.seen && item.id != null)
          .forEach((item) => socketRef.current.emit("message_seen", { to: item.sender, messageId: item.id }));
      }
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

    if (!username) {
      setAuthError("Username is required.");
      return;
    }

    if (!password) {
      setAuthError("Password is required.");
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
      const nextToken = data.token || "";
      saveAuthSession(nextToken, data.user, { rememberMe: true, refreshToken: data.refreshToken });
      setSessionExpiresAt(readSessionExpiry(nextToken));
      setToken(nextToken);
      setCurrentUser(data.user);
      setActiveTab("home");
      setScreen("app");
      setAuthSuccess(data?.message || "Account created.");
      if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
    } catch (error) {
      setAuthError(error.message || "Could not create your account. Please check your connection and try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async ({ rememberMe = true } = {}) => {
    if (loginRequestRef.current || authLoading) return;
    clearAuthMessages();
    const username = usernameRef.current?.value?.trim() || "";
    const password = passwordRef.current?.value || "";

    if (!username && !password) {
      setAuthError("Please enter your username/email and password.");
      return;
    }

    if (!username) {
      setAuthError("Please enter your username or email.");
      return;
    }

    if (!password) {
      setAuthError("Please enter your password.");
      return;
    }

    try {
      loginRequestRef.current = true;
      setAuthLoading(true);
      const data = await loginUser({ username, password });
      const nextToken = data.token || "";
      saveAuthSession(nextToken, data.user, { rememberMe, refreshToken: data.refreshToken });
      setSessionExpiresAt(readSessionExpiry(nextToken));
      setToken(data.token || "");
      setCurrentUser(data.user);
      setActiveTab(getPostLoginTab(window.location.pathname, data.user));
      setScreen("app");
    } catch (error) {
      setAuthError(getLoginErrorMessage(error));
    } finally {
      loginRequestRef.current = false;
      setAuthLoading(false);
    }
  };

  const saveProfile = async (nextProfile, options = {}) => {
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
      if (!options.localErrorOnly) {
        setGlobalError(error.message || "Could not save your profile. Please check your connection and try again.");
      }
      throw error;
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
        setAuthSuccess(data?.message || "If an account exists with this email, a reset code has been sent.");
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
      return Promise.resolve(false);
    }
    setLocationLoading(true);
    setLocationMessage("");
    setLocationLabel("Detecting location...");
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const nextLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          let nextLabel;
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
          resolve(true);
        },
        (error) => {
          const savedLabel = readStoredQuelessLocation()?.label || "Near you";
          setLocationLabel(savedLabel);
          setLocationMessage(getGeolocationErrorMessage(error));
          setLocationLoading(false);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  };

  const useCurrentLocationForBooking = () => {
    if (!navigator.geolocation) {
      setGlobalError("Your browser does not support location detection.");
      return;
    }
    setBookingLocationDetecting(true);
    setGlobalError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        let nextLabel;
        try {
          nextLabel = await reverseGeocodeCoordinates(nextLocation);
        } catch {
          nextLabel = "";
        }
        setBookingAddress(nextLabel || "Location detected near your current area");
        setBookingLocationType("customer_location");
        setBookingLocationDetecting(false);
      },
      (error) => {
        setGlobalError(getGeolocationErrorMessage(error));
        setBookingLocationDetecting(false);
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
        await removeFavorite({ barberId });
        const next = favorites.filter((item) => Number(item) !== id);
        setFavorites(next);
        writeStored("favorites", currentUser.username, next);
        vibrate(6);
        vibrate(6);
      } else {
        await addFavorite({ barberId: id });
        const next = [...new Set([...favorites, id])];
        setFavorites(next);
        writeStored("favorites", currentUser.username, next);
      }
    } catch (error) {
      setGlobalError(error?.userMessage || "We couldn't update that favorite. Please try again.");
    }
  };

const registerBarber = async (payload) => {
    if (!currentUser?.username) return { success: false, message: "Please log in to save your stand draft." };
    const wantsPublish = payload.submitIntent === "publish";
    const quietSave = Boolean(payload.autoSave || payload.silent);
    const selectedServices = Array.isArray(payload.services)
      ? payload.services.map((service, index) => normalizeServiceForBooking(service, index, { preserveEmptyTitle: true }))
      : String(payload.services || "")
          .split(",")
          .flatMap((item) => {
            const service = item.trim();
            return service ? [service] : [];
          })
          .map(normalizeServiceForBooking);

    const cachedExistingStand =
      effectiveIsBarber ||
      barbers.some((item) => String(item.ownerUsername || "") === String(currentUser.username || ""));

    if (cachedExistingStand) {
      try {
        const mineData = await getMyBarberStand();
        if (mineData?.barber) {
          const existingStand = normalizeBarber(mineData.barber, 0);
          setBarbers((prev) => mergeBarberListsPreservingLocal([existingStand], prev));
          setSelectedBarber(existingStand);
          setShowEditBarber(true);
          const message = "I found your existing stand. Continue from Edit Stand.";
          if (!quietSave) showSystemToast("Edit Stand opened", message, "system");
          return { success: false, message };
        }
      } catch (error) {
        if (![404, 401, 403].includes(Number(error?.status))) {
          const message = error?.message || "We couldn't check your existing stand. Please try again.";
          if (!quietSave) setGlobalError(message);
          return { success: false, message };
        }
      }

      const nextBarbers = barbers.filter((item) => String(item.ownerUsername || "") !== String(currentUser.username || ""));
      setBarbers(nextBarbers);
      saveStoredBarbers(nextBarbers.filter(isPublicProvider));
    }

    const startsTrial = false;

    const normalizedName = String(payload.businessName || "").trim().toLowerCase().replace(/\s+/g, " ");
    const duplicateBusiness = normalizedName && getStoredBarbers().some(
      (item) => String(item.business_name || "").trim().toLowerCase().replace(/\s+/g, " ") === normalizedName
    );
    if (duplicateBusiness) {
      const message = "A business with this name already exists. If this is your business, report it for review.";
      setGlobalError(message);
      return { success: false, message };
    }

    let data;
    try {
      data = await registerBarberStand({
        business_name: payload.businessName,
        phone: payload.phone,
        location: payload.location,
        latitude: Number(payload.latitude || DEFAULT_CENTER[0]),
        longitude: Number(payload.longitude || DEFAULT_CENTER[1]),
        price_from: Number(payload.pricing || 0),
        image: payload.image || profile.profilePhoto || "",
        services: selectedServices,
        categories: Array.isArray(payload.categories) ? payload.categories : [],
        primary_category: payload.primaryCategory || null,
        stand_type: "individual",
        business_type: payload.businessType || "Services",
        map_icon_type: payload.mapIconType || payload.iconCategory || "",
        cover_image_url: payload.coverImage || "",
        business_hours: payload.businessHours || {},
        home_service_enabled: Boolean(payload.homeServiceEnabled),
        intro_text: payload.introText || "",
        verification_document_name: payload.documentName || "",
        document_name: payload.documentName || "",
        portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
        team_members: parseTeamMembers(payload.teamMembers),
        schedule_start: payload.scheduleStart || "08:00",
        schedule_end: payload.scheduleEnd || "20:00",
        accepts_wallet: Boolean(payload.acceptsWallet),
        accepts_cash: true,
        selected_plan: String(payload.selectedPlan || "FREE").toUpperCase(),
        submit_intent: "draft",
        access_type: "subscription",
        start_free_trial: false,
      });

      if (wantsPublish) {
        const publishData = await publishMyBarberStand();
        data = { ...data, ...publishData, next_step: "active" };
      }
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
      if (data?.next_step === "active") {
        setSubscriptionMessage(data?.message || "Business active. Your business is visible to customers on the Free plan.");
      } else if (data?.next_step === "payment_pending" || data?.next_step === "upgrade" || !startsTrial) {
        setSubscriptionMessage(data?.message || "Business stand draft saved successfully.");
      }
    } catch (error) {
      const message =
        error?.payload?.code === "DUPLICATE_BUSINESS_NAME"
          ? "A business with this name already exists. If this is your business, you can report or claim it."
          : error?.message || "We couldn’t save your stand draft. Please try again.";
      setGlobalError(message);
      return { success: false, message };
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
    setActiveTab("dashboard");

    const uploadNotification = {
      id: makeId("ntf"),
      user: upgradedUser.username,
      type: "system",
      title: startsTrial || data?.next_step === "active" ? "Business profile activated" : "Business draft saved",
      message: startsTrial || data?.next_step === "active"
        ? "Your business page was uploaded successfully."
        : data?.message || "Draft saved. You can come back and continue anytime.",
      createdAt: new Date().toISOString(),
      read: false,
    };
    appendStored("notifications", upgradedUser.username, uploadNotification);
    fetchNotifications();
    const didPublish = wantsPublish && data?.next_step === "active";
    showSystemToast(
      didPublish ? "Stand published" : "Draft saved",
      didPublish ? "Your stand is now live and visible to customers." : "Draft saved. You can come back and continue anytime.",
      "success"
    );
    return { success: true, published: didPublish, draftSaved: true, message: data?.message };
  };

  const publishBarberStand = async () => {
    if (!currentUser?.username || !myBarberProfile) return false;
    try {
      const data = await publishMyBarberStand();
      if (!data?.success) {
        showSystemToast("Could not publish", data?.message || "Check your stand details and try again.", "error");
        return false;
      }
      const updatedBarber = data?.barber ? normalizeBarber(data.barber, 0) : null;
      if (updatedBarber) {
        setBarbers((prev) => mergeBarberListsPreservingLocal([updatedBarber], prev));
      }
      await fetchBarbers();
      showSystemToast("Stand published", "Your stand is now live and visible to customers.", "success");
      return true;
    } catch (error) {
      showSystemToast("Could not publish", error?.message || "Something went wrong. Please try again.", "error");
      return false;
    }
  };

  const updateBarberStand = async (payload) => {
    if (!currentUser?.username || !myBarberProfile) {
      return { success: false, message: "We couldn’t load your saved stand. Refresh and try again." };
    }
    const wantsPublish = payload.submitIntent === "publish";
    const quietSave = Boolean(payload.autoSave || payload.silent);
    const selectedServices = Array.isArray(payload.services)
      ? payload.services.map((service, index) => normalizeServiceForBooking(service, index, { preserveEmptyTitle: true }))
      : String(payload.services || "")
          .split(",")
          .flatMap((item) => {
            const service = item.trim();
            return service ? [service] : [];
          })
          .map(normalizeServiceForBooking);
    const existingTeamMembers = Array.isArray(myBarberProfile.team_members || myBarberProfile.teamMembers)
      ? myBarberProfile.team_members || myBarberProfile.teamMembers
      : [];
    const existingTeamNames = existingTeamMembers
      .map((member) => typeof member === "string" ? member : member.name)
      .filter(Boolean)
      .join(", ");
    const submittedTeamNames = String(payload.teamMembers || "").trim();
    const nextTeamMembers = submittedTeamNames === existingTeamNames
      ? existingTeamMembers
      : parseTeamMembers(payload.teamMembers);
    const draftPayload = buildStandDraftUpdatePayload(
      {
        ...payload,
        standType: "individual",
        services: selectedServices,
        teamMembers: nextTeamMembers,
        acceptsWallet: PAYMENTS_ENABLED ? Boolean(payload.acceptsWallet) : false,
        acceptsCash: true,
      },
      myBarberProfile
    );
    try {
      let data = await updateMyBarberStand(draftPayload);
      if (wantsPublish) {
        data = await publishMyBarberStand();
      }
      const savedBarber = data?.barber ? normalizeBarber(data.barber, 0) : null;
      if (savedBarber) {
        setBarbers((prev) => mergeBarberListsPreservingLocal([savedBarber], prev));
        setSelectedBarber(savedBarber);
      }
      await fetchBarbers();
    } catch (error) {
      const draftWasSaved = wantsPublish && error?.payload?.code === "STAND_NOT_READY";
      const message = draftWasSaved
        ? error?.message || "Your draft is saved, but complete the missing details before publishing."
        : error?.message || "We couldn’t save your stand draft. Please try again.";
      if (!quietSave) setGlobalError(message);
      if (draftWasSaved && !quietSave) {
        showSystemToast("Draft saved, not published", message, "system");
      }
      return { success: false, draftSaved: draftWasSaved, message };
    }

    if (wantsPublish) setShowEditBarber(false);
    if (quietSave) {
      return { success: true, published: false, autoSaved: true };
    }

    const updateNotification = {
      id: makeId("ntf"),
      user: currentUser.username,
      type: "system",
      title: wantsPublish ? "Stand published" : "Stand draft saved",
      message: wantsPublish ? "Your stand is now live." : "Draft saved. You can come back and continue anytime.",
      createdAt: new Date().toISOString(),
      read: false,
    };
    appendStored("notifications", currentUser.username, updateNotification);
    showSystemToast(
      wantsPublish ? "Stand published" : "Draft saved",
      wantsPublish ? "Your stand is now live and visible to customers." : "Draft saved. You can come back and continue anytime.",
      "success"
    );
    fetchNotifications();
    return { success: true, published: wantsPublish };
  };

  const deleteBarberStand = async () => {
    if (!currentUser?.username || !myBarberProfile) return;

    try {
      setDeleteStandLoading(true);
      await deleteMyBarberStand();
    } catch (error) {
      setGlobalError(error.message || "Could not remove this business profile. Please check your connection and try again.");
      return;
    } finally {
      setDeleteStandLoading(false);
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
    setDeleteStandConfirmOpen(false);
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
    showSystemToast("Stand deleted", "Your stand was removed from public search and bookings.", "system");
  };

  const createBooking = async (options = {}) => {
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

    const effectivePaymentMethod = PAYMENTS_ENABLED ? selectedPaymentMethod : "cash";
    const mobileMoneyPhone = PAYMENTS_ENABLED ? String(mtnPaymentPhone || "").trim() : "";
    const teamMembers = normalizeTeamMembers(selectedBarber.team_members || selectedBarber.teamMembers || []);
    const activeTeamMembers = teamMembers.filter((item) => Number(item.is_active ?? 1) === 1);
    const requiresTeamMember = activeTeamMembers.length > 0;
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
      const pricingType = String(serviceObj.pricing_type || "fixed").toLowerCase();
      const hasBookablePrice =
        pricingType === "range" ||
        pricingType === "starting_from" ||
        Number(serviceObj.price_extra || serviceObj.price || 0) > 0 ||
        Number(selectedBarber.price_from || 0) > 0;
      if (pricingType === "quote" || !hasBookablePrice) {
        throw new Error("This service needs a quote before booking.");
      }
      const normalizedLocationType = String(bookingLocationType || "provider_location").toLowerCase();
      const serviceLocationType = String(serviceObj.location_type || "provider_location").toLowerCase();
      const homeServiceAllowed =
        Number(selectedBarber.home_service_enabled || selectedBarber.homeServiceEnabled || 0) === 1 ||
        ["customer_location", "pickup_delivery", "mobile_area"].includes(serviceLocationType);
      if (normalizedLocationType === "customer_location" && !homeServiceAllowed) {
        throw new Error("This service is only available at the provider location.");
      }
      const cleanBookingAddress =
        normalizedLocationType === "customer_location"
          ? String(bookingAddress || "").trim()
          : selectedBarber.location || "";
      if (normalizedLocationType === "customer_location" && cleanBookingAddress.length < 3) {
        throw new Error("Add your address or use your current location before booking.");
      }

      const data = await createBookingRequest({
        barber_id: Number(selectedBarber.id),
        service_id: serviceObj.id,
        booking_date: selectedDate,
        booking_time: selectedTime,
        booking_location_type: normalizedLocationType,
        booking_address: cleanBookingAddress,
        payment_method: effectivePaymentMethod,
        payment_phone: PAYMENTS_ENABLED ? (mobileMoneyPhone || profile.phone) : profile.phone,
        booking_details: options.bookingDetails || null,
        idempotencyKey: makeId(PAYMENTS_ENABLED ? "booking-payment" : "booking"),
        team_member_id: selectedTeamMember?.id || null,
      });

      const created = data?.booking;
      if (!created) throw new Error("Booking was not returned by the server.");

      const nextBooking = mapServerBooking({
        ...created,
        business_name: selectedBarber.business_name,
        location: cleanBookingAddress || selectedBarber.location,
        booking_location_type: normalizedLocationType,
        booking_address: cleanBookingAddress,
        payment_method: effectivePaymentMethod,
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

      if (PAYMENTS_ENABLED && data?.payment?.reference) {
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
        PAYMENTS_ENABLED && data?.payment?.reference ? "Payment started" : "Booking confirmed",
        PAYMENTS_ENABLED && data?.payment?.reference
          ? "Approve the mobile money prompt to secure your booking."
          : "Your booking was created successfully. Payment can be handled directly with the provider for now.",
        "booking"
      );
      if (!PAYMENTS_ENABLED || !data?.payment?.reference) {
        setShowBookingModal(false);
        setConfirmedBooking(nextBooking);
        setFocusedBookingId(String(nextBooking.id || ""));
      }
      setShowBarberProfile(false);
      setActiveTab(PAYMENTS_ENABLED && data?.payment?.reference ? "bookings" : "bookingConfirmation");
      notifyBookingUpdate(nextBooking);
      fetchNotifications();
      fetchWallet();
    } catch (error) {
      setGlobalError(getBookingCreationErrorMessage(error));
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

      notifyBookingUpdate(updatedBooking);
      vibrate([10, 20, 10]);
      showSystemToast("Booking updated", `Status changed to ${status}.`, "booking");
      fetchNotifications();
    } catch (error) {
      setGlobalError(error.message || "Could not update booking.");
    }
  };

  const verifyCurrentBookingPayment = async (bookingId = pendingBookingPayment?.bookingId, silent = false) => {
    if (!bookingId || !currentUser?.username) return false;
    if (!PAYMENTS_ENABLED) {
      if (!silent) setGlobalError(MOBILE_MONEY_COMING_SOON_MESSAGE);
      setPendingBookingPayment(null);
      return false;
    }

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
      if (updatedBooking) notifyBookingUpdate(updatedBooking);
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
    const code = String(error?.code || "").toUpperCase();
    const status = Number(error?.status || 0);
    const details = error?.payload?.details || {};

    // Map known backend error codes to clear, safe, user-facing guidance.
    const byCode = {
      INVALID_PROMO_CODE: "Invalid promo code.",
      PROMO_CODE_EXPIRED: error?.message || "This promo code has expired.",
      PROMO_PLAN_MISMATCH: error?.message || "This promo code is not valid for this plan.",
      PROMO_ALREADY_USED: error?.message || "This promo code has already been used.",
      PROMO_CODE_REQUIRED: error?.message || "Enter a promo code to continue.",
      PARTIAL_PROMO_PAYMENT_COMING_SOON: details.message || error?.message || PARTIAL_PROMO_COMING_SOON_MESSAGE,
      PLAN_PRICE_MISMATCH: error?.message || "Plan details could not be loaded. Please choose a plan again.",
      INVALID_PHONE_NUMBER: error?.message || "This phone number is not valid for mobile money. Please check the number and try again.",
      WRONG_PROVIDER_FOR_NUMBER: error?.message || "This number does not match the selected mobile money network.",
      PAYMENT_PROVIDER_UNAVAILABLE: "Payment service is temporarily unavailable. Please try again shortly.",
      MISSING_PAYMENT_CONFIG: import.meta.env.PROD
        ? "Mobile money payments are temporarily unavailable. Please try again later."
        : "Mobile money payments are not fully configured yet.",
      PAYMENT_REQUEST_FAILED: "We could not start the mobile money request. Please check your number or try again in a moment.",
      PAYMENT_TIMEOUT: "The payment request timed out. Please try again.",
      UNAUTHORIZED: "Your session has expired. Please sign in again before paying.",
      SERVER_ERROR: "We could not complete the payment. Please try again in a moment.",
    };
    if (code && byCode[code]) return byCode[code];

    if (status === 401) return "Your session has expired. Please sign in again before paying.";
    if (status === 403) return error?.message || "This action is not available for your account type.";
    if (status === 0 || status >= 500) return "Payment service is temporarily unavailable. Please try again shortly.";
    if ([400, 402, 409].includes(status)) {
      return error?.message || "We could not start the payment. Please check your details and try again.";
    }
    return error?.message || "We could not start the mobile money request. Please check your number or try again in a moment.";
  };

  const startCurrentSubscriptionUpgrade = async (request, fallbackProvider = "mtn_mobile_money") => {
    const payload =
      typeof request === "object" && request !== null
        ? request
        : { tier: request, provider: fallbackProvider, method: fallbackProvider };
    const tier = String(payload.tier || "PREMIUM").toUpperCase();
    const provider = String(payload.provider || payload.method || fallbackProvider || "mtn_mobile_money").toLowerCase();
    const isFreeActivation = tier === "FREE" || provider === "free" || provider === "trial";
    const hasPromo = Boolean(String(payload.promoCode || payload.promo_code || "").trim());
    const paymentsOff = !PAYMENTS_ENABLED;

    // While live payments are off, allow free activations and promo-bearing requests.
    if (paymentsOff && !isFreeActivation && !hasPromo) {
      setSubscriptionMessage(PAYMENTS_COMING_SOON_MESSAGE);
      return false;
    }
    // With payments off, never send a payment method/phone for a paid tier: a full
    // promo activates server-side, and a partial promo is rejected before any live
    // collection can start. Free/trial activations keep their provider value.
    const promoOnly = paymentsOff && !isFreeActivation;
    const effectiveProvider = promoOnly ? "promo" : provider;
    const effectivePhone = promoOnly ? "" : (payload.phoneNumber || payload.payment_phone || profile.phone);

    try {
      setSubscriptionLoading(true);
      setSubscriptionMessage("");
      const idempotencyKey = makeId("subscription-upgrade");
      const data = await startSubscriptionUpgrade(
        {
          tier,
          planId: tier,
          billingCycle: payload.billingCycle || payload.billing_cycle || "monthly",
          provider: effectiveProvider,
          method: effectiveProvider,
          payment_phone: effectivePhone,
          phoneNumber: effectivePhone,
          promoCode: payload.promoCode || payload.promo_code || "",
        },
        idempotencyKey
      );

      const nextSubscription = {
        ...DEFAULT_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      };
      const activatedImmediately = hasProviderAccess(nextSubscription);
      const providerActiveMessage =
        tier === "PLATINUM"
          ? "Platinum is active. Advanced provider tools are unlocked."
          : tier === "PREMIUM"
            ? "Premium is active. Your provider features have been updated."
            : "Free plan is active. Your provider features have been updated.";

      setPendingSubscriptionPayment(data?.payment?.reference ? {
        reference: data.payment.reference,
        tier,
        provider,
      } : null);
      const successMessage = data?.message || providerActiveMessage;
      if ((provider === "trial" || activatedImmediately) && data?.subscription) {
        setSubscriptionState(nextSubscription);
        setPendingSubscriptionPayment(null);
        if (activatedImmediately && provider !== "trial") {
          const isFreeActivation = tier === "FREE" || provider === "free";
          showSystemToast(
            isFreeActivation ? "Free plan activated" : "Plan activated",
            successMessage,
            "system"
          );
        }
        await fetchSubscription();
        fetchBarbers();
        setActiveTab(effectiveIsBarber ? "dashboard" : "profile");
      }
      setSubscriptionMessage(activatedImmediately ? successMessage : data?.message || "Plan selected. Mobile money confirmation is required to activate your business.");
      return { success: true, ...data };
    } catch (error) {
      const promoDetails = error?.payload?.details || {};
      setSubscriptionMessage(promoDetails.message || getFriendlyPaymentError(error));
      return false;
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const verifyCurrentSubscription = async (reference = pendingSubscriptionPayment?.reference, silent = false) => {
    if (!reference) return false;
    if (!PAYMENTS_ENABLED) {
      if (!silent) setSubscriptionMessage(PAYMENTS_COMING_SOON_MESSAGE);
      return false;
    }

    try {
      setSubscriptionLoading(true);
      const data = await verifySubscriptionUpgrade(reference);
      const nextSubscription = {
        ...DEFAULT_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      };
      const tier = normalizeProviderPlan(nextSubscription.tier);
      const providerActiveMessage =
        tier === "PLATINUM"
          ? "Platinum is active. Advanced provider tools are unlocked."
          : tier === "PREMIUM"
            ? "Premium is active. Your provider features have been updated."
            : "Your plan is active.";
      setSubscriptionState(nextSubscription);
      setPendingSubscriptionPayment(null);
      setSubscriptionMessage(data?.message || providerActiveMessage);
      showSystemToast("Subscription upgraded", data?.message || providerActiveMessage, "system");
      await fetchSubscription();
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

  const openCustomerPremiumPayment = () => {
    if (customerPremiumActive) {
      setCustomerSubscriptionMessage("Your premium booking experience is active. Smart Match is ready.");
      setCustomerPremiumPaymentOpen(false);
      return;
    }
    // Open the upgrade modal even when live payments are off. The modal keeps the
    // promo code path usable (a full promo unlocks Customer Premium now); the
    // payment methods inside it are the only things shown as Coming Soon.
    setCustomerSubscriptionMessage("");
    setCustomerPremiumPaymentOpen(true);
  };

  const startCurrentCustomerPremiumUpgrade = async (request = {}) => {
    const hasPromo = Boolean(String(request.promoCode || request.promo_code || "").trim());
    const paymentsOff = !PAYMENTS_ENABLED;
    // While live payments are off, only promo-bearing requests may proceed.
    if (paymentsOff && !hasPromo) {
      setCustomerSubscriptionMessage(PAYMENTS_COMING_SOON_MESSAGE);
      return false;
    }
    // With payments off, send no payment method/phone: a full promo activates
    // server-side and a partial promo is rejected before any live collection.
    const effectiveProvider = paymentsOff ? "promo" : (request.provider || "mtn_mobile_money");
    const effectivePhone = paymentsOff ? "" : (request.phoneNumber || profile.phone);
    try {
      setCustomerSubscriptionLoading(true);
      setCustomerSubscriptionMessage("");
      const idempotencyKey = makeId("customer-premium");
      const data = await startCustomerSubscriptionUpgrade(
        {
          billingCycle: request.billingCycle || "monthly",
          provider: effectiveProvider,
          method: effectiveProvider,
          phoneNumber: effectivePhone,
          payment_phone: effectivePhone,
          promoCode: request.promoCode || request.promo_code || "",
        },
        idempotencyKey
      );
      const nextSubscription = {
        ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      };
      const premiumActivated = isCustomerPremiumActive(nextSubscription);
      setCustomerSubscriptionPlan(data?.plan || customerSubscriptionPlan);
      setCustomerSubscriptionState(nextSubscription);
      setPendingCustomerSubscriptionPayment(!premiumActivated && data?.payment?.reference ? {
        reference: data.payment.reference,
        provider: data.payment.provider || request.provider || "mtn_mobile_money",
        status: data.payment.status || "pending",
        amount: data.payment.amount || 0,
        billingCycle: data.payment.billingCycle || request.billingCycle || "monthly",
      } : null);
      if (premiumActivated) {
        setCustomerPremiumPaymentOpen(false);
        setCustomerSubscriptionMessage("Your premium booking experience is active. Smart Match is ready.");
        showSystemToast("Customer Premium active", data?.message || "Smart Match is unlocked.", "system");
        await fetchCustomerSubscription();
        await fetchSubscriptionSummary();
      } else {
        setCustomerSubscriptionMessage(data?.message || "Approve the Mobile Money prompt to activate Customer Premium.");
      }
      return true;
    } catch (error) {
      const isPromoError = /promo/i.test(error?.message || "");
      setCustomerSubscriptionMessage(
        paymentsOff && !isPromoError ? PARTIAL_PROMO_COMING_SOON_MESSAGE : getFriendlyPaymentError(error)
      );
      return false;
    } finally {
      setCustomerSubscriptionLoading(false);
    }
  };

  const verifyCurrentCustomerPremium = async (reference = pendingCustomerSubscriptionPayment?.reference, silent = false) => {
    if (!reference) return false;
    if (!PAYMENTS_ENABLED) {
      if (!silent) setCustomerSubscriptionMessage(PAYMENTS_COMING_SOON_MESSAGE);
      return false;
    }
    try {
      setCustomerSubscriptionLoading(true);
      const data = await verifyCustomerSubscriptionUpgrade(reference);
      const nextSubscription = {
        ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE,
        ...(data?.subscription || {}),
        features: {
          ...DEFAULT_CUSTOMER_SUBSCRIPTION_STATE.features,
          ...(data?.subscription?.features || {}),
        },
      };
      setCustomerSubscriptionState(nextSubscription);
      setPendingCustomerSubscriptionPayment(null);
      setCustomerPremiumPaymentOpen(false);
      setCustomerSubscriptionMessage(data?.message || "Your premium booking experience is active. Smart Match is ready.");
      showSystemToast("Customer Premium active", data?.message || "Smart Match is unlocked.", "system");
      await fetchCustomerSubscription();
      await fetchSubscriptionSummary();
      return true;
    } catch (error) {
      if (!silent) {
        setCustomerSubscriptionMessage(getFriendlyPaymentError(error) || "Customer Premium payment has not completed yet.");
      }
      return false;
    } finally {
      setCustomerSubscriptionLoading(false);
    }
  };

  const requestCurrentWithdrawal = async (amount) => {
    if (!PAYMENTS_ENABLED) {
      setWalletMessage(WALLET_PAYMENTS_COMING_SOON_MESSAGE);
      return;
    }
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
      setWalletMessage(error.userMessage || "Could not request payout. Please try again in a moment.");
    } finally {
      setWalletLoading(false);
    }
  };

  const confirmCashPayment = async (bookingId) => {
    const existingBooking = bookings.find((item) => String(item.id) === String(bookingId));
    if (!existingBooking) return;
    if (!PAYMENTS_ENABLED) {
      setGlobalError(PAYMENTS_COMING_SOON_MESSAGE);
      return;
    }

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
      notifyBookingUpdate(updatedBooking);
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

      notifyBookingUpdate(cancelled);
      fetchNotifications();
    } catch (error) {
      setGlobalError(error.message || "Could not cancel booking.");
    }
  };

  const submitReview = async (booking, rating, text) => {
    if (!booking?.id || !booking?.barberId || !currentUser?.username) return;
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      setReviewSuccess("Please add a short review before submitting.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }

    const reviewedMap = readStored("reviewedBookings", currentUser.username, reviewedBookings || {});
    if (reviewedMap[String(booking.id)]) {
      setReviewSuccess("You already submitted a review for this booking.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }
    try {
      const data = await createReview({
        bookingId: booking.id,
        barberId: booking.barberId,
        username: currentUser.username,
        name: profile.fullName || currentUser.username,
        rating: Number(rating || 5),
        text: cleanText,
      });
      const savedReview = mapServerReview(data?.review || data);
      const next = mergeByNewest(reviewsByBarber[booking.barberId] || [], [savedReview]);
      setReviewsByBarber((prev) => ({
        ...prev,
        [booking.barberId]: next,
      }));
      writeStored("reviews", String(booking.barberId), next);
      const nextReviewed = {
        ...reviewedMap,
        [String(booking.id)]: savedReview,
      };
      setReviewedBookings(nextReviewed);
      writeStored("reviewedBookings", currentUser.username, nextReviewed);
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("already been reviewed")) {
        await fetchMyReviews(currentUser.username);
        setReviewSuccess("You already submitted a review for this booking.");
        setTimeout(() => setReviewSuccess(""), 2200);
        return;
      }
      setReviewSuccess(error.message || "Could not submit review.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }

    setReviewSuccess("Review submitted successfully.");
    setTimeout(() => setReviewSuccess(""), 2200);

    await fetchReviewsForBarber(booking.barberId);
  };

  const editBookingReview = async (booking, rating, text) => {
    if (!booking?.id || !booking?.barberId || !currentUser?.username) return;
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      setReviewSuccess("Please add a short review before saving.");
      setTimeout(() => setReviewSuccess(""), 2200);
      return;
    }

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
        review_text: cleanText,
      });
      const savedReview = data?.review || { ...existingReview, rating: Number(rating || 5), review_text: cleanText };
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

  const sendMessage = async (retryMessage = null) => {
    const messageText = String(retryMessage?.text || chatText || "").trim();
    if (!selectedBarber?.id || !messageText || !currentUser?.username || !chatCustomerUsername) {
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
    const clientMessageId = retryMessage?.clientMessageId || retryMessage?.client_message_id || makeId("client-message");

    try {
      setChatError("");
      setChatStatus(retryMessage ? "Retrying..." : "Sending...");
      if (retryMessage) {
        setMessages((current) => current.map((item) => item.id === retryMessage.id ? { ...item, failed: false, pending: true } : item));
      }

      const data = await createMessage({
        barberId: selectedBarber.id,
        barberName: selectedBarber.business_name,
        customerUsername: chatCustomerUsername,
        sender: currentUser.username,
        text: messageText,
        clientMessageId,
        client_message_id: clientMessageId,
      });

      const next = retryMessage
        ? messages.map((item) => item.id === retryMessage.id ? data : item)
        : [...messages, data];
      setMessages(next);
      writeStored("messages", scope, next);
      if (!retryMessage) setChatText("");
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
        id: retryMessage?.id || `failed-${clientMessageId}`,
        barberId: selectedBarber.id,
        barberName: selectedBarber.business_name,
        customerUsername: chatCustomerUsername,
        sender: currentUser.username,
        text: messageText,
        clientMessageId,
        client_message_id: clientMessageId,
        pending: false,
        failed: true,
        createdAt: new Date().toISOString(),
      };
      const next = uniqueById(retryMessage
        ? messages.map((item) => item.id === retryMessage.id ? localMessage : item)
        : [...messages, localMessage]).sort(
        (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      );
      setMessages(next);
      writeStored("messages", scope, next);

      // A failed API request is not a delivered message. Keep it locally only
      // so the user can retry with the same idempotency key.
      if (!retryMessage) setChatText("");
      setChatStatus("");
      setChatError(error.message || "Could not send that message. Retry when the connection is available.");
    }
  };

  const logout = (message = "") => {
    const refreshToken = getRefreshToken();
    if (refreshToken) logoutUser(refreshToken).catch(() => {});
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
    return undefined;
  }, [token]);

  useEffect(() => {
    const refreshedListener = (event) => {
      const nextToken = event?.detail?.token || getAuthToken();
      setToken(nextToken);
      setSessionExpiresAt(readSessionExpiry(nextToken));
    };
    window.addEventListener("lineup:session-refreshed", refreshedListener);
    return () => window.removeEventListener("lineup:session-refreshed", refreshedListener);
  }, []);

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
          image: normalized.image || resolveProviderImage(normalized),
          gallery: (Array.isArray(normalized.gallery) ? normalized.gallery : [])
            .filter(Boolean)
            .concat(normalized.image ? [normalized.image] : [resolveProviderImage(normalized)])
            .filter((value, index, list) => list.indexOf(value) === index)
            .slice(0, 3),
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
      // A provider must always see their own published stand in public discovery
      // so they can verify it's live and how customers see it.
      // The ownership check bypasses subscription-status transient issues.
      const isOwnPublishedStand =
        currentUser?.username &&
        String(barber.ownerUsername || "") === String(currentUser.username || "") &&
        (barber.is_published === 1 ||
          barber.is_published === true ||
          String(barber.is_published) === "1");
      if (!isOwnPublishedStand && !isPublicProvider(barber)) return false;
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
      items = items.toSorted((a, b) => {
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

    return items.toSorted((a, b) => {
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
    workingWindow: barberDayAvailability?.workingWindow,
  });

  const bookingAvailabilityStatus = useMemo(() => {
    const selectedDateOption = dateOptions.find((item) => item.value === selectedDate);
    const openSlots = availableTimeSlots.filter((item) => !item.disabled);
    const nextSlot = openSlots[0] || null;
    const workingWindow = barberDayAvailability?.workingWindow || selectedBarber?.availability || null;
    const allReasons = new Set(availableTimeSlots.flatMap((item) => (item.disabledReason ? [item.disabledReason] : [])));
    return {
      loading: barberDayAvailabilityLoading,
      error: barberDayAvailabilityError,
      selectedDateLabel: selectedDateOption?.label || selectedDate || "Selected day",
      nextAvailableLabel: nextSlot?.label || "",
      availableCount: openSlots.length,
      hasAvailable: openSlots.length > 0,
      isClosed: availableTimeSlots.length > 0 && !openSlots.length && allReasons.size === 1 && allReasons.has("Outside business hours"),
      workingWindow,
    };
  }, [
    availableTimeSlots,
    barberDayAvailability?.workingWindow,
    barberDayAvailabilityError,
    barberDayAvailabilityLoading,
    dateOptions,
    selectedBarber?.availability,
    selectedDate,
  ]);

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
    setMapState((prev) => ({ ...prev, show: false }));
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

    if ((target === "dashboard" || target === "reports" || target === "aiCoach") && !effectiveIsBarber) {
      setActiveTab("profile");
      return;
    }

    if (target === "aiCoach" && !entitlementState.canUseProviderCoach) {
      openUpgradePlan("PLATINUM");
      return;
    }

    if (target === "admin" && isAdmin) {
      setPreviousMobileView(activeTab === "admin" ? "home" : activeTab || "home");
    }

    setActiveTab(target);
  };

  const toggleReviewPublicBlock = async (review, blocked = true) => {
    if (!review?.id || !selectedBarber?.id) return;
    try {
      const result = await setReviewPublicBlock(review.id, {
        blocked,
        reason: blocked ? "Provider hid this review from the public stand" : "",
      });
      setReviewBlockUsageByBarber((prev) => ({
        ...prev,
        [selectedBarber.id]: result.reviewBlockUsage || prev[selectedBarber.id],
      }));
      await fetchManagedReviewsForBarber(selectedBarber.id);
      setReviewNotice({
        message: result.message || (blocked ? "Review hidden from public stand." : "Review restored to public stand."),
        tone: "success",
      });
    } catch (error) {
      const isPlanRestriction = error?.status === 403 || /review blocking/i.test(error?.message || "");
      setReviewNotice({
        message: isPlanRestriction ? "Review blocking is available on the Platinum plan." : error.message || "Could not update review visibility.",
        tone: isPlanRestriction ? "upgrade" : "error",
      });
    }
  };

  const openSupportFlow = (topic = "Contact Support") => {
    setSupportTopic(topic);
    setShowAccountMenu(false);
    setShowNotifications(false);
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    setActiveTab("support");
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
  const entitlementState = resolveEntitlements({
    summary: subscriptionSummary,
    customerSubscription: customerSubscriptionState,
    providerSubscription: subscriptionState,
  });
  const customerPremiumActive = entitlementState.hasCustomerPremium;
  const canUseSmartMatch = entitlementState.canUseSmartMatch;
  const smartMatchUpsellVisible = Boolean(currentUser?.username) && !canUseSmartMatch;
  useEffect(() => {
    if (customerPremiumActive && customerPremiumPaymentOpen) {
      setCustomerPremiumPaymentOpen(false);
    }
  }, [customerPremiumActive, customerPremiumPaymentOpen]);
  const trialAccessExpired =
    effectiveIsBarber &&
    !isAdmin &&
    screen === "app" &&
    subscriptionReady &&
    !subscriptionLoading &&
    (subscriptionTier === "LOCKED" || subscriptionState?.status === "expired");
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

  const submitQuoteRequest = async (payload) => {
    if (!currentUser?.username || !selectedBarber) return;
    if (!quoteIdempotencyRef.current) quoteIdempotencyRef.current = makeId("quote-request");
    setQuoteSubmitting(true);
    setQuoteError("");
    try {
      await createQuoteRequest({
        ...payload,
        providerId: selectedBarber.id,
        idempotencyKey: quoteIdempotencyRef.current,
      });
      showSystemToast("Quote request sent", `${selectedBarber.business_name} can respond in this conversation.`, "booking");
      fetchQuoteRequests();
      setShowQuoteModal(false);
      setShowBarberProfile(false);
      openConversation({
        barber: selectedBarber,
        customerUsername: currentUser.username,
        targetName: selectedBarber.business_name,
      });
      quoteIdempotencyRef.current = "";
    } catch (error) {
      setQuoteError(error.message || "Could not send this quote request. Please retry.");
      throw error;
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const rescheduleBooking = async (bookingId, schedule) => {
    const existingBooking = bookings.find((item) => String(item.id) === String(bookingId));
    if (!existingBooking) throw new Error("Booking not found.");

    try {
      const data = await rescheduleBookingRequest(bookingId, schedule);
      const updatedBooking = mapServerBooking({
        ...data.booking,
        business_name: existingBooking.barberName,
        location: existingBooking.location,
        customer_username: existingBooking.customerUsername,
        customer_full_name: existingBooking.customerName,
      });
      setBookings((prev) => prev.map((item) => String(item.id) === String(bookingId) ? updatedBooking : item));
      writeStored(
        "bookings",
        "global",
        readStored("bookings", "global", []).map((item) => String(item.id) === String(bookingId) ? updatedBooking : item)
      );
      notifyBookingUpdate(updatedBooking);
      showSystemToast("Booking rescheduled", "The new time is pending provider confirmation.", "booking");
      fetchNotifications();
      return updatedBooking;
    } catch (error) {
      setGlobalError(error.message || "Could not reschedule booking.");
      throw error;
    }
  };

  const openProviderProfile = (provider) => {
    if (!provider) return;
    const providerId = String(provider.id || provider.owner_user_id || provider.business_name || "");
    const now = Date.now();
    if (providerId && providerOpenRef.current.id === providerId && now - providerOpenRef.current.at < 500) return;
    providerOpenRef.current = { id: providerId, at: now };
    const isOwner = currentUser?.username && String(provider.ownerUsername || "") === String(currentUser.username);
    if (!isOwner && !isPublicProvider(provider)) {
      setGlobalError("This business is not available yet.");
      setShowBarberProfile(false);
      setSelectedBarber(null);
      return;
    }
    setReviewNotice({ message: "", tone: "info" });
    setSelectedBarber(provider);
    setShowBarberProfile(true);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    // Keep the map mounted underneath (profile sheet sits above it via z-index)
    // so there's no blank/dark gap while the profile loads and closing the
    // profile returns to the same map position + filters.
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

  const openSmartMatch = (initial = {}) => {
    setSmartMatchInitial(initial || {});
    setPreviousMobileView(activeTab || "home");
    setShowBarberProfile(false);
    setShowBookingModal(false);
    setShowQuoteModal(false);
    setShowChat(false);
    setMapState((prev) => ({ ...prev, show: false }));
    window.history.pushState({}, "", appPath(SMART_MATCH_PATH));
    setActiveTab("smartMatch");
  };

  const openCategoryServices = (category) => {
    const nextCategory = category || "All";
    setSelectedCategory(nextCategory);
    setPreviousMobileView(activeTab === "categoryServices" ? "home" : activeTab || "home");
    setActiveTab("categoryServices");
  };

  const openProviderDiscoveryMap = (category = selectedCategory || "All") => {
    setMapState({
      show: true,
      category: category || "All",
      returnView: activeTab || "home",
    });
    window.history.pushState({}, "", appPath(MAP_PATH));
  };

  const closeProviderDiscoveryMap = () => {
    setMapState((prev) => ({ ...prev, show: false }));
    const returnTab = mapState.returnView && mapState.returnView !== "map" ? mapState.returnView : "home";
    setActiveTab(returnTab);
  };

  // Sidebar navigation from the desktop map dashboard. Maps dashboard nav keys
  // to real app tabs and closes the map. "favorites" has no dedicated tab yet,
  // so it routes to the profile screen where saved providers live.
  const navigateFromMap = (target) => {
    // Smart Match is a dedicated flow, not a tab. Without this it fell through to
    // the "home" default below — which is why tapping Smart Match in the map just
    // closed the map. Open the flow and carry the map's selected category in.
    if (target === "smart-match" || target === "smartMatch") {
      openSmartMatch({
        category: mapState.category && mapState.category !== "All" ? mapState.category : "",
      });
      return;
    }
    const tabByKey = {
      home: "home",
      discover: "home",
      map: "map",
      bookings: "bookings",
      inbox: "inbox",
      messages: "inbox",
      favorites: "profile",
      profile: "profile",
      dashboard: "dashboard",
      upgrade: "upgrade",
    };
    const nextTab = tabByKey[target] || "home";
    if (nextTab === "map") return;
    setMapState((prev) => ({ ...prev, show: false }));
    setActiveTab(nextTab);
  };

  const isAdminActive = isAdmin && (activeTab === "admin" || activeTab === "adminReports" || activeTab === "adminSms");
  const isProviderProfileOverlayOpen = showBarberProfile && Boolean(selectedBarber);
  const isBookingOverlayOpen = showBookingModal && Boolean(selectedBarber);
  const isQuoteOverlayOpen = showQuoteModal && Boolean(selectedBarber);
  const isChatOverlayOpen = showChat && Boolean(selectedBarber);
  const isEditStandOverlayOpen = showEditBarber && Boolean(myBarberProfile);
  const isAppOverlayOpen =
    activeTab === "upgrade" ||
    showTrialUpgradeScreen ||
    mapState.show ||
    isProviderProfileOverlayOpen ||
    isBookingOverlayOpen ||
    isQuoteOverlayOpen ||
    isChatOverlayOpen ||
    showRegisterBarber ||
    isEditStandOverlayOpen ||
    showNotifications ||
    showAccountMenu;

  const content = (
    <>
      {activeTab !== "bookingConfirmation" && activeTab !== "smartMatch" && activeTab !== "aiCoach" && !isAdminActive && (
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

      {activeTab !== "bookingConfirmation" && activeTab !== "smartMatch" && activeTab !== "aiCoach" && !isAdminActive && (
      <AccountMenu
        show={showAccountMenu}
        isBarber={effectiveIsBarber}
        isAdmin={isAdmin}
        accountName={profile.fullName || currentUser?.username}
        accountType={isAdmin ? "admin" : effectiveIsBarber ? "provider" : "customer"}
        accountPhoto={profileImage}
        accountUsername={currentUser?.username || profile.username || ""}
        accountEmail={profile.email || currentUser?.email || ""}
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

      {activeTab === "bookingConfirmation" && (
        <BookingConfirmationScreen
          booking={activeConfirmationBooking}
          provider={activeConfirmationProvider}
          onViewDetails={() => {
            setFocusedBookingId(String(activeConfirmationBooking?.id || ""));
            setConfirmedBooking(activeConfirmationBooking);
            setActiveTab("bookings");
          }}
          onMessageProvider={() => {
            const provider = activeConfirmationProvider || selectedBarber;
            if (provider) {
              openConversation({
                barber: provider,
                customerUsername: currentUser?.username || "",
                targetName: provider.business_name || "Provider",
              });
            }
          }}
          onBackHome={() => {
            setConfirmedBooking(null);
            setFocusedBookingId("");
            setActiveTab("home");
          }}
          onReportProblem={() => openSupportFlow("Report a Problem")}
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
            currentUser={currentUser}
            topBarbers={topBarbers}
            selectedBarber={selectedBarber}
            openBarber={openProviderProfile}
            toggleFavorite={toggleFavorite}
            requestLocation={requestLocation}
            locationLabel={locationLabel}
              locationLoading={locationLoading}
              onOpenCategory={openCategoryServices}
              onOpenMap={openProviderDiscoveryMap}
              onSearchSubmit={openSearchResults}
              onOpenSmartMatch={openSmartMatch}
              smartMatchPremiumActive={canUseSmartMatch}
              smartMatchUpsellVisible={smartMatchUpsellVisible}
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
            onOpenMap={openProviderDiscoveryMap}
            onOpenSmartMatch={openSmartMatch}
            onSearchSubmit={openSearchResults}
            smartMatchPremiumActive={canUseSmartMatch}
            smartMatchUpsellVisible={smartMatchUpsellVisible}
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
            onOpenMap={openProviderDiscoveryMap}
            onOpenSmartMatch={openSmartMatch}
            smartMatchPremiumActive={canUseSmartMatch}
            smartMatchUpsellVisible={smartMatchUpsellVisible}
          />
        </div>
      )}

      {activeTab === "bookings" && (
        <div className="tab-scene-v5">
          <BookingsScreen
          role={effectiveIsBarber ? "barber" : "customer"}
          bookings={bookings}
          quoteRequests={enrichedQuoteRequests}
          onExploreServices={() => setActiveTab("categories")}
          onOpenRequestConversation={(request) => {
            const barber = barbers.find((item) => String(item.id) === String(request?.providerId));
            if (!barber) {
              setGlobalError("This provider is no longer available.");
              return;
            }
            openConversation({
              barber,
              customerUsername: effectiveIsBarber ? (request?.customerUsername || barber.ownerUsername || "") : currentUser?.username || "",
              targetName: effectiveIsBarber ? (request?.customerName || "Customer") : barber.business_name,
            });
          }}
          onViewProviderStand={(request) => {
            const barber = barbers.find((item) => String(item.id) === String(request?.providerId));
            if (!barber) {
              setGlobalError("This provider is no longer available.");
              return;
            }
            openProviderProfile(barber);
          }}
          completeBooking={(id) => updateBookingStatus(id, "completed")}
          approveBooking={(id) => updateBookingStatus(id, "confirmed")}
          rejectBooking={(id) => updateBookingStatus(id, "rejected")}
          rescheduleBooking={rescheduleBooking}
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
          onReportBooking={(_booking, topic) => openSupportFlow(topic)}
          onBookAgain={(booking) => {
            const barber = barbers.find((item) => String(item.id) === String(booking?.barberId));
            if (!barber) {
              setGlobalError("This provider is no longer available.");
              return;
            }
            openProviderProfile(barber);
          }}
        />
        </div>
      )}

      {activeTab === "inbox" && (
        <div className="tab-scene-v5">
          <InboxScreen
            currentUserId={currentUser?.id}
            onExploreServices={() => setActiveTab("categories")}
            onOpenConversation={({ barberId, customerUsername, title }) => {
              const barber = barbers.find((b) => String(b.id) === String(barberId));
              if (!barber) {
                setGlobalError("This provider is no longer available.");
                return;
              }
              openConversation({
                barber,
                customerUsername: customerUsername || currentUser?.username || "",
                targetName: title,
              });
            }}
          />
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
          subscriptionSummary={subscriptionSummary}
          customerSubscriptionState={customerSubscriptionState}
          customerSubscriptionPlan={customerSubscriptionPlan}
          customerSubscriptionLoading={customerSubscriptionLoading}
          customerSubscriptionMessage={customerSubscriptionMessage}
          pendingCustomerSubscriptionPayment={pendingCustomerSubscriptionPayment}
          onUpgradeCustomerPremium={openCustomerPremiumPayment}
          onVerifyCustomerPremium={verifyCurrentCustomerPremium}
          onOpenSmartMatch={() => setActiveTab("smartMatch")}
          onOpenUpgradePlan={openUpgradePlan}
          onRequestWithdrawal={requestCurrentWithdrawal}
          onWalletUpdated={fetchWallet}
          walletTopupReady={walletTopupReady}
          walletTopupMessage={walletTopupReadinessMessage}
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
          onDeleteBarberStand={() => setDeleteStandConfirmOpen(true)}
          logout={logout}
          phoneCountries={PHONE_COUNTRIES}
          splitPhoneNumber={splitPhoneNumber}
          sanitizeDigits={sanitizeDigits}
          buildPhoneNumber={buildPhoneNumber}
          isValidPhoneNumber={isValidPhoneNumber}
          fileToDataUrl={fileToDataUrl}
          theme={theme}
          setTheme={setTheme}
          onNotificationToast={showSystemToast}
        />
        </div>
      )}

      {effectiveIsBarber && activeTab === "dashboard" && myBarberProfile?.is_banned && (
        <div className="provider-status-notice-v1 banned">
          <strong>Your business has been banned.</strong>
          <p>Your stand is no longer visible to customers and cannot accept bookings. If you believe this is a mistake, please contact Queless support.</p>
          {myBarberProfile.moderation_note && <p className="notice-reason">Admin note: {myBarberProfile.moderation_note}</p>}
        </div>
      )}

      {effectiveIsBarber && activeTab === "dashboard" && !myBarberProfile?.is_banned && myBarberProfile?.is_suspended && (
        <div className="provider-status-notice-v1 suspended">
          <strong>Your business is currently suspended.</strong>
          <p>Your stand is hidden from listings and cannot accept new bookings. Please contact Queless support to resolve this.</p>
          {myBarberProfile.moderation_note && <p className="notice-reason">Admin note: {myBarberProfile.moderation_note}</p>}
        </div>
      )}

      {effectiveIsBarber && activeTab === "dashboard" && !myBarberProfile?.is_banned && !myBarberProfile?.is_suspended && myBarberProfile?.review_status === "changes_requested" && (
        <div className="provider-status-notice-v1 changes">
          <strong>Action required: Changes requested for your business.</strong>
          <p>Your stand is currently unverified. Please review the feedback below and update your business profile.</p>
          {myBarberProfile.verification_change_reason && <p className="notice-reason">Reason: {myBarberProfile.verification_change_reason}</p>}
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
            if (myBarberProfile) {
              setSelectedBarber(myBarberProfile);
              setShowEditBarber(true);
            } else {
              setSelectedBarber(null);
              setShowRegisterBarber(true);
            }
          }}
          onOpenReports={() => setActiveTab("reports")}
          onOpenAiCoach={() => setActiveTab("aiCoach")}
          onOpenUpgradePlan={openUpgradePlan}
          onPublishStand={publishBarberStand}
          onViewPublicStand={() => {
            if (myBarberProfile) {
              setSelectedBarber(myBarberProfile);
              setShowBarberProfile(true);
            }
          }}
          onViewOnMap={() => {
            openProviderDiscoveryMap(myBarberProfile?.business_type || "All");
          }}
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
          onUpgradePlan={openUpgradePlan}
          onOpenAiCoach={() => setActiveTab("aiCoach")}
        />
      </div>
      )}

      {effectiveIsBarber && activeTab === "aiCoach" && !entitlementState.canUseProviderCoach && (
        <div className="tab-scene-v5 provider-coach-chat-scene">
          <section className="provider-status-notice-v1 changes">
            <strong>Provider Coach is included with Platinum Provider.</strong>
            <p>Upgrade to Platinum to open Coach and get guidance based on your stand, bookings, reviews, and customer activity.</p>
            <button type="button" className="btn-primary-v4" onClick={() => openUpgradePlan("PLATINUM")}>
              Upgrade to Platinum
            </button>
          </section>
        </div>
      )}

      {effectiveIsBarber && activeTab === "aiCoach" && entitlementState.canUseProviderCoach && (
        <div className="tab-scene-v5 provider-coach-chat-scene">
          <ProviderCoachChatScreen
            barber={myBarberProfile}
            subscription={subscriptionState}
            onBack={() => setActiveTab("dashboard")}
            onCreateStand={() => setShowRegisterBarber(true)}
            onEditStand={() => {
              setSelectedBarber(myBarberProfile);
              setShowEditBarber(true);
            }}
          />
        </div>
      )}

      {activeTab === "smartMatch" && (
        <div className="tab-scene-v5">
          <SmartMatchPage
            initial={smartMatchInitial}
            providers={enrichedBarbers.filter(isPublicProvider)}
            locationLabel={locationLabel}
            customerSubscription={customerSubscriptionState}
            premiumActive={canUseSmartMatch}
            customerSubscriptionLoading={customerSubscriptionLoading}
            customerSubscriptionMessage={customerSubscriptionMessage}
            pendingCustomerSubscriptionPayment={pendingCustomerSubscriptionPayment}
            onBack={() => setActiveTab(previousMobileView === "smartMatch" ? "home" : previousMobileView || "home")}
            onUpgradePremium={openCustomerPremiumPayment}
            onVerifyPremium={(reference) => verifyCurrentCustomerPremium(reference)}
            onContinueManualSearch={() => setActiveTab("searchResults")}
            onOpenProvider={(provider) => {
              openProviderProfile(provider);
            }}
            onAsk={(provider) =>
              openConversation({
                barber: provider,
                customerUsername: currentUser?.username,
                targetName: provider?.business_name || provider?.name,
              })
            }
            onViewOnMap={(provider) => openProviderDiscoveryMap(provider?.business_type || "All")}
          />
        </div>
      )}

      {isAdmin && (activeTab === "admin" || activeTab === "adminReports" || activeTab === "adminSms") && (
        <div className="tab-scene-v5">
          <AdminPanel
            currentUser={currentUser}
            initialSection={activeTab === "adminReports" ? "reports" : activeTab === "adminSms" ? "sms" : "dashboard"}
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
            onNotificationToast={showSystemToast}
          />
        </div>
      )}

      {activeTab === "help" && (
        <div className="tab-scene-v5">
          <HelpCenterScreen
            onOpenSupport={openSupportFlow}
            onBackHome={() => setActiveTab("home")}
          />
        </div>
      )}

      {activeTab === "policies" && (
        <div className="tab-scene-v5">
          <PoliciesScreen onOpenSupport={openSupportFlow} />
        </div>
      )}

      {activeTab === "support" && (
        <div className="tab-scene-v5">
          <SupportScreen
            initialTopic={supportTopic}
            profile={profile}
            currentUser={currentUser}
            onBackHome={() => setActiveTab("home")}
          />
        </div>
      )}

      {activeTab !== "bookingConfirmation" && activeTab !== "smartMatch" && activeTab !== "aiCoach" && !isAdminActive && (
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isBarber={effectiveIsBarber}
        isAdmin={isAdmin}
        currentUser={currentUser}
        unreadMessages={unreadMessages}
        unreadNotifications={unreadNotifications.length}
        onOpenMap={() => openProviderDiscoveryMap("All")}
        onOpenNotifications={() => {
          setShowNotifications((value) => !value);
          setShowAccountMenu(false);
          fetchNotifications();
        }}
        isOverlayOpen={isAppOverlayOpen}
      />
      )}

      <ProviderDiscoveryMapOverlay
        show={mapState.show}
        theme={theme}
        setTheme={setTheme}
        currentUser={currentUser}
        category={mapState.category}
        providers={mapState.category && mapState.category !== "All" ? enrichedBarbers.filter(isPublicProvider) : filteredBarbers.length ? filteredBarbers : enrichedBarbers.filter(isPublicProvider)}
        userLocation={userLocation}
        locationLabel={locationLabel}
        locationMessage={locationMessage}
        locationLoading={locationLoading}
        providersLoading={barbersLoading}
        providersError={barbersError}
        isBarber={effectiveIsBarber}
        myStand={myBarberProfile}
        favorites={favorites}
        unreadCount={unreadNotifications.length}
        onClose={closeProviderDiscoveryMap}
        onOpenMenu={() => {
          setShowAccountMenu(true);
          setShowNotifications(false);
        }}
        onNavigate={navigateFromMap}
        onUseCurrentLocation={requestLocation}
        onManualLocation={changeLocation}
        onClearLocation={clearLocation}
        onRefreshProviders={fetchBarbers}
        onOpenProvider={openProviderProfile}
        onMessageProvider={(provider) =>
          openConversation({
            barber: provider,
            customerUsername: currentUser?.username,
            targetName: provider?.business_name,
          })
        }
        onToggleFavorite={toggleFavorite}
        onOpenNotifications={() => {
          setShowNotifications((value) => !value);
          setShowAccountMenu(false);
          fetchNotifications();
        }}
      />

      {/* Conditionally mounted so the provider chunk loads on first open (not at
          boot) and the Suspense/skeleton exist only while open. Its OWN Suspense
          means a slow chunk shows the cream skeleton here — never the app-wide
          dark fallback. The error boundary catches a failed chunk download and
          shows a cream Retry/Close card instead of an infinite skeleton. */}
      {showBarberProfile && (
      <OverlayErrorBoundary
        key={providerChunkAttempt}
        title="Couldn't open this provider"
        message="We couldn't load this provider. Check your connection and try again."
        testId="provider-profile-error"
        onRetry={() => setProviderChunkAttempt((n) => n + 1)}
        onClose={() => {
          setReviewNotice({ message: "", tone: "info" });
          setShowBarberProfile(false);
        }}
      >
      <Suspense fallback={<ProviderProfileSkeleton />}>
      <ProviderProfileLazy
        show={showBarberProfile}
        barber={selectedBarber ? { ...selectedBarber, reviews: reviewsByBarber[selectedBarber.id] || [], reviewCount: (reviewsByBarber[selectedBarber.id] || []).length, rating: getAverageRating(reviewsByBarber[selectedBarber.id] || []) } : selectedBarber}
        reviewBlockUsage={selectedBarber ? reviewBlockUsageByBarber[selectedBarber.id] : null}
        reviewNotice={reviewNotice}
        currentUser={currentUser}
        currentUserIsBarber={effectiveIsBarber}
        fallbackImage={selectedBarber ? resolveProviderImage(selectedBarber) : NEUTRAL_PLACEHOLDER}
        onClose={() => {
          setReviewNotice({ message: "", tone: "info" });
          setShowBarberProfile(false);
        }}
        onToggleFavorite={toggleFavorite}
        onBook={(service) => {
          const services = getBarberServices(selectedBarber);
          const targetService = service || services[0];
          if (targetService?.id) {
            setSelectedService(targetService.id);
            const locationType = String(targetService.location_type || "provider_location").toLowerCase();
            const supportsHome =
              Number(selectedBarber?.home_service_enabled || selectedBarber?.homeServiceEnabled || 0) === 1 ||
              locationType === "customer_location";
            setBookingLocationType(locationType === "customer_location" && supportsHome ? "customer_location" : "provider_location");
            setBookingAddress("");
          }
          setShowBookingModal(true);
          setShowChat(false);
          setShowQuoteModal(false);
        }}
        onRequestQuote={() => {
          quoteIdempotencyRef.current = makeId("quote-request");
          setQuoteError("");
          setShowQuoteModal(true);
          setShowBookingModal(false);
          setShowChat(false);
        }}
        onOpenChat={() => openConversation({
          barber: selectedBarber,
          customerUsername: currentUser?.username || "",
          targetName: selectedBarber?.business_name || "Provider",
        })}
        onReportProvider={() => openSupportFlow("Report provider")}
        onToggleReviewBlock={toggleReviewPublicBlock}
        onEditStand={() => {
          setShowBarberProfile(false);
          setSelectedBarber(myBarberProfile);
          setShowEditBarber(true);
        }}
        onOpenDashboard={() => {
          setShowBarberProfile(false);
          setActiveTab("dashboard");
        }}
        onViewOnMap={() => {
          setShowBarberProfile(false);
          openProviderDiscoveryMap(myBarberProfile?.business_type || "All");
        }}
      />
      </Suspense>
      </OverlayErrorBoundary>
      )}

      {/* Shared scoped boundary for the remaining lazy overlays: a slow/late
          chunk shows nothing (null) instead of blanking the whole app with the
          dark app-wide fallback. They return null when closed, so null is the
          correct fallback. */}
      <Suspense fallback={null}>
      <BookingModal
        show={showBookingModal}
        barber={selectedBarber}
        dateOptions={dateOptions}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        timeSlots={availableTimeSlots}
        availabilityStatus={bookingAvailabilityStatus}
        selectedService={selectedService}
        setSelectedService={setSelectedService}
        selectedTeamMemberId={selectedTeamMemberId}
        setSelectedTeamMemberId={setSelectedTeamMemberId}
        selectedPaymentMethod={selectedPaymentMethod}
        setSelectedPaymentMethod={setSelectedPaymentMethod}
        paymentPhone={mtnPaymentPhone}
        setPaymentPhone={setMtnPaymentPhone}
        bookingLocationType={bookingLocationType}
        setBookingLocationType={setBookingLocationType}
        bookingAddress={bookingAddress}
        setBookingAddress={setBookingAddress}
        locationDetecting={bookingLocationDetecting}
        onUseCurrentLocation={useCurrentLocationForBooking}
        onRequestQuote={() => {
          quoteIdempotencyRef.current = makeId("quote-request");
          setQuoteError("");
          setShowQuoteModal(true);
          setShowBookingModal(false);
        }}
        pendingPayment={pendingBookingPayment}
        onVerifyPayment={verifyCurrentBookingPayment}
        onlinePaymentsReady={bookingOnlinePaymentsReady}
        paymentReadinessMessage={bookingPaymentReadinessMessage}
        onClose={() => setShowBookingModal(false)}
        onOpenSmartMatch={() => openSmartMatch({ category: selectedBarber?.business_type || selectedBarber?.category_name || "" })}
        smartMatchPremiumActive={canUseSmartMatch}
        onMessageProvider={() => {
          openConversation({
            barber: selectedBarber,
            customerUsername: currentUser?.username || "",
            targetName: selectedBarber?.business_name || "Provider",
          });
          setShowBookingModal(false);
        }}
        onConfirm={createBooking}
        creatingBooking={creatingBooking}
        bookingCooldownInfo={bookingCooldownInfo}
        walletBalance={Number(walletState?.wallet?.balance || 0)}
      />

      <QuoteRequestModal
        show={showQuoteModal}
        provider={selectedBarber}
        onClose={() => setShowQuoteModal(false)}
        onSubmit={submitQuoteRequest}
        submitting={quoteSubmitting}
        error={quoteError}
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
        onRetry={sendMessage}
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
        profile={profile}
        onClose={() => setShowEditBarber(false)}
        onSubmit={updateBarberStand}
      />

      <RegisterBarberModal
        show={showRegisterBarber}
        profile={profile}
        onClose={() => setShowRegisterBarber(false)}
        onSubmit={registerBarber}
      />

      <PaymentFlowModal
        show={customerPremiumPaymentOpen && !customerPremiumActive}
        title="Customer Premium"
        subtitle="Choose how you want to pay for Smart Match access."
        amountLabel={`Premium: UGX ${CUSTOMER_PREMIUM_PLAN.monthlyPrice.toLocaleString("en-UG")}/month`}
        amount={Math.max(CUSTOMER_PREMIUM_PLAN.monthlyPrice, Number(customerSubscriptionPlan?.monthlyPrice || CUSTOMER_PREMIUM_PLAN.monthlyPrice))}
        defaultPhone={profile.phone || currentUser?.phone || ""}
        loading={customerSubscriptionLoading}
        message={customerSubscriptionMessage}
        pendingPayment={pendingCustomerSubscriptionPayment}
        mtnReady={walletTopupReady}
        mtnReadinessMessage={walletTopupReadinessMessage}
        airtelReady={false}
        submitLabel={PAYMENTS_ENABLED ? "Confirm Premium Payment" : "Apply Premium Promo"}
        comingSoon={!PAYMENTS_ENABLED}
        promoEnabled
        allowPromoOnly
        promoLabel="Customer Premium promo code"
        onClose={() => setCustomerPremiumPaymentOpen(false)}
        onSubmit={({ method, phoneNumber, promoCode }) => startCurrentCustomerPremiumUpgrade({ billingCycle: "monthly", provider: method, phoneNumber, promoCode })}
        onVerify={async (reference) => {
          const ok = await verifyCurrentCustomerPremium(reference);
          if (ok) window.setTimeout(() => setCustomerPremiumPaymentOpen(false), 900);
          return ok;
        }}
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
          initialSelectedTier={showTrialUpgradeScreen ? (normalizeProviderPlan(myBarberProfile?.selected_plan || subscriptionState?.tier) || "FREE") : upgradeSelectedTier}
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
      </Suspense>

      {deleteStandConfirmOpen ? (
        <>
          <button
            type="button"
            className="delete-stand-backdrop-v16"
            onClick={() => setDeleteStandConfirmOpen(false)}
            disabled={deleteStandLoading}
            aria-label="Close delete confirmation"
          />
          <section
            className="delete-stand-confirm-v16"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-stand-title"
            aria-describedby="delete-stand-description"
          >
            <div className="delete-stand-icon-v16"><FiAlertTriangle /></div>
            <div>
              <h2 id="delete-stand-title">Delete stand?</h2>
              <p id="delete-stand-description">Are you sure you want to delete this stand? This action may remove the business from public search and bookings.</p>
            </div>
            {globalError ? <div className="form-error-v4">{globalError}</div> : null}
            <div className="delete-stand-actions-v16">
              <button type="button" className="secondary-btn-v4" onClick={() => setDeleteStandConfirmOpen(false)} disabled={deleteStandLoading}>
                Cancel
              </button>
              <button type="button" className="danger-btn-v16" onClick={deleteBarberStand} disabled={deleteStandLoading}>
                {deleteStandLoading ? "Deleting..." : "Yes, Delete Stand"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </>
  );

  const appContent = content;

  const isAuthScreen = screen === "login";
  return (
    <div className={`app-wrap-v4 ${theme} ${isAuthScreen ? "app-auth-v4" : ""}`}>
      <div className={`phone-frame-v4 ${isAuthScreen ? "phone-frame-auth-v4" : ""}`}>
        <div className={`screen-v4 ${isAuthScreen ? "screen-auth-v4" : ""}`}>
          <Suspense
            fallback={
              <div className="route-fallback-v4" role="status" aria-label="Loading">
                <span className="route-fallback-spinner" aria-hidden="true" />
                <span className="route-fallback-text">Loading…</span>
              </div>
            }
          >
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
              <PageErrorBoundary onGoHome={() => setActiveTab("home")}>
                {appContent}
              </PageErrorBoundary>
            )}
          </Suspense>
          {showInitialLoadingScreen ? <LoadingScreen /> : null}
        </div>
      </div>
    </div>
  );
}

export default App;
