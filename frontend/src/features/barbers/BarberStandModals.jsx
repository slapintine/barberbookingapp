import { useEffect, useMemo, useRef, useState } from "react";
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
  FiPlus,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { DEFAULT_SERVICE_TYPES, SERVICE_CATEGORIES, formatServicePrice, normalizeServiceForBooking } from "../../utils/serviceCatalog.js";
import { MAP_ICON_OPTIONS, MULTI_SERVICE_MAP_ICON_TYPE, getMapIconOption, getMapIconTypeForCategory, getMapIconTypeForSelectedCategories } from "../../utils/mapIconCategories.js";
import { getGeolocationErrorMessage, reverseGeocodeCoordinates } from "../../utils/locationUtils.js";
import { formatMoney, formatSubscriptionPrice, getPlanFeatures, PROVIDER_PLANS } from "../../utils/subscriptionPlans.js";

const DEFAULT_CENTER = [0.3136, 32.5811];
const TOTAL_STEPS = 6;

const DEFAULT_FORM = {
  businessName: "",
  phone: "",
  documentName: "",
  businessType: "Beauty & Grooming",
  mapIconType: "beauty-grooming",
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
  selectedPlan: "PLUS",
  startFreeTrial: false,
};

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
    duration_minutes: 30,
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

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

