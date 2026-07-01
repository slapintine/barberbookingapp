import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./business-wizard-v10.css";
import {
  FiArrowLeft,
  FiCamera,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiCreditCard,
  FiImage,
  FiMapPin,
  FiNavigation,
  FiPackage,
  FiPlus,
  FiShoppingBag,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { DEFAULT_SERVICE_TYPES, SERVICE_CATEGORIES, formatServicePrice, normalizeServiceForBooking } from "../../utils/serviceCatalog.js";
import { getMapIconOption, getMapIconTypeForCategory } from "../../utils/mapIconCategories.js";
import { getCategoryDef, getCategoryList, CategorySelectorItem } from "../../utils/categoryRegistry.jsx";
import { getGeolocationErrorMessage, reverseGeocodeCoordinates } from "../../utils/locationUtils.js";
import {
  formatSubscriptionPrice,
  getPlanFeatures,
  getPlanImageCountMessage,
  getPlanImageLimitLabel,
  getPlanImageLimits,
  getPlanImageSizeMessage,
  getStandFinalAction,
  PROVIDER_PLANS,
  isProviderPlanActive,
} from "../../utils/subscriptionPlans.js";
import { PAYMENTS_ENABLED } from "../../utils/launchFlags.js";
import { toUgLocalDigits } from "../../utils/ugandaPhone.js";
import ProductCatalogueEditor from "../products/ProductCatalogueEditor.jsx";
import useProductMarketplaceAvailability from "../../hooks/useProductMarketplaceAvailability.js";
import { getMarketplaceMode, getMarketplacePlanContent, MARKETPLACE_MODES, supportsProducts, supportsServices } from "../../utils/marketplaceMode.js";
import { getMyProducts } from "../../api/productsApi.js";
import { buildAssetUrl } from "../../config/api.js";
import {
  MAX_SERVICE_DURATION_MINUTES,
  SERVICE_DELIVERY_MODES,
  SERVICE_DURATION_PRESETS,
  convertDurationToMinutes,
  formatServiceDuration,
  getUgandaStandPhoneError,
  inferDurationInput,
  normalizeUgandaStandPhone,
  requiresFixedBusinessLocation,
} from "../../utils/standSetupUtils.js";

const DEFAULT_CENTER = [0.3136, 32.5811];
const TOTAL_STEPS = 6;
const BYTES_PER_MB = 1024 * 1024;
const IMAGE_OPTIMIZE_THRESHOLD_BYTES = 3 * BYTES_PER_MB;
const IMAGE_MAX_DIMENSION = 1800;

const DEFAULT_FORM = {
  businessName: "",
  phone: "",
  documentName: "",
  businessType: "Home Services",
  mapIconType: "",
  location: "",
  services: [],
  pricing: "20000",
  scheduleStart: "08:00",
  scheduleEnd: "20:00",
  latitude: "0.3136",
  longitude: "32.5811",
  image: "",
  acceptsWallet: false,
  acceptsCash: true,
  homeServiceEnabled: false,
  introText: "",
  standType: "individual",
  teamMembers: "",
  portfolio: [],
  selectedPlan: "FREE",
  startFreeTrial: false,
  durationUnit: "minutes",
  dirtyFields: [],
  marketplaceMode: MARKETPLACE_MODES.SERVICE,
  subcategory: "",
  coverImage: "",
  businessHours: {},
  pickupAvailable: true,
  deliveryAvailable: false,
  deliveryAreas: [],
  deliveryFee: "",
  deliveryNotes: "",
  products: [],
  deletedProductIds: [],
};

function getStandBackupKey(kind, value) {
  const suffix = String(value || "guest").replace(/[^\w.-]+/g, "-").slice(0, 80) || "guest";
  return `queless_stand_setup_backup_${kind}_${suffix}`;
}

function readStandFormBackup(key, savedAt = 0) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed?.form || Number(parsed.updatedAt || 0) <= Number(savedAt || 0)) return null;
    return parsed.form;
  } catch {
    return null;
  }
}