function getServiceLocationLabel(service = {}) {
  const type = String(service.location_type || "provider_location").toLowerCase();
  if (type === "customer_location") return "Customer location";
  if (type === "online") return "Online";
  return "Provider location";
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
  if (Number(service.duration_minutes || 0) < 5) return "Add duration";
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

function normalizeFormServices(value, fallbackToDefaults = false) {
  if (Array.isArray(value) && value.length) return value.map(normalizeServiceForBooking);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizeServiceForBooking);
  }
  return fallbackToDefaults ? DEFAULT_SERVICE_TYPES.map(normalizeServiceForBooking) : [];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
}) {
  const imageInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setProgress(22);
      const result = await fileToDataUrl(file);
      setProgress(100);
      onChange(result);
    } catch {}
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
          <img src={image} alt={previewAlt} />
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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageChange}
      />
      <div className="image-upload-actions-v9">
        <button type="button" className="secondary-btn-v4" onClick={() => imageInputRef.current?.click()}>
          <FiImage /> {image ? changeLabel : uploadLabel}
        </button>
        {image ? (
          <button type="button" className="secondary-btn-v4 danger-soft-v9" onClick={() => onChange("")}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PortfolioImageInput({ portfolio = [], onChange, maxPhotos = Infinity, planName = "Platinum" }) {
  const portfolioInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const portfolioItems = Array.isArray(portfolio) ? portfolio : [];

  const handlePortfolioChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (Number.isFinite(maxPhotos) && portfolioItems.length + files.length > maxPhotos) {
      onChange(portfolioItems);
      return;
    }
    try {
      setUploading(true);
      setProgress(25);
      const images = await Promise.all(files.map(fileToDataUrl));
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
    } catch {}
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
        <small>{Number.isFinite(maxPhotos) ? `${portfolioItems.length}/${maxPhotos} photos used on this plan.` : "Unlimited portfolio photos on this plan."}</small>
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
      {Number.isFinite(maxPhotos) && portfolioItems.length >= maxPhotos ? (
        <div className="wizard-note-v10">You have reached the {planName} limit of {maxPhotos} photos. Upgrade to add more.</div>
      ) : null}
      {uploading ? (
        <div className="upload-progress-v9" aria-label="Uploading portfolio images">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {portfolioItems.length ? (
        <div className="portfolio-preview-grid-v9">
          {portfolioItems.map((item, index) => {
            const image = item.afterImage || item.beforeImage || item.image;
            return image ? (
              <div key={item.id || index} className="portfolio-preview-v9">
                <img src={image} alt="Portfolio preview" />
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

function StepHeader({ currentStep, stepTitle }) {
  return (
    <div className="business-step-progress-v10">
      <div className="business-step-progress-copy-v10">
        <span>Step {currentStep} of {TOTAL_STEPS}</span>
        <strong>{stepTitle}</strong>
      </div>
      <div className="progress-track-v10">
        <div className="progress-fill-v10" style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }} />
      </div>
    </div>
  );
}

function WizardNotice({ children }) {
  return <div className="wizard-note-v10">{children}</div>;
}

function BarberStandFormModal({ show, title, submitLabel, form, setForm, onClose, onSubmit, requirePlan = false }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState("");
  const [activeServiceIndex, setActiveServiceIndex] = useState(0);
  const [detailsPlan, setDetailsPlan] = useState("");
  const [locationDetecting, setLocationDetecting] = useState(false);
  const services = normalizeFormServices(form.services);
  const selectedPlan = PROVIDER_PLANS.find((plan) => plan.tier === form.selectedPlan) || PROVIDER_PLANS[0];
  const planFeatures = getPlanFeatures(selectedPlan.id);
  const maxServices = planFeatures.maxServices;
  const maxPhotos = planFeatures.maxPhotos;
  const selectedCategories = useMemo(() => [...new Set(services.map((service) => service.category).filter(Boolean))], [services]);
  const selectedCategoryItems = useMemo(
    () =>
      selectedCategories.map((category) => ({
        key: getMapIconTypeForCategory(category),
        label: category,
        iconType: getMapIconTypeForCategory(category),
      })),
    [selectedCategories]
  );
  const selectedMapIconType = useMemo(() => getMapIconTypeForSelectedCategories(selectedCategories), [selectedCategories]);
  const selectedMapIconOption = selectedMapIconType ? getMapIconOption(selectedMapIconType) : null;
  const effectiveMapIconType = selectedMapIconType || form.mapIconType || getMapIconTypeForCategory(form.businessType);
  const mapPreviewTitle = selectedMapIconOption?.label || "No map icon selected";
  const mapPreviewText = !selectedMapIconOption
    ? "Choose at least one service category to set your map icon."
    : selectedMapIconType === MULTI_SERVICE_MAP_ICON_TYPE
    ? "This icon will appear when your business spans several service categories."
    : "This icon will appear on the Queless map.";
  const canSubmit = true;

  const stepTitles = [
    "Business Basics",
    "Location & Availability",
    "Service Categories",
    "Add Services",
    "Payments & Booking",
    "Review & Submit",
  ];

  useEffect(() => {
    if (show) {
      setCurrentStep(1);
      setError("");
      setActiveServiceIndex(0);
      setDetailsPlan("");
      setLocationDetecting(false);
    }
  }, [show]);

  useEffect(() => {
    if (activeServiceIndex > services.length - 1) {
      setActiveServiceIndex(Math.max(0, services.length - 1));
    }
  }, [activeServiceIndex, services.length]);

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
      const nextCategories = [...new Set(nextServices.map((service) => service.category).filter(Boolean))];
      const nextMapIconType = getMapIconTypeForSelectedCategories(nextCategories);
      return {
        ...prev,
        businessType: nextCategories[0] || prev.businessType,
        mapIconType: nextMapIconType,
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

  const validateStep = (step = currentStep) => {
    if (step === 1) {
      if (!form.businessName?.trim()) return "Please enter your business name.";
      if (!form.businessType?.trim()) return "Please select your main business category.";
      if (!form.phone?.trim()) return "Please add a business phone number.";
      if (String(form.documentName || "").trim().length > 120 || /[<>]/.test(String(form.documentName || ""))) {
        return "Verification document reference must be 120 characters or fewer and cannot contain HTML.";
      }
    }
    if (step === 2) {
      if (!form.location?.trim() && (!form.latitude || !form.longitude)) return "Please add your business location or use current location.";
      if (!form.scheduleStart || !form.scheduleEnd) return "Please add your opening and closing time.";
    }
    if (step === 3) {
      if (!selectedCategories.length) return "Please select at least one service category.";
    }
    if (step === 4) {
      if (!services.length) return "Please add at least one service.";
      if (Number.isFinite(maxServices) && services.length > maxServices) return `You have reached the ${selectedPlan.name} limit of ${maxServices} services. Upgrade to add more.`;
      const incomplete = services.find((service) => !service.service_name?.trim());
      if (incomplete) return "Please give each service a clear listing title.";
      const duplicateNames = new Set();
      for (const service of services) {
        const key = `${String(service.service_name || "").trim().toLowerCase()}|${String(service.category || "").trim().toLowerCase()}`;
        if (duplicateNames.has(key)) return "Please remove duplicate services in the same category.";
        duplicateNames.add(key);
        const pricingType = String(service.pricing_type || "fixed");
        if (pricingType === "fixed" && Number(service.price_extra || 0) <= 0) return "Please enter a valid price.";
        if (pricingType === "range") {
          if (Number(service.min_price || 0) <= 0 || Number(service.max_price || 0) <= 0) return "Please complete the price range before saving.";
          if (Number(service.max_price) <= Number(service.min_price)) return "Maximum price must be greater than minimum price.";
        }
        if (pricingType === "starting_from" && Number(service.starting_price || 0) <= 0) return "Please enter a valid price.";
        if (Number(service.duration_minutes || 0) < 5) return "Please set a realistic duration for each service.";
      }
    }
    if (step === 5) {
      if (!canSubmit) return "Please choose at least one payment option.";
      if (Number.isFinite(maxPhotos) && Array.isArray(form.portfolio) && form.portfolio.length > maxPhotos) return `You have reached the ${selectedPlan.name} limit of ${maxPhotos} photos. Upgrade to add more.`;
    }
    if (requirePlan && step === 6 && form.startFreeTrial) {
      if (!form.selectedPlan) return "Please choose a plan before creating your business.";
    }
    return "";
  };

  const goNext = () => {
    const message = validateStep(currentStep);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setCurrentStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  };

  const goBack = () => {
    setError("");
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const submitWizard = (intent = "draft") => {
    for (let step = 1; step <= TOTAL_STEPS - 1; step += 1) {
      const message = validateStep(step);
      if (message) {
        setCurrentStep(step);
        setError(message);
        return;
      }
    }
    setError("");
    onSubmit({
      ...form,
      submitIntent: intent,
      categories: selectedCategoryItems.map((category) => category.key),
      selectedCategories: selectedCategoryItems,
      primaryCategory: selectedCategories.length === 1 ? selectedCategoryItems[0]?.key || null : null,
      businessType: selectedCategories[0] || form.businessType,
      mapIconType: selectedMapIconType,
      services,
    });
  };

  if (!show) return null;

  const activeService = services[activeServiceIndex];
  const activePricingType = String(activeService?.pricing_type || "fixed").toLowerCase();
  const activeServiceReadiness = activeService ? getServiceReadiness(activeService) : "";

  return (
    <>
      <div className="booking-overlay-v4 open" onClick={onClose} />
      <div className="booking-modal-v4 open business-wizard-modal-v10">
        <div className="booking-modal-card-v4 business-wizard-card-v10">
          <div className="barber-profile-topbar-v4 business-wizard-topbar-v10">
            <button type="button" className="profile-back-btn-v4" onClick={currentStep === 1 ? onClose : goBack}>
              <FiArrowLeft />
            </button>
            <div className="profile-top-title-v4">{title}</div>
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiX />
            </button>
          </div>

          <div className="business-wizard-v10">
            <StepHeader currentStep={currentStep} stepTitle={stepTitles[currentStep - 1]} />

            {error ? (
              <div className="auth-error business-wizard-error-v10">
                {error}
                {error.toLowerCase().includes("business with this name already exists") ? (
                  <button type="button" className="mini-action-btn-v4" onClick={() => setError("Claim/report request noted. Admin review will be available from the support workflow.")}>
                    This is my business / Claim or report
                  </button>
                ) : null}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <section className="business-step-card-v10">
                <WizardNotice>This helps customers understand who you are and what you offer.</WizardNotice>
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
                />
                <div className="business-field-grid-v10">
                  <label className="label-v4">
                    Business name
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.businessName}
                      placeholder="Example: Prime Service Studio"
                      onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
                    />
                  </label>
                  <label className="label-v4">
                    Main category
                    <select
                      className="field-input-v4 profile-input-v4"
                      value={form.businessType}
                      onChange={(e) => setForm((prev) => ({ ...prev, businessType: e.target.value, mapIconType: prev.mapIconType || getMapIconTypeForCategory(e.target.value) }))}
                    >
                      {SERVICE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label className="label-v4">
                    Business phone
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.phone}
                      placeholder="+256 700 000 000"
                      onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                  </label>
                  <label className="label-v4">
                    Map icon
                    <select
                      className="field-input-v4 profile-input-v4"
                      value={effectiveMapIconType}
                      onChange={(e) => setForm((prev) => ({ ...prev, mapIconType: e.target.value }))}
                    >
                      {MAP_ICON_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="label-v4">
                    Price from
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.pricing}
                      inputMode="numeric"
                      placeholder="20000"
                      onChange={(e) => setForm((prev) => ({ ...prev, pricing: e.target.value }))}
                    />
                  </label>
                  <label className="label-v4">
                    Short intro
                    <textarea
                      className="textarea-v4"
                      placeholder="Tell customers what makes your business special."
                      value={form.introText}
                      onChange={(e) => setForm((prev) => ({ ...prev, introText: e.target.value }))}
                    />
                  </label>
                  <label className="label-v4">
                    Verification document or reference
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={form.documentName}
                      placeholder="National ID, business permit, trade license, or secure upload reference"
                      onChange={(e) => setForm((prev) => ({ ...prev, documentName: e.target.value }))}
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {currentStep === 2 ? (
              <section className="business-step-card-v10">
                <WizardNotice>Set where customers can find you and when you are usually available.</WizardNotice>
                <label className="label-v4">
                  Business location
                  <input
                    className="field-input-v4 profile-input-v4"
                    value={form.location}
                    placeholder="Example: Gayaza Town, Kampala Road"
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  />
                </label>
                <button type="button" className="location-action-btn-v10" onClick={fillCurrentLocation} disabled={locationDetecting}>
                  <FiNavigation /> {locationDetecting ? "Detecting location..." : form.location || "Use my current location"}
                </button>
                <div className="business-field-grid-v10 two-v10">
                  <label className="label-v4">
                    Opening time
                    <input
                      className="field-input-v4 profile-input-v4"
                      type="time"
                      value={form.scheduleStart}
                      onChange={(e) => setForm((prev) => ({ ...prev, scheduleStart: e.target.value }))}
                    />
                  </label>
                  <label className="label-v4">
                    Closing time
                    <input
                      className="field-input-v4 profile-input-v4"
                      type="time"
                      value={form.scheduleEnd}
                      onChange={(e) => setForm((prev) => ({ ...prev, scheduleEnd: e.target.value }))}
                    />
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
                <div className={selectedMapIconOption ? "map-icon-preview-v10" : "map-icon-preview-v10 empty"}>
                  {selectedMapIconOption ? (
                    <span dangerouslySetInnerHTML={{ __html: selectedMapIconOption.svg }} />
                  ) : (
                    <span><FiMapPin /></span>
                  )}
                  <div>
                    <strong>{mapPreviewTitle}</strong>
                    <small>{mapPreviewText}</small>
                  </div>
                </div>
              </section>
            ) : null}

            {currentStep === 4 ? (
              <section className="business-step-card-v10">
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
                        {service.image ? <img src={service.image} alt={service.service_name || "Service"} /> : <FiImage />}
                      </span>
                      <span className="service-summary-copy-v10">
                        <strong>{service.service_name || service.category || "Service"}</strong>
                        <small>{service.category || "Service"} - {formatServicePrice(service)}</small>
                        <em>{service.duration_minutes || 30} mins - {getServiceLocationLabel(service)}</em>
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
                        <small>{formatServicePrice(activeService)} - {activeService.duration_minutes || 30} mins - {getServiceLocationLabel(activeService)}</small>
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
                      <label className="label-v4">
                        Service title
                        <input
                          className="field-input-v4 profile-input-v4"
                          value={activeService.service_name || ""}
                          onChange={(e) => updateService(activeServiceIndex, { service_name: e.target.value })}
                        />
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
                      <label className="label-v4">
                        Fixed price
                        <input className="field-input-v4 profile-input-v4" type="number" min="1" value={activeService.price_extra || ""} onChange={(e) => updateService(activeServiceIndex, { price_extra: Number(e.target.value || 0) })} />
                      </label>
                    ) : null}
                    {activePricingType === "range" ? (
                      <div className="business-field-grid-v10 two-v10">
                        <label className="label-v4">
                          Minimum price
                          <input className="field-input-v4 profile-input-v4" type="number" min="1" value={activeService.min_price || ""} onChange={(e) => updateService(activeServiceIndex, { min_price: Number(e.target.value || 0) })} />
                        </label>
                        <label className="label-v4">
                          Maximum price
                          <input className="field-input-v4 profile-input-v4" type="number" min="1" value={activeService.max_price || ""} onChange={(e) => updateService(activeServiceIndex, { max_price: Number(e.target.value || 0) })} />
                        </label>
                      </div>
                    ) : null}
                    {activePricingType === "starting_from" ? (
                      <label className="label-v4">
                        Starting price
                        <input className="field-input-v4 profile-input-v4" type="number" min="1" value={activeService.starting_price || ""} onChange={(e) => updateService(activeServiceIndex, { starting_price: Number(e.target.value || 0) })} />
                      </label>
                    ) : null}
                    {activePricingType === "quote" ? (
                      <div className="wizard-note-v10">Customers will see Request quote and cannot directly book this service until you agree on price and scope.</div>
                    ) : null}
                    <div className="service-editor-group-v10">
                      <div className="service-editor-label-v10">Duration</div>
                      <div className="duration-chip-grid-v10">
                        {DURATION_PRESETS.map((minutes) => (
                          <button
                            type="button"
                            key={minutes}
                            className={Number(activeService.duration_minutes || 30) === minutes ? "duration-chip-v10 active" : "duration-chip-v10"}
                            onClick={() => updateService(activeServiceIndex, { duration_minutes: minutes })}
                          >
                            {minutes}m
                          </button>
                        ))}
                      </div>
                      <label className="label-v4">
                        Custom duration minutes
                        <input
                          className="field-input-v4 profile-input-v4"
                          type="number"
                          min="5"
                          value={activeService.duration_minutes || 30}
                          onChange={(e) => updateService(activeServiceIndex, { duration_minutes: Number(e.target.value || 30) })}
                        />
                      </label>
                    </div>
                    <div className="service-editor-group-v10">
                      <div className="service-editor-label-v10">Where this service happens</div>
                      <div className="pricing-mode-grid-v10 location-mode-grid-v10">
                        {[
                          ["provider_location", "Provider location", form.location || "Your business address"],
                          ["customer_location", "Customer location", "Home service or on-site visit"],
                        ].map(([value, label, hint]) => (
                          <button
                            type="button"
                            key={value}
                            className={String(activeService.location_type || "provider_location") === value ? "pricing-mode-card-v10 active" : "pricing-mode-card-v10"}
                            onClick={() => {
                              updateService(activeServiceIndex, { location_type: value });
                              if (value === "customer_location") {
                                setForm((prev) => ({ ...prev, homeServiceEnabled: true }));
                              }
                            }}
                          >
                            <strong>{label}</strong>
                            <span>{hint}</span>
                          </button>
                        ))}
                      </div>
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
                    />
                    <label className="label-v4">
                      Service description
                      <textarea
                        className="textarea-v4"
                        value={activeService.description || ""}
                        placeholder="Describe what is included in this service."
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
                <WizardNotice>Choose how customers can pay and how your services are offered.</WizardNotice>
                {requirePlan ? (
                <div className="payment-config-v5 business-mini-card-v10">
                  <div className="payment-config-title-v5"><FiCreditCard /> Payment options</div>
                  <label className="payment-config-option-v5">
                    <input
                      type="checkbox"
                      checked={Boolean(form.acceptsWallet)}
                      onChange={(e) => setForm((prev) => ({ ...prev, acceptsWallet: e.target.checked }))}
                    />
                    <span>
                      <strong>Mobile Money payments</strong>
                      <small>Customers can pay directly during booking where supported.</small>
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
                      <strong>Cash payment - Always available</strong>
                      <small>Customers can pay cash directly after the service.</small>
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
                />
              </section>
            ) : null}

            {currentStep === 6 ? (
              <section className="business-step-card-v10">
                <WizardNotice>Review everything before creating your business profile.</WizardNotice>
                <div className="payment-config-v5 business-mini-card-v10">
                  <div className="payment-config-title-v5"><FiCreditCard /> Provider plan</div>
                  {PROVIDER_PLANS.map((plan) => (
                    <div key={plan.tier} className="profile-review-card-v4">
                      <label className="payment-config-option-v5">
                        <input
                          type="radio"
                          name="selectedPlan"
                          checked={form.selectedPlan === plan.tier}
                          onChange={() => setForm((prev) => ({ ...prev, selectedPlan: plan.tier, startFreeTrial: false }))}
                        />
                        <span>
                          <strong>{plan.name} - {formatSubscriptionPrice(plan, "monthly")}</strong>
                          <small>{plan.summary}</small>
                          {plan.recommended ? <small>Recommended</small> : null}
                        </span>
                      </label>
                      <div className="inline-actions-v4">
                        <button type="button" className="mini-action-btn-v4" onClick={() => setDetailsPlan((current) => (current === plan.tier ? "" : plan.tier))}>
                          {detailsPlan === plan.tier ? "Hide Plan Details" : "View Plan Details"}
                        </button>
                        <button
                          type="button"
                          className="mini-action-btn-v4 success"
                          onClick={() => setForm((prev) => ({ ...prev, selectedPlan: plan.tier, startFreeTrial: false }))}
                        >
                          Choose Plan
                        </button>
                      </div>
                      {detailsPlan === plan.tier ? (
                        <div className="profile-review-text-v4">
                          <strong>{plan.name}</strong> plan includes: {plan.features.join(", ")}. Annual: {formatSubscriptionPrice(plan, "annual")} (save {formatMoney(plan.annualSavings)} yearly).
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div className="wizard-note-v10">
                    Save a draft to finish later, or continue to payment to activate after Mobile Money succeeds.
                  </div>
                </div>
                <div className="wizard-note-v10">
                  Verification pending: Queless may review your phone, service area, profile image, documents, pricing, and service list before customers can book you publicly.
                </div>
                <div className="review-business-card-v10">
                  {form.image ? <img src={form.image} alt="Business preview" /> : <span><FiCamera /></span>}
                  <div>
                    <strong>{form.businessName || "Business name missing"}</strong>
                    <small>{form.businessType || "Category missing"} - {getMapIconOption(effectiveMapIconType).label} map icon</small>
                  </div>
                </div>
                <div className="review-grid-v10">
                  <div><FiMapPin /><span>Location</span><strong>{form.location || "Not added"}</strong></div>
                  <div><FiClock /><span>Hours</span><strong>{form.scheduleStart} - {form.scheduleEnd}</strong></div>
                  <div><FiUsers /><span>Services</span><strong>{services.length}</strong></div>
                  <div><FiCreditCard /><span>Payments</span><strong>{["Cash", form.acceptsWallet ? "Wallet" : ""].filter(Boolean).join(", ")}</strong></div>
                  <div><FiCheckCircle /><span>Verification</span><strong>{form.documentName || "Pending document review"}</strong></div>
                </div>
                <div className="review-list-v10">
                  <strong>Service categories</strong>
                  <p>{selectedCategories.join(", ") || "No categories selected"}</p>
                </div>
                <div className="review-list-v10">
                  <strong>Services added</strong>
                  {services.length ? (
                    services.map((service, index) => (
                      <p key={service.id || index}>{service.service_name || service.category} - {formatServicePrice(service)}</p>
                    ))
                  ) : (
                    <p>No services added</p>
                  )}
                </div>
              </section>
            ) : null}
          </div>

          <div className="business-wizard-actions-v10">
            {currentStep > 1 ? (
              <button type="button" className="secondary-btn-v4" onClick={goBack}>Back</button>
            ) : null}
            {currentStep < TOTAL_STEPS ? (
              <button type="button" className="primary-btn-v4" onClick={goNext}>Continue</button>
            ) : (
              <>
                <button type="button" className="secondary-btn-v4" onClick={() => submitWizard("draft")} disabled={!canSubmit}>
                  Save as Draft
                </button>
                <button type="button" className="primary-btn-v4" onClick={() => submitWizard("payment")} disabled={!canSubmit}>
                  Continue to Payment
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function EditBarberModal({ show, barber, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!show || !barber) return;
    setForm({
      businessName: barber.business_name || "",
      phone: barber.phone || "",
      documentName: barber.verification_document_name || barber.document_name || barber.documentName || "",
      location: barber.location || "",
      services: Array.isArray(barber.services)
        ? barber.services.map(normalizeServiceForBooking)
        : DEFAULT_SERVICE_TYPES.map(normalizeServiceForBooking),
      businessType: barber.business_type || barber.businessType || "Beauty & Grooming",
      mapIconType: barber.map_icon_type || barber.mapIconType || getMapIconTypeForCategory(barber.business_type || barber.businessType || "Beauty & Grooming"),
      pricing: String(barber.price_from || ""),
      scheduleStart: barber.availability?.start || "08:00",
      scheduleEnd: barber.availability?.end || "20:00",
      latitude: String(barber.latitude || DEFAULT_CENTER[0]),
      longitude: String(barber.longitude || DEFAULT_CENTER[1]),
      image: barber.image || "",
      acceptsWallet: Number(barber.accepts_wallet ?? barber.acceptsWallet ?? 0) === 1,
      acceptsCash: Number(barber.accepts_cash ?? barber.acceptsCash ?? 1) === 1,
      homeServiceEnabled: Number(barber.home_service_enabled ?? barber.homeServiceEnabled ?? 0) === 1,
      introText: barber.intro_text || barber.introText || "",
      standType: barber.stand_type || barber.standType || "individual",
      teamMembers: Array.isArray(barber.team_members || barber.teamMembers)
        ? (barber.team_members || barber.teamMembers)
            .map((member) => (typeof member === "string" ? member : member.name))
            .filter(Boolean)
            .join(", ")
        : "",
      portfolio: Array.isArray(barber.portfolio) ? barber.portfolio : [],
      selectedPlan: barber.subscription?.tier || barber.subscription_tier || "PLUS",
      startFreeTrial: false,
    });
  }, [show, barber]);

  return (
    <BarberStandFormModal
      show={show && !!barber}
      title="Edit Business"
      submitLabel="Save business changes"
      form={form}
      setForm={setForm}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

export function RegisterBarberModal({ show, profile, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!show) return;
    setForm((prev) => ({
      ...DEFAULT_FORM,
      location: prev.location || profile.address || "",
      image: prev.image || profile.profilePhoto || "",
    }));
  }, [show, profile.address, profile.profilePhoto]);

  return (
    <BarberStandFormModal
      show={show}
      title="List Your Service"
      submitLabel="Create business account"
      form={form}
      setForm={setForm}
      onClose={onClose}
      onSubmit={onSubmit}
      requirePlan
    />
  );
}