function writeStandFormBackup(key, form) {
  if (typeof window === "undefined" || !key) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({ form, updatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function arrayFromMaybeJson(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function booleanFromApi(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return [true, 1, "1", "true", "yes"].includes(value);
}

function createBlankService(category = SERVICE_CATEGORIES[0]) {
  return {
    id: `service-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    service_name: "",
    category,
    price_extra: 0,
    min_price: "",
    max_price: "",
    starting_price: "",
    pricing_type: "fixed",
    location_type: "provider_location",
    duration_minutes: "",
    description: "",
    is_available: true,
    image: "",
  };
}

const PRICING_MODES = [
  { value: "fixed", label: "Fixed", hint: "One clear price" },
  { value: "range", label: "Range", hint: "Min and max price" },
  { value: "starting_from", label: "From", hint: "Starting price" },
  { value: "quote", label: "Quote", hint: "Customer requests quote" },
];

const PRODUCT_CATEGORIES = [
  "Boutique & Fashion",
  "Cosmetics & Beauty Products",
  "Food & Groceries",
  "Electronics",
  "Home & Living",
  "Hardware",
  "Health Products",
  "Gifts & Crafts",
  "Other Products",
];

function getServiceLocationLabel(service = {}) {
  const type = String(service.location_type || "provider_location").toLowerCase();
  return SERVICE_DELIVERY_MODES.find((mode) => mode.value === type)?.label || "Customer visits stand";
}

function getServiceReadiness(service = {}) {
  const pricingType = String(service.pricing_type || "fixed").toLowerCase();
  if (!String(service.service_name || "").trim()) return "Needs title";
  if (pricingType === "fixed" && Number(service.price_extra || 0) <= 0) return "Add fixed price";
  if (pricingType === "range") {
    if (Number(service.min_price || 0) <= 0 || Number(service.max_price || 0) <= 0) return "Complete range";
    if (Number(service.max_price) <= Number(service.min_price)) return "Check range";
  }
  if (pricingType === "starting_from" && Number(service.starting_price || 0) <= 0) return "Add start price";
  if (Number(service.duration_minutes || 0) < 5 || Number(service.duration_minutes) > MAX_SERVICE_DURATION_MINUTES) return "Add duration";
  return pricingType === "quote" ? "Quote required" : "Ready";
}

function cleanPricingForMode(service = {}, pricingType = "fixed") {
  const next = { ...service, pricing_type: pricingType };
  if (pricingType !== "fixed") next.price_extra = 0;
  if (pricingType !== "range") {
    next.min_price = "";
    next.max_price = "";
  }
  if (pricingType !== "starting_from") next.starting_price = "";
  return next;
}

// In the wizard we keep user-cleared service titles empty (preserveEmptyTitle)
// so the controlled title input can be fully deleted/replaced without
// "General service" snapping back on every render.
function normalizeFormServices(value, fallbackToDefaults = false) {
  const opts = { preserveEmptyTitle: true };
  if (Array.isArray(value) && value.length) return value.map((item, idx) => normalizeServiceForBooking(item, idx, opts));
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .flatMap((item) => {
        const value = item.trim();
        return value ? [value] : [];
      })
      .map((item, idx) => normalizeServiceForBooking(item, idx, opts));
  }
  return fallbackToDefaults ? DEFAULT_SERVICE_TYPES.map((item, idx) => normalizeServiceForBooking(item, idx, opts)) : [];
}

// Maps a validation field key to the wizard step that owns it, so the single
// validation summary can jump the user straight to the relevant step.
const FIELD_TO_STEP = {
  businessName: 1,
  businessType: 1,
  phone: 1,
  location: 2,
  services: 4,
  fulfilment: 2,
  products: 4,
};

// A business stand is created against the authenticated account id. We do NOT
// require the account owner's personal first/last name — many real accounts have
// no personal name set, and the wizard never collects one. Validation covers
// only the business information the wizard actually gathers.
export function validateBusinessStand(data = {}) {
  const form = data && typeof data === "object" ? data : {};
  const services = normalizeFormServices(form.services);
  const marketplaceMode = getMarketplaceMode(form.marketplaceMode || form.marketplace_mode);
  const serviceStand = supportsServices(marketplaceMode);
  const shopStand = supportsProducts(marketplaceMode);
  const products = Array.isArray(form.products) ? form.products : [];
  const missing = [];

  if (!String(form.businessName || "").trim()) missing.push({ key: "businessName", label: "Business name is required" });
  if (!String(form.businessType || "").trim()) missing.push({ key: "businessType", label: "Business category is required" });
  if (getUgandaStandPhoneError(form.phone)) missing.push({ key: "phone", label: "Valid Uganda phone number is required" });
  if (
    serviceStand &&
    requiresFixedBusinessLocation(services) &&
    !String(form.location || "").trim()
  ) missing.push({ key: "location", label: "Business or service-area location is required" });
  if (shopStand && !String(form.location || "").trim()) missing.push({ key: "location", label: "Shop location is required" });
  if (serviceStand && !services.length) missing.push({ key: "services", label: "At least one service is required" });
  if (serviceStand && services.some((service) => !String(service.service_name || "").trim())) missing.push({ key: "services", label: "Each service needs a clear listing title" });
  if (shopStand && !form.pickupAvailable && !form.deliveryAvailable) {
    missing.push({ key: "fulfilment", label: "Choose pickup or delivery" });
  }
  if (shopStand && !products.some((product) => (product.is_active ?? product.isActive ?? true) && !product.is_deleted)) {
    missing.push({ key: "products", label: "At least one active product is required" });
  }

  return missing;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getDataUrlBytes(dataUrl = "") {
  const base64 = String(dataUrl).split(",", 2)[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function getImageReferenceStats(value = "") {
  const image = String(value || "").trim();
  return image ? { count: 1, bytes: getDataUrlBytes(image) } : { count: 0, bytes: 0 };
}

function addStats(target, value = "") {
  const stats = getImageReferenceStats(value);
  target.count += stats.count;
  target.bytes += stats.bytes;
  return target;
}

function createImageStats() {
  return {
    logo: { count: 0, bytes: 0 },
    service: { count: 0, bytes: 0 },
    portfolio: { count: 0, bytes: 0 },
  };
}

function getFormImageStats(form = {}) {
  const stats = createImageStats();
  addStats(stats.logo, form.image);
  (Array.isArray(form.portfolio) ? form.portfolio : []).forEach((item) => {
    addStats(stats.portfolio, item.beforeImage || item.before_image);
    addStats(stats.portfolio, item.afterImage || item.after_image || item.image);
  });
  (Array.isArray(form.team_members || form.teamMembers) ? form.team_members || form.teamMembers : []).forEach((member) => {
    addStats(stats.service, member.image);
  });
  normalizeFormServices(form.services).forEach((service) => addStats(stats.service, service.image));
  return stats;
}

function getStatsForType(currentStats, imageType) {
  if (currentStats?.logo || currentStats?.service || currentStats?.portfolio) {
    return currentStats[imageType] || { count: 0, bytes: 0 };
  }
  return currentStats || { count: 0, bytes: 0 };
}

function getLimitForType(limits, imageType) {
  if (imageType === "logo") return { maxImages: limits.logoImages, totalBytes: limits.logoTotalBytes };
  if (imageType === "service") return { maxImages: limits.serviceImages, totalBytes: limits.serviceTotalBytes };
  return { maxImages: limits.portfolioImages, totalBytes: limits.portfolioTotalBytes };
}

function getNextImageLimitMessage({ currentStats, existingImage = "", incomingFiles = [], planTier, imageType = "portfolio" }) {
  const limits = getPlanImageLimits(planTier);
  const scopedStats = getStatsForType(currentStats, imageType);
  const scopedLimits = getLimitForType(limits, imageType);
  const existing = getImageReferenceStats(existingImage);
  const incomingCount = incomingFiles.length;
  const incomingBytes = incomingFiles.reduce((sum, file) => sum + Number(file?.size || 0), 0);
  if (imageType === "service") {
    if (incomingCount > scopedLimits.maxImages) {
      return { tone: "upgrade", message: getPlanImageCountMessage(planTier, imageType) };
    }
    if (incomingBytes > scopedLimits.totalBytes) {
      return { tone: "error", message: getPlanImageSizeMessage(planTier, imageType) };
    }
    return null;
  }
  const nextCount = scopedStats.count - existing.count + incomingCount;
  const nextBytes = scopedStats.bytes - existing.bytes + incomingBytes;
  if (nextCount > scopedLimits.maxImages) {
    return { tone: imageType === "logo" ? "error" : "upgrade", message: getPlanImageCountMessage(planTier, imageType) };
  }
  if (nextBytes > scopedLimits.totalBytes) {
    return { tone: "error", message: getPlanImageSizeMessage(planTier, imageType) };
  }
  return null;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected image."));
    };
    image.src = url;
  });
}

async function optimizeImageFile(file, { onStatus } = {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Please choose a PNG, JPG, or WebP image.");
  }
  if (file.size <= IMAGE_OPTIMIZE_THRESHOLD_BYTES) {
    return fileToDataUrl(file);
  }

  onStatus?.("Optimizing images...");
  try {
    const image = await loadImageFromFile(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const optimized = canvas.toDataURL("image/jpeg", 0.84);
    return optimized;
  } catch {
    // Backend validation still enforces the same limit if browser optimization fails.
  }

  return fileToDataUrl(file);
}

function ImageUploadInput({
  image,
  onChange,
  title,
  description,
  emptyLabel = "Upload image",
  uploadLabel = "Upload image",
  changeLabel = "Change image",
  previewAlt = "uploaded preview",
  compact = false,
  planTier = "FREE",
  currentImageStats = { count: 0, bytes: 0 },
  imageType = "logo",
}) {
  const imageInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const precheck = getNextImageLimitMessage({
      currentStats: currentImageStats,
      existingImage: image,
      incomingFiles: [file],
      planTier,
      imageType,
    });
    if (precheck) {
      setMessageTone(precheck.tone);
      setMessage(precheck.message);
      event.target.value = "";
      return;
    }
    try {
      setUploading(true);
      setMessage("");
      setProgress(22);
      const result = await optimizeImageFile(file, {
        onStatus: (status) => {
          setMessageTone("info");
          setMessage(status);
          setProgress(56);
        },
      });
      const limits = getPlanImageLimits(planTier);
      const scopedStats = getStatsForType(currentImageStats, imageType);
      const scopedLimits = getLimitForType(limits, imageType);
      const existing = getImageReferenceStats(image);
      const nextBytes = scopedStats.bytes - existing.bytes + getDataUrlBytes(result);
      if (nextBytes > scopedLimits.totalBytes) {
        throw new Error(getPlanImageSizeMessage(planTier, imageType));
      }
      setProgress(100);
      onChange(result);
      setMessageTone("success");
      setMessage(file.size > IMAGE_OPTIMIZE_THRESHOLD_BYTES ? "Image optimized and ready." : "");
    } catch (error) {
      setMessageTone("error");
      setMessage(error.message || "Your images are too large for your current plan. Please reduce the image size or upgrade your plan.");
    }
    finally {
      event.target.value = "";
      window.setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 220);
    }
  };

  return (
    <div className={compact ? "image-upload-v9 compact" : "image-upload-v9"}>
      <div className="image-upload-head-v9">
        <span>{title}</span>
        {description ? <small>{description}</small> : null}
      </div>
      <button type="button" className="image-upload-preview-v9" onClick={() => imageInputRef.current?.click()}>
        {image ? (
          <img src={buildAssetUrl(image)} alt={previewAlt} />
        ) : (
          <span className="image-upload-empty-v9">
            <FiCamera />
            <strong>{emptyLabel}</strong>
          </span>
        )}
      </button>
      {uploading ? (
        <div className="upload-progress-v9" aria-label="Uploading image">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {message ? <div className={`image-upload-message-v10 ${messageTone}`}>{message}</div> : null}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageChange}
      />
      <div className="image-upload-actions-v9">
        {image ? (
          <button type="button" className="secondary-btn-v4 danger-soft-v9" onClick={() => {
            setMessage("");
            onChange("");
          }}>
            Remove
          </button>
        ) : (
          <small>Tap the image area to upload. {getPlanImageLimitLabel(planTier, imageType)}</small>
        )}
      </div>
    </div>
  );
}

function PortfolioImageInput({ portfolio = [], onChange, maxPhotos = Infinity, planName = "Platinum", planTier = "FREE", currentImageStats = { count: 0, bytes: 0 } }) {
  const portfolioInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");
  const portfolioItems = Array.isArray(portfolio) ? portfolio : [];

  const handlePortfolioChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const precheck = getNextImageLimitMessage({
      currentStats: currentImageStats,
      incomingFiles: files,
      planTier,
      imageType: "portfolio",
    });
    if (precheck) {
      setMessageTone(precheck.tone);
      setMessage(precheck.message);
      onChange(portfolioItems);
      event.target.value = "";
      return;
    }
    try {
      setUploading(true);
      setMessage("");
      setProgress(25);
      const images = await Promise.all(files.map((file) => optimizeImageFile(file, {
        onStatus: (status) => {
          setMessageTone("info");
          setMessage(status);
          setProgress(58);
        },
      })));
      const limits = getPlanImageLimits(planTier);
      const scopedStats = getStatsForType(currentImageStats, "portfolio");
      const optimizedBytes = images.reduce((sum, image) => sum + getDataUrlBytes(image), 0);
      if (scopedStats.bytes + optimizedBytes > limits.portfolioTotalBytes) {
        throw new Error(getPlanImageSizeMessage(planTier, "portfolio"));
      }
      setProgress(100);
      const nextItems = images.map((image, index) => ({
        id: `portfolio-${Date.now()}-${index}`,
        title: "Portfolio image",
        service: "",
        beforeImage: "",
        afterImage: image,
        note: "",
      }));
      onChange([...portfolioItems, ...nextItems]);
      setMessageTone("success");
      setMessage(files.some((file) => file.size > IMAGE_OPTIMIZE_THRESHOLD_BYTES) ? "Images optimized and ready." : "");
    } catch (error) {
      setMessageTone("error");
      setMessage(error.message || "Your images are too large for your current plan. Please reduce the image size or upgrade your plan.");
    }
    finally {
      event.target.value = "";
      window.setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 220);
    }
  };

  const removePortfolioItem = (index) => {
    onChange(portfolioItems.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="image-upload-v9 portfolio-upload-v9 compact-portfolio-v10">
      <div className="image-upload-head-v9">
        <span>Portfolio photos</span>
        <small>{getPlanImageLimitLabel(planTier, "portfolio")}</small>
      </div>
      <input
        ref={portfolioInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handlePortfolioChange}
      />
      <button type="button" className="image-upload-preview-v9 portfolio-drop-v9" onClick={() => portfolioInputRef.current?.click()}>
        <span className="image-upload-empty-v9">
          <FiImage />
          <strong>{portfolioItems.length ? "Add more photos" : "Upload portfolio photos"}</strong>
        </span>
      </button>
      {Number.isFinite(maxPhotos) && getStatsForType(currentImageStats, "portfolio").count >= maxPhotos ? (
        <div className="wizard-note-v10">{getPlanImageCountMessage(planTier, "portfolio")}</div>
      ) : null}
      {uploading ? (
        <div className="upload-progress-v9" aria-label="Uploading portfolio images">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {message ? <div className={`image-upload-message-v10 ${messageTone}`}>{message}</div> : null}
      {portfolioItems.length ? (
        <div className="portfolio-preview-grid-v9">
          {portfolioItems.map((item, index) => {
            const image = item.afterImage || item.beforeImage || item.image;
            return image ? (
              <div key={item.id || index} className="portfolio-preview-v9">
                <img src={buildAssetUrl(image)} alt="Portfolio preview" />
                <button type="button" aria-label="Remove portfolio image" onClick={() => removePortfolioItem(index)}>
                  <FiX />
                </button>
              </div>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}

function StepHeader({ currentStep, totalSteps = TOTAL_STEPS, stepTitle }) {
  return (
    <div className="business-step-progress-v10">
      <div className="business-step-progress-copy-v10">
        <span>Step {currentStep} of {totalSteps} - {stepTitle}</span>
        <strong>{stepTitle}</strong>
        <small>Takes about 3 minutes.</small>
      </div>
      <div className="progress-track-v10">
        <div className="progress-fill-v10" style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
      </div>
    </div>
  );
}

function WizardNotice({ children }) {
  return <div className="wizard-note-v10">{children}</div>;
}

function RequiredMark() {
  return <span className="required-marker-v10" aria-label="required">*</span>;
}

function FieldMessage({ message }) {
  return message ? <small className="field-error-v10">{message}</small> : null;
}

function BarberStandFormModal({ show, title, form, setForm, onClose, onSubmit, requirePlan = false, profile = {}, backupKey = "", autoSaveEnabled = false }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState("");
  const [missingFields, setMissingFields] = useState([]);
  const [activeServiceIndex, setActiveServiceIndex] = useState(0);
  const [detailsPlan, setDetailsPlan] = useState("");
  const [locationDetecting, setLocationDetecting] = useState(false);
  const [savingIntent, setSavingIntent] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState("");
  const [planBilling, setPlanBilling] = useState("monthly");
  const autoSaveTimerRef = useRef(null);
  const lastAutoSaveSnapshotRef = useRef("");
  const marketplaceAvailability = useProductMarketplaceAvailability(show);
  const marketplaceMode = getMarketplaceMode(form.marketplaceMode || form.marketplace_mode);
  const serviceStand = supportsServices(marketplaceMode);
  const shopStand = supportsProducts(marketplaceMode);
  const productOnly = shopStand && !serviceStand;
  const stepSequence = productOnly ? [1, 2, 4, 6] : [1, 2, 3, 4, 5, 6];
  const stepPosition = Math.max(0, stepSequence.indexOf(currentStep));
  const totalSteps = stepSequence.length;
  const lastStep = stepSequence[stepSequence.length - 1];
  const services = normalizeFormServices(form.services);
  const products = Array.isArray(form.products) ? form.products : [];
  const activeProducts = products.filter((product) => (product.is_active ?? product.isActive ?? true) && !product.is_deleted);
  const normalizedSelectedPlan = String(form.selectedPlan || "FREE").toUpperCase();
  const selectedPlan = PROVIDER_PLANS.find((plan) => plan.tier === normalizedSelectedPlan) || PROVIDER_PLANS[0];
  const profilePlan = String(
    profile?.subscription?.tier ||
    profile?.subscription_tier ||
    profile?.providerPlan ||
    profile?.plan ||
    ""
  ).toUpperCase();
  const profilePlanStatus = String(profile?.subscription?.status || profile?.subscription_status || "").toLowerCase();
  const selectedPlanAlreadyActive =
    selectedPlan.tier !== "FREE" &&
    isProviderPlanActive({ tier: profilePlan, status: profilePlanStatus }, selectedPlan.tier);
  const finalAction = getStandFinalAction({
    selectedTier: selectedPlan.tier,
    subscription: { tier: profilePlan, status: profilePlanStatus },
    paymentsEnabled: PAYMENTS_ENABLED,
  });
  const selectedPaidPlanComingSoon = finalAction.paymentComingSoon;
  const planFeatures = getPlanFeatures(selectedPlan.id);
  const maxServices = planFeatures.maxServices;
  const maxPhotos = planFeatures.maxPhotos;
  const productLimits = selectedPlan.tier === "PLATINUM"
    ? { products: -1, images: 10 }
    : selectedPlan.tier === "PREMIUM"
    ? { products: 50, images: 6 }
    : { products: 5, images: 3 };
  const imageStats = useMemo(() => getFormImageStats({ ...form, services }), [form, services]);
  const businessCategoryOptions = useMemo(
    () => [...new Set([
      ...(serviceStand ? SERVICE_CATEGORIES : []),
      ...(shopStand ? PRODUCT_CATEGORIES : []),
      form.businessType,
    ].filter(Boolean))],
    [form.businessType, serviceStand, shopStand]
  );
  const selectedCategories = useMemo(
    () => [...new Set(services.flatMap((service) => (service.category ? [service.category] : [])))],
    [services]
  );
  const selectedCategoryItems = useMemo(
    () =>
      selectedCategories.map((category) => ({
        key: getMapIconTypeForCategory(category),
        label: category,
        iconType: getMapIconTypeForCategory(category),
      })),
    [selectedCategories]
  );
  // The Step 1 manual choice is the only source of truth for the map marker.
  const effectiveMapIconType = form.mapIconType;
  const canSubmit = true;
  const missingFieldKeys = useMemo(() => new Set(missingFields.map((item) => item.key)), [missingFields]);
  const fieldClass = (key, base = "label-v4") => (missingFieldKeys.has(key) ? `${base} missing-v10` : base);
  const fieldError = (key) => missingFields.find((item) => item.key === key)?.message || "";

  const stepTitles = productOnly
    ? {
        1: "Shop Info",
        2: "Delivery & Pickup",
        4: "Products",
        6: "Review & Publish",
      }
    : {
        1: "Business Basics",
        2: "Location & Availability",
        3: "Service Categories",
        4: "Add Services",
        5: shopStand ? "Products & Fulfilment" : "Payments & Booking",
        6: "Review & Submit",
      };

  useEffect(() => {
    if (activeServiceIndex > services.length - 1) {
      setActiveServiceIndex(Math.max(0, services.length - 1));
    }
  }, [activeServiceIndex, services.length]);

  useEffect(() => {
    if (!show) return;
    setAutoSaveStatus("");
    lastAutoSaveSnapshotRef.current = "";
  }, [show]);

  useEffect(() => {
    if (!show || !backupKey) return;
    writeStandFormBackup(backupKey, form);
  }, [backupKey, form, show]);

  const updateService = (index, updates) => {
    setForm((prev) => {
      const next = normalizeFormServices(prev.services);
      const merged = { ...next[index], ...updates };
      next[index] = updates.pricing_type
        ? cleanPricingForMode(merged, updates.pricing_type)
        : merged;
      return { ...prev, services: next };
    });
  };

  const removeService = (index) => {
    setForm((prev) => {
      const next = normalizeFormServices(prev.services).filter((_, itemIndex) => itemIndex !== index);
      return { ...prev, services: next };
    });
    setActiveServiceIndex((prev) => Math.max(0, prev - 1));
  };

  const addService = (category = form.businessType || SERVICE_CATEGORIES[0]) => {
    if (Number.isFinite(maxServices) && services.length >= maxServices) {
      setError(`You have reached the ${selectedPlan.name} limit of ${maxServices} services. Upgrade to Premium or Platinum to add more.`);
      return;
    }
    setForm((prev) => {
      const next = [...normalizeFormServices(prev.services), createBlankService(category)];
      window.setTimeout(() => setActiveServiceIndex(next.length - 1), 0);
      return { ...prev, services: next };
    });
  };

  const toggleCategory = (category) => {
    setForm((prev) => {
      const current = normalizeFormServices(prev.services);
      const selected = current.some((service) => service.category === category);
      const nextServices = selected
        ? current.filter((service) => service.category !== category)
        : [...current, createBlankService(category)];
      const nextCategories = [...new Set(nextServices.flatMap((service) => (service.category ? [service.category] : [])))];
      // The map icon is chosen manually in Step 1 and is NOT overwritten here.
      // Toggling service categories only updates the service list (and the main
      // category default), so a user's Step 1 icon pick is preserved.
      return {
        ...prev,
        businessType: nextCategories[0] || prev.businessType,
        services: nextServices,
      };
    });
  };

  const fillCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location detection.");
      return;
    }
    setLocationDetecting(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        let detectedLabel = "";
        try {
          detectedLabel = await reverseGeocodeCoordinates(coords);
        } catch {
          detectedLabel = "";
        }
        setForm((prev) => ({
          ...prev,
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
          location: detectedLabel || "Location detected near your current area",
        }));
        setError(detectedLabel ? "" : "Location detected, but the place name could not be loaded.");
        setLocationDetecting(false);
      },
      (geoError) => {
        setError(getGeolocationErrorMessage(geoError));
        setLocationDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const getStepIssues = (step = currentStep) => {
    const issues = [];
    const addIssue = (key, label, message, serviceIndex = null) => {
      issues.push({ key, label, message, step, serviceIndex });
    };
    if (step === 1) {
      if (!form.businessName?.trim()) addIssue("businessName", "business name", "Enter your business name.");
      if (!form.businessType?.trim()) addIssue("businessType", "business category", "Choose your main business category.");
      if (!form.mapIconType?.trim()) addIssue("mapIconType", "map icon", "Choose the map icon customers should see.");
      const phoneError = getUgandaStandPhoneError(form.phone);
      if (phoneError) addIssue("phone", "phone number", phoneError);
      if (String(form.documentName || "").trim().length > 120 || /[<>]/.test(String(form.documentName || ""))) {
        addIssue("documentName", "verification reference", "Use 120 characters or fewer and remove angle brackets.");
      }
    }
    if (step === 2) {
      if (shopStand && !form.location?.trim()) {
        addIssue("location", "shop location", "Add your shop location or pickup area.");
      } else if (
        serviceStand &&
        services.length > 0 &&
        requiresFixedBusinessLocation(services) &&
        !form.location?.trim()
      ) {
        addIssue("location", "location / service area", "Add a stand location or the area you serve.");
      }
      if (serviceStand) {
        if (!form.scheduleStart) addIssue("scheduleStart", "opening time", "Choose an opening time.");
        if (!form.scheduleEnd) addIssue("scheduleEnd", "closing time", "Choose a closing time.");
        if (form.scheduleStart && form.scheduleEnd && form.scheduleStart >= form.scheduleEnd) {
          addIssue("scheduleEnd", "business hours", "Closing time must be later than opening time.");
        }
      }
      if (shopStand && !form.pickupAvailable && !form.deliveryAvailable) {
        addIssue("fulfilment", "pickup or delivery", "Choose at least one way customers can receive products.");
      }
      if (shopStand && form.deliveryAvailable && !String((form.deliveryAreas || []).join?.(",") || form.deliveryAreas || "").trim()) {
        addIssue("deliveryAreas", "delivery areas", "Add at least one area you deliver to.");
      }
    }
    if (step === 3 && serviceStand) {
      if (!selectedCategories.length) addIssue("services", "service category", "Choose at least one service category.");
    }
    if (step === 4 && productOnly) {
      if (!activeProducts.length) addIssue("products", "at least one product", "Add at least one active product.");
      if (productLimits.products >= 0 && activeProducts.length > productLimits.products) {
        addIssue("products", "product limit", `${selectedPlan.name} allows ${productLimits.products} active products.`);
      }
    }
    if (step === 4 && serviceStand) {
      if (!services.length) addIssue("services", "at least one service", "Add at least one service.");
      if (Number.isFinite(maxServices) && services.length > maxServices) {
        addIssue("services", "service limit", `${selectedPlan.name} allows ${maxServices} services. Remove extras or choose another plan.`);
      }
      const duplicateNames = new Set();
      services.forEach((service, index) => {
        if (!service.service_name?.trim()) addIssue(`serviceName-${index}`, `service ${index + 1} title`, "Give this service a clear title.", index);
        const key = `${String(service.service_name || "").trim().toLowerCase()}|${String(service.category || "").trim().toLowerCase()}`;
        if (service.service_name?.trim() && duplicateNames.has(key)) {
          addIssue(`serviceName-${index}`, `service ${index + 1} duplicate`, "Remove this duplicate service or give it a distinct title.", index);
        }
        duplicateNames.add(key);
        const pricingType = String(service.pricing_type || "fixed");
        if (pricingType === "fixed" && Number(service.price_extra || 0) <= 0) {
          addIssue(`servicePrice-${index}`, `service ${index + 1} price`, "Enter a valid fixed price in UGX.", index);
        }
        if (pricingType === "range") {
          if (Number(service.min_price || 0) <= 0 || Number(service.max_price || 0) <= 0) {
            addIssue(`servicePrice-${index}`, `service ${index + 1} price range`, "Enter both minimum and maximum prices in UGX.", index);
          } else if (Number(service.max_price) <= Number(service.min_price)) {
            addIssue(`servicePrice-${index}`, `service ${index + 1} price range`, "Maximum price must be greater than minimum price.", index);
          }
        }
        if (pricingType === "starting_from" && Number(service.starting_price || 0) <= 0) {
          addIssue(`servicePrice-${index}`, `service ${index + 1} starting price`, "Enter a valid starting price in UGX.", index);
        }
        const duration = Number(service.duration_minutes || 0);
        if (duration < 5 || duration > MAX_SERVICE_DURATION_MINUTES) {
          addIssue(
            `serviceDuration-${index}`,
            `service ${index + 1} duration`,
            "Choose a duration between 5 minutes and 30 days.",
            index
          );
        }
        if (!SERVICE_DELIVERY_MODES.some((mode) => mode.value === String(service.location_type || ""))) {
          addIssue(`serviceMode-${index}`, `service ${index + 1} work mode`, "Choose how this service is delivered.", index);
        }
      });
    }
    if (step === 5) {
      const limits = getPlanImageLimits(selectedPlan.tier);
      if (imageStats.logo.count > limits.logoImages) addIssue("images", "business image", getPlanImageCountMessage(selectedPlan.tier, "logo"));
      if (imageStats.logo.bytes > limits.logoTotalBytes) addIssue("images", "business image size", getPlanImageSizeMessage(selectedPlan.tier, "logo"));
      if (imageStats.portfolio.count > limits.portfolioImages) addIssue("images", "portfolio images", getPlanImageCountMessage(selectedPlan.tier, "portfolio"));
      if (imageStats.portfolio.bytes > limits.portfolioTotalBytes) addIssue("images", "portfolio image size", getPlanImageSizeMessage(selectedPlan.tier, "portfolio"));
      if (services.some((service) => getImageReferenceStats(service.image).bytes > limits.serviceTotalBytes)) {
        addIssue("images", "service image size", getPlanImageSizeMessage(selectedPlan.tier, "service"));
      }
      if (shopStand) {
        if (!form.pickupAvailable && !form.deliveryAvailable) {
          addIssue("fulfilment", "pickup or delivery", "Choose at least one way customers can receive products.");
        }
        if (!activeProducts.length) addIssue("products", "at least one product", "Add at least one active product.");
        if (productLimits.products >= 0 && activeProducts.length > productLimits.products) {
          addIssue("products", "product limit", `${selectedPlan.name} allows ${productLimits.products} active products.`);
        }
      }
    }
    return issues;
  };

  const focusIssue = (issue) => {
    if (!issue) return;
    if (Number.isInteger(issue.serviceIndex)) setActiveServiceIndex(issue.serviceIndex);
    window.setTimeout(() => {
      const target = document.querySelector(`[data-validation-key="${issue.key}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.querySelector?.("input, select, textarea, button")?.focus?.({ preventScroll: true });
    }, 80);
  };

  const showIssues = (issues) => {
    setMissingFields(issues);
    if (!issues.length) return false;
    const first = issues[0];
    setCurrentStep(first.step || currentStep);
    const labels = [...new Set(issues.map((item) => item.label))];
    setError(`Please complete: ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? ` and ${labels.length - 4} more` : ""}.`);
    focusIssue(first);
    return true;
  };

  const goNext = () => {
    if (showIssues(getStepIssues(currentStep))) return;
    setError("");
    setMissingFields([]);
    setCurrentStep(stepSequence[Math.min(stepPosition + 1, stepSequence.length - 1)]);
  };

  const goBack = () => {
    setError("");
    setMissingFields([]);
    setCurrentStep(stepSequence[Math.max(0, stepPosition - 1)]);
  };

  const buildSubmitPayload = useCallback((intent = "draft", extras = {}) => ({
    ...form,
    phone: normalizeUgandaStandPhone(form.phone),
    selectedPlan: normalizedSelectedPlan || "FREE",
    acceptsWallet: PAYMENTS_ENABLED ? Boolean(form.acceptsWallet) : false,
    acceptsCash: true,
    submitIntent: intent,
    marketplaceMode,
    marketplace_mode: marketplaceMode,
    categories: serviceStand ? selectedCategoryItems.map((category) => category.key) : [effectiveMapIconType].filter(Boolean),
    selectedCategories: serviceStand ? selectedCategoryItems : [],
    primaryCategory: serviceStand && selectedCategories.length === 1 ? selectedCategoryItems[0]?.key || null : effectiveMapIconType || null,
    businessType: serviceStand && selectedCategories.length ? selectedCategories[0] : form.businessType,
    mapIconType: effectiveMapIconType,
    services,
    products,
    ...extras,
  }), [effectiveMapIconType, form, marketplaceMode, normalizedSelectedPlan, products, selectedCategories, selectedCategoryItems, serviceStand, services]);

  const autoSaveSnapshot = useMemo(
    () => JSON.stringify(buildSubmitPayload("draft", { autoSave: true })),
    [buildSubmitPayload]
  );

  useEffect(() => {
    if (!show || !autoSaveEnabled || requirePlan || savingIntent || !onSubmit) return undefined;
    const hasDraftContent = Boolean(
      String(form.businessName || "").trim() ||
      String(form.phone || "").trim() ||
      String(form.location || "").trim() ||
      String(form.image || "").trim() ||
      services.length ||
      products.length ||
      (Array.isArray(form.portfolio) && form.portfolio.length)
    );
    if (!hasDraftContent || autoSaveSnapshot === lastAutoSaveSnapshotRef.current) return undefined;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus("Saving...");
    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await onSubmit(buildSubmitPayload("draft", { autoSave: true, silent: true }));
        if (result === false || result?.success === false) {
          throw new Error(result?.message || "Auto-save failed.");
        }
        lastAutoSaveSnapshotRef.current = autoSaveSnapshot;
        setAutoSaveStatus("Saved");
      } catch {
        setAutoSaveStatus("Couldn't auto-save");
      }
    }, 2600);

    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSaveEnabled, autoSaveSnapshot, buildSubmitPayload, form, onSubmit, products.length, requirePlan, savingIntent, services.length, show]);

  const submitWizard = async (intent = "draft") => {
    if (savingIntent) return;
    if (intent === "draft" && form.phone && getUgandaStandPhoneError(form.phone)) {
      showIssues([{
        key: "phone",
        label: "phone number",
        message: getUgandaStandPhoneError(form.phone),
        step: 1,
      }]);
      return;
    }
    if (intent === "publish" && selectedPlan.tier !== "FREE" && !PAYMENTS_ENABLED && !selectedPlanAlreadyActive) {
      intent = "draft";
    }
    if (intent === "publish") {
      const publishIssues = [];
      for (const step of stepSequence.filter((step) => step !== lastStep)) {
        publishIssues.push(...getStepIssues(step));
      }
      if (showIssues(publishIssues)) return;
      const missing = validateBusinessStand({ ...form, marketplaceMode, products, services });
      if (missing.length) {
        setCurrentStep(lastStep);
        setMissingFields(missing.map((item) => ({ ...item, message: item.label, step: FIELD_TO_STEP[item.key] || lastStep })));
        // Single source of truth: the validation summary renders the headline +
        // list. Do not also set `error` or the same message shows twice.
        setError("");
        return;
      }
    }
    setMissingFields([]);
    setError("");
    setSaveNotice("");
    setAutoSaveStatus("");
    setSavingIntent(intent);
    try {
      const result = await onSubmit(buildSubmitPayload(intent));
      if (result === false || result?.success === false) {
        setError(
          result?.message ||
          (intent === "draft"
            ? "We couldn’t save your stand draft. Please try again."
            : "Your draft is saved, but complete the missing details before publishing.")
        );
      } else {
        if (Array.isArray(result?.products)) {
          setForm((current) => ({ ...current, products: result.products, deletedProductIds: [] }));
        }
        if (intent !== "draft") return;
        setSaveNotice("Draft saved. You can come back and continue anytime.");
        lastAutoSaveSnapshotRef.current = autoSaveSnapshot;
      }
    } catch (submitError) {
      setError(submitError?.message || "We couldn’t save your stand draft. Please try again.");
    } finally {
      setSavingIntent("");
    }
  };

  if (!show) return null;

  const activeService = services[activeServiceIndex];
  const activePricingType = String(activeService?.pricing_type || "fixed").toLowerCase();
  const activeServiceReadiness = activeService ? getServiceReadiness(activeService) : "";
  const activeDurationInput = inferDurationInput(activeService?.duration_minutes);

  return (
    <>
      <button type="button" className="booking-overlay-v4 open" onClick={onClose} aria-label="Close business wizard" />
      <div className="booking-modal-v4 open business-wizard-modal-v10">
        <div className="booking-modal-card-v4 business-wizard-card-v10">
          <div className="barber-profile-topbar-v4 business-wizard-topbar-v10">
            <button type="button" className="profile-back-btn-v4" onClick={currentStep === 1 ? onClose : goBack} disabled={Boolean(savingIntent)}>
              <FiArrowLeft />
            </button>
            <div className="profile-top-title-v4">{title}</div>
            <button type="button" className="profile-back-btn-v4" onClick={onClose} disabled={Boolean(savingIntent)}>
              <FiX />
            </button>
          </div>

          <div className="business-wizard-v10">
            <StepHeader currentStep={stepPosition + 1} totalSteps={totalSteps} stepTitle={stepTitles[currentStep]} />

            {error ? (
              <div className="auth-error business-wizard-error-v10">
                <strong>{error}</strong>
                {error.toLowerCase().includes("business with this name already exists") ? (
                  <button type="button" className="mini-action-btn-v4" onClick={() => setError("Claim/report request noted. Admin review will be available from the support workflow.")}>
                    This is my business / Claim or report
                  </button>
                ) : null}
              </div>
            ) : null}
            {saveNotice ? (
              <div className="wizard-note-v10" role="status" aria-live="polite">
                <FiCheckCircle /> {saveNotice}
              </div>
            ) : null}
            {!saveNotice && autoSaveStatus ? (
              <div className="wizard-autosave-v10" role="status" aria-live="polite">
                <FiCheckCircle /> {autoSaveStatus}
              </div>
            ) : null}

            {/* Single source of truth for field-completeness validation. Rendered
                once here (not per-step, not duplicated in the banner). Each item
                jumps to the step that owns the field. */}
            {missingFields.length ? (
              <div className="business-missing-summary-v10" role="alert" aria-live="polite">
                <strong>A few details still need attention</strong>
                <span>Complete the following before continuing:</span>
                <ul>
                  {missingFields.map((item) => (
                    <li key={`${item.key}-${item.label}`}>
                      <button
                        type="button"
                        className="business-missing-jump-v10"
                        onClick={() => {
                          setCurrentStep(item.step || FIELD_TO_STEP[item.key] || currentStep);
                          focusIssue(item);
                        }}
                      >
                        {item.label}: {item.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {currentStep === 1 ? (
              <section className="business-step-card-v10">
                <WizardNotice>This helps customers understand who you are and what you offer.</WizardNotice>
                <div className="marketplace-mode-picker-v21">
                  <div className="marketplace-mode-heading-v21">
                    <span>Stand type</span>
                    <strong>What type of stand do you want to create?</strong>
                  </div>
                  <div className="marketplace-mode-grid-v21">
                    {[
                      {
                        value: MARKETPLACE_MODES.SERVICE,
                        title: "Service Stand",
                        description: "For appointments, bookings, and service requests.",
                        Icon: FiUsers,
                      },
                      {
                        value: MARKETPLACE_MODES.PRODUCT,
                        title: "Shop Stand",
                        description: "For selling products with pickup or delivery.",
                        Icon: FiShoppingBag,
                      },
                      {
                        value: MARKETPLACE_MODES.HYBRID,
                        title: "Both",
                        description: "For businesses that offer services and sell products.",
                        Icon: FiPackage,
                      },
                    ].map(({ value, title: modeTitle, description, Icon }) => {
                      const productMode = value !== MARKETPLACE_MODES.SERVICE;
                      const disabled = productMode && !marketplaceAvailability.enabled && marketplaceMode !== value;
                      return (
                        <label className={`${marketplaceMode === value ? "selected" : ""}${disabled ? " disabled" : ""}`} key={value}>
                          <input
                            type="radio"
                            name="marketplaceMode"
                            value={value}
                            checked={marketplaceMode === value}
                            disabled={disabled}
                            onChange={() => {
                              setForm((prev) => ({ ...prev, marketplaceMode: value }));
                              setSaveNotice(value === MARKETPLACE_MODES.SERVICE
                                ? ""
                                : "Stand type changed. Complete the new requirements before republishing.");
                            }}
                          />
                          <Icon />
                          <span><strong>{modeTitle}</strong><small>{description}</small></span>
                        </label>
                      );
                    })}
                  </div>
                  {marketplaceAvailability.checked && !marketplaceAvailability.enabled ? (
                    <small className="marketplace-coming-soon-v21">Shop stands are coming soon. Existing service stands continue to work normally.</small>
                  ) : null}
                </div>
                <ImageUploadInput
                  image={form.image}
                  onChange={(image) => setForm((prev) => ({ ...prev, image }))}
                  title="Business logo / cover image"
                  description="Used as your main image in search, profile, and Top Providers."
                  emptyLabel="Upload business image"
                  uploadLabel="Upload business image"
                  changeLabel="Change business image"
                  previewAlt="Business image"
                  compact
                  planTier={selectedPlan.tier}
                  currentImageStats={imageStats}
                />
                <div className="business-field-grid-v10">
                  <label className={fieldClass("businessName")} data-validation-key="businessName">
                    <span className="field-label-row-v10">Business name <RequiredMark /></span>
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.businessName}
                      placeholder="Example: Prime Service Studio"
                      onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
                    />
                    <FieldMessage message={fieldError("businessName")} />
                  </label>
                  <label className={fieldClass("businessType")} data-validation-key="businessType">
                    <span className="field-label-row-v10">Main category <RequiredMark /></span>
                    <select
                      className="field-input-v4 profile-input-v4"
                      value={form.businessType}
                      onChange={(e) => setForm((prev) => ({ ...prev, businessType: e.target.value }))}
                    >
                      {businessCategoryOptions.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <FieldMessage message={fieldError("businessType")} />
                  </label>
                  <label className="label-v4">
                    Subcategory <span className="optional-label-v10">Optional</span>
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.subcategory || ""}
                      placeholder={productOnly ? "Example: Women's clothing" : "Example: Bridal styling"}
                      onChange={(e) => setForm((prev) => ({ ...prev, subcategory: e.target.value }))}
                    />
                  </label>
                  <label className={fieldClass("phone")} data-validation-key="phone">
                    <span className="field-label-row-v10">Uganda business phone <RequiredMark /></span>
                    <span className="phone-input-shell-v10">
                      <span className="phone-prefix-v10">+256</span>
                      <input
                        className="field-input-v4 profile-input-v4"
                        value={toUgLocalDigits(form.phone)}
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={9}
                        placeholder="7XX XXX XXX"
                        aria-invalid={missingFieldKeys.has("phone")}
                        onChange={(e) => setForm((prev) => ({ ...prev, phone: toUgLocalDigits(e.target.value) }))}
                      />
                    </span>
                    <small className="profile-sub-v4">Enter the 9 digits after +256. We save it as +256XXXXXXXXX.</small>
                    <FieldMessage message={fieldError("phone")} />
                  </label>
                  <div className={fieldClass("mapIconType", "label-v4")} data-validation-key="mapIconType">
                    <span className="field-label-row-v10">Map icon <RequiredMark /></span>
                    <div className="ql-icon-selector-grid">
                      {getCategoryList().map((def) => (
                        <CategorySelectorItem
                          key={def.id}
                          categoryId={def.id}
                          selected={effectiveMapIconType === def.id}
                          onSelect={(id) => setForm((prev) => ({ ...prev, mapIconType: id }))}
                        />
                      ))}
                    </div>
                    {effectiveMapIconType && (() => {
                      const def = getCategoryDef(effectiveMapIconType);
                      const { Icon, primaryColor, softBg } = def;
                      return (
                        <div className="ql-icon-selector-preview">
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: softBg }}>
                            <Icon size={16} style={{ color: primaryColor }} aria-hidden="true" />
                          </span>
                          <span>{def.label}</span>
                        </div>
                      );
                    })()}
                    <FieldMessage message={fieldError("mapIconType")} />
                  </div>
                  {!productOnly ? <label className="label-v4">
                    General price guide <span className="optional-label-v10">Optional</span>
                    <span className="currency-input-shell-v10">
                      <span className="currency-prefix-v10">UGX</span>
                      <input
                        className="field-input-v4 profile-input-v4"
                        value={form.pricing}
                        inputMode="numeric"
                        placeholder="20,000"
                        onChange={(e) => setForm((prev) => ({ ...prev, pricing: e.target.value.replace(/\D/g, "") }))}
                      />
                    </span>
                    {Number(form.pricing || 0) > 0 ? <small className="currency-preview-v10">UGX {Number(form.pricing).toLocaleString("en-UG")}</small> : null}
                  </label> : null}
                  <label className="label-v4">
                    Short intro
                    <textarea
                      className="textarea-v4"
                      placeholder="Tell customers what makes your business special."
                      value={form.introText}
                      onChange={(e) => setForm((prev) => ({ ...prev, introText: e.target.value }))}
                    />
                  </label>
                  <label className={fieldClass("documentName")} data-validation-key="documentName">
                    Verification document or reference <span className="optional-label-v10">Optional</span>
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.documentName}
                      placeholder="National ID, business permit, trade license, or secure upload reference"
                      onChange={(e) => setForm((prev) => ({ ...prev, documentName: e.target.value }))}
                    />
                    <FieldMessage message={fieldError("documentName")} />
                  </label>
                </div>
              </section>
            ) : null}

            {currentStep === 2 ? (
              <section className="business-step-card-v10">
                <WizardNotice>
                  {productOnly
                    ? "Add your shop location, then choose how customers can receive their orders."
                    : "Add your stand location or the main area you serve. Online providers can describe their remote coverage here."}
                </WizardNotice>
                <label className={fieldClass("location")} data-validation-key="location">
                  <span className="field-label-row-v10">{productOnly ? "Shop location or pickup area" : "Location or service area"} <RequiredMark /></span>
                  <input
                    className="field-input-v4 profile-input-v4"
                    value={form.location}
                    placeholder={productOnly ? "Example: Gayaza Town, Kampala Road" : "Example: Gayaza Town, Kampala Road, or Online across Uganda"}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  />
                  <small className="profile-sub-v4">{productOnly ? "Customers see this as your seller location or pickup area." : "This becomes a visit address only for services where customers come to you."}</small>
                  <FieldMessage message={fieldError("location")} />
                </label>
                <button type="button" className="location-action-btn-v10" onClick={fillCurrentLocation} disabled={locationDetecting}>
                  <FiNavigation /> {locationDetecting ? "Detecting location..." : form.location || "Use my current location"}
                </button>
                {serviceStand ? <><div className="business-field-grid-v10 two-v10">
                  <label className={fieldClass("scheduleStart")} data-validation-key="scheduleStart">
                    <span className="field-label-row-v10">Opening time <RequiredMark /></span>
                    <input
                      className="field-input-v4 profile-input-v4"
                      type="time"
                      value={form.scheduleStart}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        scheduleStart: e.target.value,
                        dirtyFields: [...new Set([...(prev.dirtyFields || []), "scheduleStart"])],
                      }))}
                    />
                    <FieldMessage message={fieldError("scheduleStart")} />
                  </label>
                  <label className={fieldClass("scheduleEnd")} data-validation-key="scheduleEnd">
                    <span className="field-label-row-v10">Closing time <RequiredMark /></span>
                    <input
                      className="field-input-v4 profile-input-v4"
                      type="time"
                      value={form.scheduleEnd}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        scheduleEnd: e.target.value,
                        dirtyFields: [...new Set([...(prev.dirtyFields || []), "scheduleEnd"])],
                      }))}
                    />
                    <FieldMessage message={fieldError("scheduleEnd")} />
                  </label>
                </div>
                {requirePlan ? <div className="payment-config-v5 business-mini-card-v10">
                  <div className="payment-config-title-v5"><FiUsers /> Service setup</div>
                  <label className="payment-config-option-v5">
                    <input
                      type="radio"
                      name="standType"
                      checked={form.standType !== "shop"}
                      onChange={() => setForm((prev) => ({ ...prev, standType: "individual", teamMembers: "" }))}
                    />
                    <span>
                      <strong>Independent provider</strong>
                      <small>This profile is operated by one service provider.</small>
                    </span>
                  </label>
                  <label className="payment-config-option-v5">
                    <input
                      type="radio"
                      name="standType"
                      checked={form.standType === "shop"}
                      onChange={() => setForm((prev) => ({ ...prev, standType: "shop" }))}
                    />
                    <span>
                      <strong>Business with staff</strong>
                      <small>Add service agents customers can choose from.</small>
                    </span>
                  </label>
                </div> : null}
                {form.standType === "shop" ? (
                  <label className="label-v4">
                    Staff / service agents
                    <textarea
                      className="textarea-v4"
                      placeholder="Timothy, Alex, Brian"
                      value={form.teamMembers}
                      onChange={(e) => setForm((prev) => ({ ...prev, teamMembers: e.target.value }))}
                    />
                    <small className="profile-sub-v4">Separate names with commas. You can edit this later.</small>
                  </label>
                ) : null}</> : null}
                {shopStand ? (
                  <div className={fieldClass("fulfilment", "shop-fulfilment-card-v21")} data-validation-key="fulfilment">
                    <div className="payment-config-title-v5"><FiShoppingBag /> Selling preferences</div>
                    <label className="payment-config-option-v5">
                      <input
                        type="checkbox"
                        checked={Boolean(form.pickupAvailable)}
                        onChange={(event) => setForm((prev) => ({ ...prev, pickupAvailable: event.target.checked }))}
                      />
                      <span><strong>Pickup available</strong><small>Customers can collect confirmed orders from your shop or pickup point.</small></span>
                    </label>
                    <label className="payment-config-option-v5">
                      <input
                        type="checkbox"
                        checked={Boolean(form.deliveryAvailable)}
                        onChange={(event) => setForm((prev) => ({ ...prev, deliveryAvailable: event.target.checked }))}
                      />
                      <span><strong>Delivery available</strong><small>Customers can request delivery. No online payment is collected.</small></span>
                    </label>
                    {form.deliveryAvailable ? (
                      <div className="business-field-grid-v10 two-v10">
                        <label className={fieldClass("deliveryAreas")} data-validation-key="deliveryAreas">
                          Delivery areas <RequiredMark />
                          <textarea
                            className="textarea-v4"
                            value={Array.isArray(form.deliveryAreas) ? form.deliveryAreas.join(", ") : form.deliveryAreas || ""}
                            placeholder="Kampala Central, Ntinda, Gayaza"
                            onChange={(event) => setForm((prev) => ({
                              ...prev,
                              deliveryAreas: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                            }))}
                          />
                          <FieldMessage message={fieldError("deliveryAreas")} />
                        </label>
                        <label className="label-v4">
                          Delivery fee <span className="optional-label-v10">Optional</span>
                          <span className="currency-input-shell-v10">
                            <span className="currency-prefix-v10">UGX</span>
                            <input
                              className="field-input-v4 profile-input-v4"
                              inputMode="numeric"
                              value={form.deliveryFee || ""}
                              placeholder="5,000"
                              onChange={(event) => setForm((prev) => ({ ...prev, deliveryFee: event.target.value.replace(/\D/g, "") }))}
                            />
                          </span>
                        </label>
                        <label className="label-v4">
                          Delivery notes <span className="optional-label-v10">Optional</span>
                          <textarea
                            className="textarea-v4"
                            value={form.deliveryNotes || ""}
                            placeholder="Estimated delivery time, minimum order, or delivery instructions."
                            onChange={(event) => setForm((prev) => ({ ...prev, deliveryNotes: event.target.value }))}
                          />
                        </label>
                      </div>
                    ) : null}
                    <FieldMessage message={fieldError("fulfilment")} />
                  </div>
                ) : null}
                <details className="advanced-location-v10">
                  <summary>Advanced map coordinates</summary>
                  <div className="business-field-grid-v10 two-v10">
                    <label className="label-v4">
                      Latitude
                      <input className="field-input-v4 profile-input-v4" value={form.latitude} onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))} />
                    </label>
                    <label className="label-v4">
                      Longitude
                      <input className="field-input-v4 profile-input-v4" value={form.longitude} onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))} />
                    </label>
                  </div>
                </details>
              </section>
            ) : null}

            {currentStep === 3 ? (
              <section className="business-step-card-v10">
                <WizardNotice>Choose the categories customers should find you under.</WizardNotice>
                <div className="business-category-chips-v10">
                  {SERVICE_CATEGORIES.map((category) => {
                    const selected = selectedCategories.includes(category);
                    return (
                      <button
                        type="button"
                        key={category}
                        className={selected ? "business-category-chip-v10 active" : "business-category-chip-v10"}
                        aria-pressed={selected}
                        onClick={() => toggleCategory(category)}
                      >
                        {selected ? <FiCheckCircle /> : <FiPlus />}
                        <span>{category}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="selected-summary-v10">
                  <strong>{selectedCategories.length}</strong>
                  <span>{selectedCategories.length === 1 ? "category selected" : "categories selected"}</span>
                </div>
              </section>
            ) : null}

            {currentStep === 4 && productOnly ? (
              <section className={missingFieldKeys.has("products") ? "business-step-card-v10 missing-v10" : "business-step-card-v10"} data-validation-key="products">
                <WizardNotice>Add products customers can request for pickup or delivery. Queless does not collect payment in this flow.</WizardNotice>
                {!marketplaceAvailability.enabled ? (
                  <div className="product-feature-off-v21">Shop stands are coming soon. Your saved shop details remain available, but product changes need the local feature flag enabled.</div>
                ) : null}
                <ProductCatalogueEditor
                  products={products}
                  productLimit={productLimits.products}
                  imageLimit={productLimits.images}
                  disabled={!marketplaceAvailability.enabled}
                  onChange={(nextProducts) => setForm((prev) => ({ ...prev, products: nextProducts }))}
                  onRemove={(product) => setForm((prev) => ({
                    ...prev,
                    products: (prev.products || []).filter((item) => String(item.id) !== String(product.id)),
                    deletedProductIds: String(product.id || "").startsWith("local-product-")
                      ? prev.deletedProductIds || []
                      : [...new Set([...(prev.deletedProductIds || []), product.id])],
                  }))}
                />
                <FieldMessage message={fieldError("products")} />
              </section>
            ) : null}

            {currentStep === 4 && serviceStand ? (
              <section className={missingFieldKeys.has("services") ? "business-step-card-v10 missing-v10" : "business-step-card-v10"}>
                <WizardNotice>Add the actual services customers can book. Use quote-required only when the price depends on scope.</WizardNotice>
                <div className="service-summary-list-v10">
                  <WizardNotice>
                    {Number.isFinite(maxServices)
                      ? `${selectedPlan.name} allows up to ${maxServices} services. You have ${services.length}.`
                      : "Platinum allows unlimited services."}
                  </WizardNotice>
                  {services.map((service, index) => (
                    <button
                      type="button"
                      key={service.id || index}
                      className={index === activeServiceIndex ? "service-summary-card-v10 active" : "service-summary-card-v10"}
                      onClick={() => setActiveServiceIndex(index)}
                    >
                      <span className="service-summary-image-v10">
                        {service.image ? <img src={buildAssetUrl(service.image)} alt={service.service_name || "Service"} /> : <FiImage />}
                      </span>
                      <span className="service-summary-copy-v10">
                        <strong>{service.service_name || service.category || "Service"}</strong>
                        <small>{service.category || "Service"} - {formatServicePrice(service)}</small>
                        <em>{Number(service.duration_minutes || 0) > 0 ? `${formatServiceDuration(service.duration_minutes)} - ` : ""}{getServiceLocationLabel(service)}</em>
                      </span>
                      <span className={getServiceReadiness(service) === "Ready" ? "service-ready-pill-v10 ready" : "service-ready-pill-v10"}>
                        {getServiceReadiness(service)}
                      </span>
                      <FiChevronRight />
                    </button>
                  ))}
                  <button type="button" className="add-service-btn-v10" onClick={() => addService(selectedCategories[0] || form.businessType)}>
                    <FiPlus /> Add another service
                  </button>
                </div>

                {activeService ? (
                  <div className="single-service-editor-v10">
                    <div className="single-service-head-v10">
                      <div>
                        <strong>Edit selected service</strong>
                        <small>{activeServiceReadiness}</small>
                      </div>
                      <button type="button" onClick={() => removeService(activeServiceIndex)}>
                        <FiTrash2 /> Remove
                      </button>
                    </div>
                    <div className="service-preview-card-v10">
                      <div>
                        <span>Customer sees</span>
                        <strong>{activeService.service_name || "Service title"}</strong>
                        <small>{formatServicePrice(activeService)}{Number(activeService.duration_minutes || 0) > 0 ? ` - ${formatServiceDuration(activeService.duration_minutes)}` : ""} - {getServiceLocationLabel(activeService)}</small>
                      </div>
                      <em>{activePricingType === "quote" ? "Quote flow" : "Direct booking"}</em>
                    </div>
                    <label className="availability-toggle-v10">
                      <input
                        type="checkbox"
                        checked={activeService.is_available !== false && Number(activeService.is_available) !== 0}
                        onChange={(e) => updateService(activeServiceIndex, { is_available: e.target.checked })}
                      />
                      <span>Available for booking</span>
                    </label>
                    <div className="business-field-grid-v10 two-v10">
                      <label
                        className={fieldClass(`serviceName-${activeServiceIndex}`)}
                        data-validation-key={`serviceName-${activeServiceIndex}`}
                      >
                        <span className="field-label-row-v10">Service title <RequiredMark /></span>
                        <input
                          className="field-input-v4 profile-input-v4"
                          value={activeService.service_name || ""}
                          onChange={(e) => updateService(activeServiceIndex, { service_name: e.target.value })}
                        />
                        <FieldMessage message={fieldError(`serviceName-${activeServiceIndex}`)} />
                      </label>
                      <label className="label-v4">
                        Category
                        <select
                          className="field-input-v4 profile-input-v4"
                          value={activeService.category || form.businessType}
                          onChange={(e) => updateService(activeServiceIndex, { category: e.target.value })}
                        >
                          {SERVICE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="service-editor-group-v10">
                      <div className="service-editor-label-v10">Pricing</div>
                      <div className="pricing-mode-grid-v10">
                        {PRICING_MODES.map((mode) => (
                          <button
                            type="button"
                            key={mode.value}
                            className={activePricingType === mode.value ? "pricing-mode-card-v10 active" : "pricing-mode-card-v10"}
                            onClick={() => updateService(activeServiceIndex, { pricing_type: mode.value })}
                          >
                            <strong>{mode.label}</strong>
                            <span>{mode.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {activePricingType === "fixed" ? (
                      <label
                        className={fieldClass(`servicePrice-${activeServiceIndex}`)}
                        data-validation-key={`servicePrice-${activeServiceIndex}`}
                      >
                        <span className="field-label-row-v10">Fixed price <RequiredMark /></span>
                        <span className="currency-input-shell-v10">
                          <span className="currency-prefix-v10">UGX</span>
                          <input className="field-input-v4 profile-input-v4" inputMode="numeric" value={activeService.price_extra || ""} onChange={(e) => updateService(activeServiceIndex, { price_extra: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                        </span>
                        {Number(activeService.price_extra || 0) > 0 ? <small className="currency-preview-v10">UGX {Number(activeService.price_extra).toLocaleString("en-UG")}</small> : null}
                        <FieldMessage message={fieldError(`servicePrice-${activeServiceIndex}`)} />
                      </label>
                    ) : null}
                    {activePricingType === "range" ? (
                      <div
                        className={fieldClass(`servicePrice-${activeServiceIndex}`, "business-field-grid-v10 two-v10")}
                        data-validation-key={`servicePrice-${activeServiceIndex}`}
                      >
                        <label className="label-v4">
                          <span className="field-label-row-v10">Minimum price <RequiredMark /></span>
                          <span className="currency-input-shell-v10">
                            <span className="currency-prefix-v10">UGX</span>
                            <input className="field-input-v4 profile-input-v4" inputMode="numeric" value={activeService.min_price || ""} onChange={(e) => updateService(activeServiceIndex, { min_price: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                          </span>
                        </label>
                        <label className="label-v4">
                          <span className="field-label-row-v10">Maximum price <RequiredMark /></span>
                          <span className="currency-input-shell-v10">
                            <span className="currency-prefix-v10">UGX</span>
                            <input className="field-input-v4 profile-input-v4" inputMode="numeric" value={activeService.max_price || ""} onChange={(e) => updateService(activeServiceIndex, { max_price: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                          </span>
                        </label>
                        <FieldMessage message={fieldError(`servicePrice-${activeServiceIndex}`)} />
                      </div>
                    ) : null}
                    {activePricingType === "starting_from" ? (
                      <label
                        className={fieldClass(`servicePrice-${activeServiceIndex}`)}
                        data-validation-key={`servicePrice-${activeServiceIndex}`}
                      >
                        <span className="field-label-row-v10">Starting price <RequiredMark /></span>
                        <span className="currency-input-shell-v10">
                          <span className="currency-prefix-v10">UGX</span>
                          <input className="field-input-v4 profile-input-v4" inputMode="numeric" value={activeService.starting_price || ""} onChange={(e) => updateService(activeServiceIndex, { starting_price: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                        </span>
                        <FieldMessage message={fieldError(`servicePrice-${activeServiceIndex}`)} />
                      </label>
                    ) : null}
                    {activePricingType === "quote" ? (
                      <div className="wizard-note-v10">Customers will see Request quote and cannot directly book this service until you agree on price and scope.</div>
                    ) : null}
                    <div
                      className={fieldClass(`serviceDuration-${activeServiceIndex}`, "service-editor-group-v10")}
                      data-validation-key={`serviceDuration-${activeServiceIndex}`}
                    >
                      <div className="service-editor-label-v10"><span className="field-label-row-v10">Duration <RequiredMark /></span></div>
                      <div className="duration-chip-grid-v10">
                        {SERVICE_DURATION_PRESETS.map((preset) => (
                          <button
                            type="button"
                            key={preset.minutes}
                            className={Number(activeService.duration_minutes || 0) === preset.minutes ? "duration-chip-v10 active" : "duration-chip-v10"}
                            onClick={() => updateService(activeServiceIndex, { duration_minutes: preset.minutes })}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <label className="label-v4">
                        Custom duration
                        <span className="duration-custom-grid-v10">
                        <input
                          className="field-input-v4 profile-input-v4"
                          type="number"
                          min={1}
                          step={activeDurationInput.unit === "hours" ? "0.5" : "1"}
                          value={activeDurationInput.value}
                          onChange={(e) => updateService(activeServiceIndex, {
                            duration_minutes: convertDurationToMinutes(e.target.value, activeDurationInput.unit) || "",
                          })}
                        />
                        <select
                          className="field-input-v4 profile-input-v4"
                          value={activeDurationInput.unit}
                          onChange={(e) => updateService(activeServiceIndex, {
                            duration_minutes: convertDurationToMinutes(activeDurationInput.value || 1, e.target.value),
                          })}
                        >
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                        </select>
                        </span>
                        <small className="profile-sub-v4">Up to 30 days for long jobs and projects.</small>
                      </label>
                      <FieldMessage message={fieldError(`serviceDuration-${activeServiceIndex}`)} />
                    </div>
                    <div
                      className={fieldClass(`serviceMode-${activeServiceIndex}`, "service-editor-group-v10")}
                      data-validation-key={`serviceMode-${activeServiceIndex}`}
                    >
                      <div className="service-editor-label-v10"><span className="field-label-row-v10">How this service is delivered <RequiredMark /></span></div>
                      <small className="service-editor-help-v10">Choose the work mode that customers should expect for this service.</small>
                      <div className="pricing-mode-grid-v10 location-mode-grid-v10">
                        {SERVICE_DELIVERY_MODES.map(({ value, label, hint }) => (
                          <button
                            type="button"
                            key={value}
                            className={String(activeService.location_type || "provider_location") === value ? "pricing-mode-card-v10 active" : "pricing-mode-card-v10"}
                            onClick={() => {
                              updateService(activeServiceIndex, { location_type: value });
                              if (["customer_location", "pickup_delivery", "mobile_area"].includes(value)) {
                                setForm((prev) => ({ ...prev, homeServiceEnabled: true }));
                              }
                            }}
                          >
                            <strong>{label}</strong>
                            <span>{hint}</span>
                          </button>
                        ))}
                      </div>
                      <FieldMessage message={fieldError(`serviceMode-${activeServiceIndex}`)} />
                    </div>
                    <ImageUploadInput
                      compact
                      image={activeService.image || ""}
                      title="Service image"
                      description="This image stays connected to this specific service."
                      emptyLabel="Upload service image"
                      uploadLabel="Upload service image"
                      changeLabel="Change service image"
                      previewAlt={`${activeService.service_name || activeService.category || "Service"} image`}
                      onChange={(image) => updateService(activeServiceIndex, { image })}
                      planTier={selectedPlan.tier}
                      currentImageStats={imageStats}
                      imageType="service"
                    />
                    <label className="label-v4">
                      Service description & custom instructions <span className="optional-label-v10">Optional</span>
                      <textarea
                        className="textarea-v4"
                        value={activeService.description || ""}
                        placeholder="Describe what is included, areas covered, pickup details, or how remote appointments work."
                        onChange={(e) => updateService(activeServiceIndex, { description: e.target.value })}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="empty-service-v10">
                    <FiImage />
                    <strong>No service added yet</strong>
                    <span>Choose a category first, then add the services customers can book.</span>
                    <button type="button" onClick={() => addService(form.businessType)}>Add first service</button>
                  </div>
                )}
              </section>
            ) : null}

            {currentStep === 5 ? (
              <section className="business-step-card-v10">
                <WizardNotice>Set booking expectations, service location, and portfolio photos. Online payments are not live yet, so customers pay you directly for now.</WizardNotice>
                {requirePlan ? (
                <div className="payment-config-v5 business-mini-card-v10">
                  <div className="payment-config-title-v5"><FiCreditCard /> Payment readiness</div>
                  <label className="payment-config-option-v5">
                    <input
                      type="checkbox"
                      checked={PAYMENTS_ENABLED && Boolean(form.acceptsWallet)}
                      disabled={!PAYMENTS_ENABLED}
                      onChange={(e) => {
                        if (!PAYMENTS_ENABLED) return;
                        setForm((prev) => ({ ...prev, acceptsWallet: e.target.checked }));
                      }}
                    />
                    <span>
                      <strong>Mobile Money payments — Coming Soon</strong>
                      <small>Online MTN/Airtel collection is not active yet. Keep this off until payments launch.</small>
                    </span>
                  </label>
                  <label className="payment-config-option-v5">
                    <input
                      type="checkbox"
                      checked
                      disabled
                      readOnly
                    />
                    <span>
                      <strong>Direct payment - Available now</strong>
                      <small>Customers can pay you directly after you agree the service details.</small>
                    </span>
                  </label>
                </div>
                ) : null}
                <div className="payment-config-v5 business-mini-card-v10">
                  <div className="payment-config-title-v5"><FiMapPin /> Service location</div>
                  <label className="payment-config-option-v5">
                    <input
                      type="checkbox"
                      checked={Boolean(form.homeServiceEnabled)}
                      onChange={(e) => setForm((prev) => ({ ...prev, homeServiceEnabled: e.target.checked }))}
                    />
                    <span>
                      <strong>I can serve customers at their location</strong>
                      <small>Useful for mobile providers, home services, repairs, and delivery-based work.</small>
                    </span>
                  </label>
                </div>
                <PortfolioImageInput
                  portfolio={form.portfolio}
                  onChange={(portfolio) => setForm((prev) => ({ ...prev, portfolio }))}
                  maxPhotos={maxPhotos}
                  planName={selectedPlan.name}
                  planTier={selectedPlan.tier}
                  currentImageStats={imageStats}
                />
                {shopStand ? (
                  <div data-validation-key="products">
                    <WizardNotice>Products use order requests and stay separate from service bookings.</WizardNotice>
                    <ProductCatalogueEditor
                      products={products}
                      productLimit={productLimits.products}
                      imageLimit={productLimits.images}
                      disabled={!marketplaceAvailability.enabled}
                      onChange={(nextProducts) => setForm((prev) => ({ ...prev, products: nextProducts }))}
                      onRemove={(product) => setForm((prev) => ({
                        ...prev,
                        products: (prev.products || []).filter((item) => String(item.id) !== String(product.id)),
                        deletedProductIds: String(product.id || "").startsWith("local-product-")
                          ? prev.deletedProductIds || []
                          : [...new Set([...(prev.deletedProductIds || []), product.id])],
                      }))}
                    />
                    <FieldMessage message={fieldError("products")} />
                  </div>
                ) : null}
              </section>
            ) : null}

            {currentStep === 6 ? (
              <section className="business-step-card-v10">
                <WizardNotice>Review your {productOnly ? "shop" : "stand"}, choose the plan that fits today, and publish when every required detail is ready.</WizardNotice>
                <div className="stand-plan-chooser-v10">
                  <div className="stand-plan-heading-v10">
                    <div>
                      <span>Provider plan</span>
                      <strong>Upgrade your stand</strong>
                      <small>Start free, unlock more visibility with a promo code while payments are Coming Soon.</small>
                    </div>
                    <FiCreditCard />
                  </div>
                  <div className="stand-plan-billing-v10" role="group" aria-label="Billing cycle preview">
                    {["monthly", "annual"].map((cycle) => (
                      <button
                        type="button"
                        key={cycle}
                        className={planBilling === cycle ? "active" : ""}
                        aria-pressed={planBilling === cycle}
                        onClick={() => setPlanBilling(cycle)}
                      >
                        {cycle === "monthly" ? "Monthly" : "Annual"}
                        {cycle === "annual" ? <small>Save more</small> : null}
                      </button>
                    ))}
                  </div>
                  <div className="stand-plan-grid-v10">
                  {PROVIDER_PLANS.map((basePlan) => {
                    const plan = getMarketplacePlanContent(basePlan, marketplaceMode);
                    return (
                    <article
                      key={plan.tier}
                      className={form.selectedPlan === plan.tier ? "stand-plan-card-v10 selected" : "stand-plan-card-v10"}
                    >
                      <label className="stand-plan-select-v10">
                        <input
                          type="radio"
                          name="selectedPlan"
                          checked={form.selectedPlan === plan.tier}
                          onChange={() => setForm((prev) => ({ ...prev, selectedPlan: plan.tier, startFreeTrial: false }))}
                        />
                        <span>
                          <span className="stand-plan-name-v10">
                            <strong>{plan.name}</strong>
                            {plan.recommended ? <em>Recommended</em> : null}
                          </span>
                          <b>{formatSubscriptionPrice(plan, planBilling)}</b>
                          <small>{plan.summary}</small>
                        </span>
                      </label>
                      <ul className={detailsPlan === plan.tier ? "stand-plan-features-v10 open" : "stand-plan-features-v10"}>
                        {(detailsPlan === plan.tier ? plan.features : plan.features.slice(0, 3)).map((feature) => (
                          <li key={feature}><FiCheckCircle /> {feature}</li>
                        ))}
                      </ul>
                      <div className="stand-plan-card-actions-v10">
                        <button type="button" onClick={() => setDetailsPlan((current) => (current === plan.tier ? "" : plan.tier))}>
                          {detailsPlan === plan.tier ? "Show less" : "Compare features"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, selectedPlan: plan.tier, startFreeTrial: false }))}
                        >
                          {form.selectedPlan === plan.tier ? "Selected" : "Select plan"}
                        </button>
                      </div>
                      {plan.tier !== "FREE" && !PAYMENTS_ENABLED ? (
                        <div className="stand-plan-coming-soon-v10">Promo code unlock</div>
                      ) : (
                        <div className="stand-plan-free-v10">No payment required</div>
                      )}
                    </article>
                    );
                  })}
                  </div>
                  <div className="stand-plan-footer-v10">
                    <FiCheckCircle />
                    <span>
                      <strong>{selectedPlan.name} selected</strong>
                      <small>
                        {selectedPaidPlanComingSoon
                          ? "Save this draft now, then use Upgrade Plan to activate this paid plan with a 100% promo code."
                          : "You can publish this stand without entering payment details."}
                      </small>
                    </span>
                  </div>
                </div>
                <div className="wizard-note-v10">
                  Verification pending: Queless may review your phone, location, profile image, documents, and {productOnly ? "product catalogue before customers can order from you" : "service list before customers can book you"} publicly.
                </div>
                <div className="review-business-card-v10">
                  {form.image ? <img src={buildAssetUrl(form.image)} alt="Business preview" /> : <span><FiCamera /></span>}
                  <div>
                    <strong>{form.businessName || "Business name missing"}</strong>
                    <small>{form.businessType || "Category missing"} - {getMapIconOption(effectiveMapIconType).label} map icon</small>
                  </div>
                </div>
                <div className="review-grid-v10">
                  <div><FiMapPin /><span>Location</span><strong>{form.location || "Not added"}</strong></div>
                  {serviceStand ? <div><FiClock /><span>Hours</span><strong>{form.scheduleStart} - {form.scheduleEnd}</strong></div> : null}
                  {serviceStand ? <div><FiUsers /><span>Services</span><strong>{services.length}</strong></div> : null}
                  {shopStand ? <div><FiPackage /><span>Products</span><strong>{activeProducts.length}</strong></div> : null}
                  {shopStand ? <div><FiShoppingBag /><span>Fulfilment</span><strong>{[form.pickupAvailable ? "Pickup" : "", form.deliveryAvailable ? "Delivery" : ""].filter(Boolean).join(" & ") || "Not selected"}</strong></div> : null}
                  <div><FiCreditCard /><span>Payments</span><strong>{shopStand ? "Agreed after order request" : "Direct payment for now"}</strong></div>
                  <div><FiCheckCircle /><span>Verification</span><strong>{form.documentName || "Pending document review"}</strong></div>
                </div>
                {serviceStand ? <div className="review-list-v10">
                  <strong>Service categories</strong>
                  <p>{selectedCategories.join(", ") || "No categories selected"}</p>
                </div> : null}
                {serviceStand ? <div className="review-list-v10">
                  <strong>Services added</strong>
                  {services.length ? (
                    services.map((service, index) => (
                      <p key={service.id || index}>{service.service_name || service.category} - {formatServicePrice(service)}</p>
                    ))
                  ) : (
                    <p>No services added</p>
                  )}
                </div> : null}
                {shopStand ? (
                  <div className="review-list-v10">
                    <strong>Products added</strong>
                    {activeProducts.length
                      ? activeProducts.map((product) => <p key={product.id || product.name}>{product.name} - UGX {Number(product.sale_price ?? product.salePrice ?? product.price ?? 0).toLocaleString("en-UG")}</p>)
                      : <p>No active products added</p>}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="business-wizard-actions-v10">
            {currentStep > 1 ? (
              <button type="button" className="secondary-btn-v4" onClick={goBack} disabled={Boolean(savingIntent)}>Back</button>
            ) : null}
            {currentStep !== lastStep ? (
              <>
                <button type="button" className="secondary-btn-v4" onClick={() => submitWizard("draft")} disabled={Boolean(savingIntent)}>
                  {savingIntent === "draft" ? "Saving..." : "Save Draft"}
                </button>
                <button type="button" className="primary-btn-v4" onClick={goNext} disabled={Boolean(savingIntent)}>Continue</button>
              </>
            ) : (
              <>
                <button type="button" className="secondary-btn-v4" onClick={() => submitWizard("draft")} disabled={!canSubmit || Boolean(savingIntent)}>
                  {savingIntent === "draft" ? "Saving..." : "Save as Draft"}
                </button>
                <button
                  type="button"
                  className="primary-btn-v4"
                  onClick={() => submitWizard(selectedPaidPlanComingSoon ? "draft" : "publish")}
                  disabled={!canSubmit || Boolean(savingIntent)}
                >
                  {savingIntent
                    ? "Saving..."
                    : selectedPaidPlanComingSoon
                    ? "Save Draft"
                    : finalAction.label}
                </button>
                {selectedPaidPlanComingSoon ? (
                  <div className="wizard-note-v10">
                    Payments Coming Soon. Your stand progress will be saved as a draft for now.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function EditBarberModal({ show, barber, profile = {}, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const backupKey = barber ? getStandBackupKey("edit", barber.id || barber.business_name || profile.username) : "";

  useEffect(() => {
    if (!show || !barber) return;
    const baseForm = {
      businessName: barber.business_name || "",
      phone: toUgLocalDigits(barber.phone || profile.phone || ""),
      documentName: barber.verification_document_name || barber.document_name || barber.documentName || "",
      location: barber.location || "",
      services: Array.isArray(barber.services)
        ? barber.services.map((service, index) => normalizeServiceForBooking(service, index, { preserveEmptyTitle: true }))
        : [],
      businessType: barber.business_type || barber.businessType || "Home Services",
      subcategory: barber.subcategory || "",
      mapIconType: barber.map_icon_type || barber.mapIconType || "",
      pricing: String(barber.price_from || ""),
      scheduleStart: barber.availability?.start || "08:00",
      scheduleEnd: barber.availability?.end || "20:00",
      latitude: String(barber.latitude || DEFAULT_CENTER[0]),
      longitude: String(barber.longitude || DEFAULT_CENTER[1]),
      image: barber.image || "",
      coverImage: barber.cover_image_url || barber.coverImageUrl || "",
      acceptsWallet: Number(barber.accepts_wallet ?? barber.acceptsWallet ?? 0) === 1,
      acceptsCash: Number(barber.accepts_cash ?? barber.acceptsCash ?? 1) === 1,
      homeServiceEnabled: Number(barber.home_service_enabled ?? barber.homeServiceEnabled ?? 0) === 1,
      introText: barber.intro_text || barber.introText || "",
      standType: barber.stand_type || barber.standType || "individual",
      teamMembers: Array.isArray(barber.team_members || barber.teamMembers)
        ? (barber.team_members || barber.teamMembers)
            .flatMap((member) => {
              const name = typeof member === "string" ? member : member.name;
              return name ? [name] : [];
            })
            .join(", ")
        : "",
      portfolio: arrayFromMaybeJson(barber.portfolio ?? barber.portfolio_json ?? barber.galleryImages ?? barber.gallery_images),
      marketplaceMode: getMarketplaceMode(barber),
      businessHours: barber.business_hours || barber.businessHours || {},
      pickupAvailable: booleanFromApi(barber.pickup_available ?? barber.pickupAvailable, true),
      deliveryAvailable: booleanFromApi(barber.delivery_available ?? barber.deliveryAvailable, false),
      deliveryAreas: arrayFromMaybeJson(barber.delivery_areas ?? barber.deliveryAreas),
      deliveryFee: barber.delivery_fee ?? barber.deliveryFee ?? "",
      deliveryNotes: barber.delivery_notes || barber.deliveryNotes || "",
      products: Array.isArray(barber.products) ? barber.products : [],
      deletedProductIds: [],
      selectedPlan: String(barber.selected_plan || barber.subscription?.tier || barber.subscription_tier || "FREE").toUpperCase(),
      startFreeTrial: false,
      dirtyFields: [],
    };
    const savedAt = new Date(barber.updated_at || barber.updatedAt || 0).getTime();
    const backup = readStandFormBackup(backupKey, savedAt) || {};
    setForm({ ...baseForm, ...backup });
  }, [backupKey, show, barber, profile.phone, setForm]);

  useEffect(() => {
    let cancelled = false;
    if (!show || !barber || !supportsProducts(barber)) return undefined;
    getMyProducts()
      .then((data) => {
        if (cancelled) return;
        const standProducts = (data?.products || []).filter((product) => (
          !product.stand_id && !product.standId
        ) || String(product.stand_id || product.standId) === String(barber.id));
        setForm((current) => current.products?.length ? current : { ...current, products: standProducts });
      })
      .catch(() => {
        // The feature flag may be off. The saved stand and local backup remain intact.
      });
    return () => {
      cancelled = true;
    };
  }, [barber, setForm, show]);

  return (
    <BarberStandFormModal
      key={show && barber ? `edit-${barber.id || barber.business_name || "open"}` : "edit-closed"}
      show={show && !!barber}
      title="Edit Business"
      submitLabel="Save business changes"
      form={form}
      setForm={setForm}
      onClose={onClose}
      onSubmit={onSubmit}
      profile={{ ...profile, ...(barber || {}), subscription: barber?.subscription || profile?.subscription }}
      backupKey={backupKey}
      autoSaveEnabled
    />
  );
}

export function RegisterBarberModal({ show, profile, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const backupKey = getStandBackupKey("new", profile?.username || profile?.id || "guest");

  useEffect(() => {
    if (!show) return;
    const seedForm = {
      ...DEFAULT_FORM,
      phone: toUgLocalDigits(profile?.phone || ""),
      location: profile?.address || "",
      image: profile?.profilePhoto || "",
    };
    setForm({ ...seedForm, ...(readStandFormBackup(backupKey, 0) || {}) });
  }, [backupKey, show, profile?.address, profile?.phone, profile?.profilePhoto, setForm]);

  return (
    <BarberStandFormModal
      key={show ? `register-${profile?.id || profile?.username || "open"}` : "register-closed"}
      show={show}
      title="Create Stand"
      submitLabel="Create business account"
      form={form}
      setForm={setForm}
      onClose={onClose}
      onSubmit={onSubmit}
      requirePlan
      profile={profile}
      backupKey={backupKey}
    />
  );
}
