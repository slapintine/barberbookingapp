import { useEffect, useRef, useState } from "react";
import { buildAssetUrl } from "../../config/api.js";
import {
  FiArrowLeft,
  FiCalendar,
  FiCamera,
  FiCheckCircle,
  FiChevronRight,
  FiChevronLeft,
  FiClock,
  FiCreditCard,
  FiEdit2,
  FiFlag,
  FiHeart,
  FiImage,
  FiLayout,
  FiMap,
  FiMapPin,
  FiMessageCircle,
  FiMoreHorizontal,
  FiPhone,
  FiPlay,
  FiScissors,
  FiShare2,
  FiShield,
  FiStar,
  FiTag,
  FiUsers,
  FiVideo,
  FiX,
  FiZap,
  FiSliders,
  FiBookOpen,
  FiGlobe,
  FiBriefcase,
  FiInfo,
} from "react-icons/fi";
import VerificationBadge from "../../components/ui/VerificationBadge.jsx";
import { resolveProviderImage } from "../../utils/providerImage.js";

/* ── helpers ──────────────────────────────────────────── */

function formatServicePrice(service = {}) {
  const money = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0
      ? `UGX ${amount.toLocaleString("en-UG")}`
      : "";
  };
  const type = String(
    service.pricing_type || service.pricingType || "fixed"
  ).toLowerCase();
  if (type === "quote") return "Request quote";
  if (type === "range") {
    const min = money(service.min_price ?? service.minPrice);
    const max = money(service.max_price ?? service.maxPrice);
    return min && max ? `${min} – ${max}` : "Request quote";
  }
  if (type === "starting_from") {
    const val = money(service.starting_price ?? service.startingPrice);
    return val ? `From ${val}` : "Request quote";
  }
  return (
    money(service.price_extra ?? service.price ?? service.extra) ||
    "Request quote"
  );
}

function getServiceIcon(service = {}, businessType = "") {
  const name = String(
    service.service_name || service.name || ""
  ).toLowerCase();
  const type = String(businessType).toLowerCase();
  if (
    name.includes("photo") ||
    name.includes("wedding") ||
    type.includes("photo")
  )
    return FiCamera;
  if (name.includes("video") || name.includes("cinema")) return FiVideo;
  if (name.includes("event") || name.includes("coverage")) return FiCalendar;
  if (
    name.includes("hair") ||
    name.includes("cut") ||
    name.includes("barber") ||
    name.includes("beard") ||
    name.includes("shave")
  )
    return FiScissors;
  if (name.includes("edit") || name.includes("retouching") || name.includes("color grading"))
    return FiSliders;
  if (
    name.includes("nail") ||
    name.includes("beauty") ||
    name.includes("braid") ||
    name.includes("makeup")
  )
    return FiStar;
  if (name.includes("tutor") || name.includes("lesson") || name.includes("class"))
    return FiBookOpen;
  if (name.includes("consult") || name.includes("dental") || name.includes("lab"))
    return FiInfo;
  if (name.includes("massage") || name.includes("spa")) return FiZap;
  return FiBriefcase;
}

function getCategoryIcon(category = "") {
  const cat = String(category).toLowerCase();
  if (cat.includes("event")) return <FiCalendar size={14} />;
  if (cat.includes("photo") || cat.includes("camera")) return <FiCamera size={14} />;
  if (cat.includes("video")) return <FiVideo size={14} />;
  if (cat.includes("edit") || cat.includes("design")) return <FiSliders size={14} />;
  if (cat.includes("hair") || cat.includes("barber")) return <FiScissors size={14} />;
  if (cat.includes("beauty") || cat.includes("nail") || cat.includes("salon"))
    return <FiStar size={14} />;
  return <FiTag size={14} />;
}

function groupServiceCategories(services = []) {
  const seen = new Set();
  return services
    .map((s) => s.category || s.service_category)
    .filter((c) => c && !seen.has(c) && seen.add(c));
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getPortfolioImage(item) {
  if (typeof item === "string") return item.trim();
  return String(item?.afterImage || item?.after_image || item?.image || item?.beforeImage || item?.before_image || "").trim();
}

function getVerificationState(barber = {}) {
  const status = String(barber.verified_status || barber.verification_status || barber.verified || "").trim().toLowerCase();
  const approved = barber.is_verified === true || barber.is_verified === 1 || ["approved", "verified", "complete", "completed"].includes(status);
  const pending = ["pending", "pending verification", "under review", "submitted", "review"].some((value) => status.includes(value));
  if (approved) {
    return {
      status: "verified",
      label: "Verified provider",
      detail: "Verification has been completed by Queless.",
      body: "This provider has completed Queless verification. Check prices, hours, and reviews before booking. Never share PINs or verification codes.",
    };
  }
  if (pending) {
    return {
      status: "pending",
      label: "Verification under review",
      detail: "Queless is reviewing the submitted verification details.",
      body: "This provider's verification is under review. You can still check their services, prices, portfolio, and reviews before booking.",
    };
  }
  return {
    status: "unverified",
    label: "Verification not completed",
    detail: "This provider has not completed verification.",
    body: "This provider has not completed verification. Check prices, hours, portfolio, and reviews before booking.",
  };
}

function getProviderPortfolio(barber = {}) {
  const savedPortfolio = arrayValue(barber.portfolio || barber.portfolio_json);
  const galleryImages = arrayValue(
    barber.portfolioImages ||
    barber.portfolio_images ||
    barber.galleryImages ||
    barber.gallery_images ||
    barber.gallery
  );
  const entries = savedPortfolio.length
    ? savedPortfolio
    : galleryImages.map((image, index) => ({ id: `gallery-${index}`, image, title: "Portfolio image" }));
  return entries.filter((item) => getPortfolioImage(item) || item?.video_url || item?.videoUrl);
}

function getPopularityTags(service = {}, index = 0, totalRating = 0, reviewCount = 0) {
  // use explicit tag if set on the service
  if (service.tag_label || service.badge || service.popularity_tag) {
    return [service.tag_label || service.badge || service.popularity_tag];
  }
  const tags = [];
  if (index === 0 && reviewCount >= 10 && totalRating >= 4.5) tags.push("High demand", "Popular");
  else if (index === 1 && totalRating >= 4.5) tags.push("Top rated");
  else if (Number(service.duration_minutes || 0) > 0 && Number(service.duration_minutes) <= 20) tags.push("Quick service");
  else tags.push("Usually available");
  return tags;
}

function fmtDuration(mins) {
  const m = Number(mins || 0);
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

/* ── sub-components ───────────────────────────────────── */

function StarRow({ rating, size = 14 }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="pps-star-row" aria-label={`${rating} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <FiStar
          key={i}
          size={size}
          className={
            i < full
              ? "pps-star filled"
              : i === full && half
              ? "pps-star half"
              : "pps-star"
          }
        />
      ))}
    </span>
  );
}

function ServiceCard({ service, barber, isOwner, onBook, onRequestQuote, onOpenChat, onOpenDetails, currentUserIsBarber }) {
  const isQuote =
    String(service.pricing_type || service.pricingType || "").toLowerCase() ===
      "quote" || formatServicePrice(service) === "Request quote";
  const SvcIcon = getServiceIcon(service, barber.business_type);
  const priceLabel = formatServicePrice(service);
  const duration = fmtDuration(service.duration_minutes);
  const tags = getPopularityTags(service, 0, barber.rating, barber.reviewCount);
  const imgSrc = buildAssetUrl(service.image || service.image_url || "");

  function handleAction() {
    if (isOwner) return;
    if (isQuote) {
      onRequestQuote?.(service);
    } else {
      onBook?.(service);
    }
  }

  return (
    <article
      className="pps-svc-card pps-svc-card--clickable"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails?.(service)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails?.(service);
        }
      }}
    >
      <div className="pps-svc-img-wrap">
        {imgSrc ? (
          <img src={imgSrc} alt={service.service_name || "Service"} loading="lazy" decoding="async" />
        ) : (
          <div className="pps-svc-img-placeholder">
            <SvcIcon size={28} />
          </div>
        )}
        <div className="pps-svc-cat-badge">
          <SvcIcon size={14} />
        </div>
      </div>
      <div className="pps-svc-body">
        <strong className="pps-svc-name">{service.service_name || service.name || "Service"}</strong>
        {service.description ? (
          <p className="pps-svc-desc">{service.description}</p>
        ) : null}
        {tags.length > 0 && (
          <div className="pps-svc-tags">
            {tags.map((tag) => (
              <span key={tag} className="pps-svc-tag">
                {tag.toLowerCase().includes("demand") || tag.toLowerCase().includes("popular") ? (
                  <FiZap size={10} />
                ) : (
                  <FiStar size={10} />
                )}{" "}
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="pps-svc-price-col">
        <span className="pps-svc-from">{isQuote ? "Pricing" : "Starting from"}</span>
        <strong className="pps-svc-price">{priceLabel}</strong>
        {duration && <span className="pps-svc-duration">
          <FiClock size={11} /> {duration}
        </span>}
        {!isOwner && !currentUserIsBarber && (
          <button type="button" className="pps-svc-action-btn" onClick={(event) => { event.stopPropagation(); handleAction(); }}>
            {isQuote ? "Quote" : "Select"}
          </button>
        )}
      </div>
    </article>
  );
}

function RatingBar({ label, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="pps-rating-bar-row">
      <span className="pps-rating-bar-label">{label}</span>
      <div className="pps-rating-bar-track">
        <div className="pps-rating-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="pps-rating-bar-pct">{count}</span>
    </div>
  );
}

function ReviewCard({ review, canManage, blockUsage, onToggleBlock }) {
  const rating = Number(review.rating || 0);
  const initials = String(review.name || review.username || "?")
    .split(" ")
    .map((w) => w[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className={`pps-review-card${review.blockedFromPublic ? " pps-review-muted" : ""}`}>
      <div className="pps-review-head">
        <div className="pps-review-avatar">{initials}</div>
        <div className="pps-review-meta">
          <strong>{review.name || review.username || "Customer"}</strong>
          <span className="pps-review-date">
            {review.created_at
              ? new Date(review.created_at).toLocaleDateString("en-UG", {
                  month: "short",
                  year: "numeric",
                })
              : ""}
          </span>
        </div>
        <div className="pps-review-stars">
          {review.blockedFromPublic ? (
            <span className="pps-review-hidden-label">Hidden</span>
          ) : (
            <StarRow rating={rating} size={13} />
          )}
        </div>
      </div>
      {review.text ? (
        <p className="pps-review-body">{review.text}</p>
      ) : null}
      {canManage && (
        <button
          type="button"
          className="pps-review-block-btn"
          onClick={() => onToggleBlock?.(review, !review.blockedFromPublic)}
          disabled={
            !review.blockedFromPublic &&
            blockUsage.used >= blockUsage.limit
          }
        >
          {review.blockedFromPublic
            ? "Restore"
            : blockUsage.used >= blockUsage.limit
            ? "Block limit reached"
            : "Hide from public"}
        </button>
      )}
    </div>
  );
}

/* ── main component ───────────────────────────────────── */

const BIO_LIMIT = 180;

export default function BarberProfileSheet({
  show,
  barber,
  currentUser,
  currentUserIsBarber,
  fallbackImage,
  onClose,
  onToggleFavorite,
  onBook,
  onRequestQuote,
  onOpenChat,
  onReportProvider,
  onToggleReviewBlock,
  reviewBlockUsage,
  reviewNotice,
  onEditStand,
  onOpenDashboard,
  onViewOnMap,
}) {
  const sourceBarber = barber || {};
  const [activeTab, setActiveTab] = useState("overview");
  const [bioExpanded, setBioExpanded] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const closeServiceButtonRef = useRef(null);
  const closeLightboxButtonRef = useRef(null);

  /* ── safe data ── */
  const profileImage = buildAssetUrl(
    sourceBarber.image ||
      sourceBarber.image_url ||
      sourceBarber.cover_image_url ||
      sourceBarber.coverImageUrl ||
      sourceBarber.coverImage ||
      sourceBarber.cover_image ||
      sourceBarber.profileImage ||
      sourceBarber.profile_image ||
      fallbackImage ||
      resolveProviderImage(sourceBarber)
  );

  const safeBarber = {
    id: sourceBarber.id ?? "",
    business_name: sourceBarber.business_name || "Unnamed Business",
    location: sourceBarber.location || "Location unavailable",
    ownerUsername: sourceBarber.ownerUsername || "",
    ownerUserId: sourceBarber.ownerUserId || sourceBarber.owner_user_id || sourceBarber.userId || sourceBarber.user_id || null,
    isOwnedByCurrentUser: sourceBarber.isOwnedByCurrentUser === true || sourceBarber.is_owned_by_current_user === true,
    is_owned_by_current_user: sourceBarber.is_owned_by_current_user === true || sourceBarber.isOwnedByCurrentUser === true,
    availability: sourceBarber.availability || { start: "08:00", end: "20:00" },
    verified: sourceBarber.verified || "Business",
    rating: Number(sourceBarber.rating || 0),
    reviewCount: Number(sourceBarber.reviewCount || 0),
    reviews: Array.isArray(sourceBarber.reviews) ? sourceBarber.reviews : [],
    services: Array.isArray(sourceBarber.services) ? sourceBarber.services : [],
    phone: sourceBarber.phone || "",
    image: profileImage,
    intro_text: sourceBarber.intro_text || sourceBarber.introText || "",
    business_type: sourceBarber.business_type || sourceBarber.businessType || "Services",
    home_service_enabled: Number(
      sourceBarber.home_service_enabled || sourceBarber.homeServiceEnabled || 0
    ),
    portfolio: getProviderPortfolio(sourceBarber),
    stand_type: sourceBarber.stand_type || sourceBarber.standType || "individual",
    team_members: Array.isArray(sourceBarber.team_members || sourceBarber.teamMembers)
      ? sourceBarber.team_members || sourceBarber.teamMembers
      : [],
    isFavorite: !!sourceBarber.isFavorite,
    subscription: sourceBarber.subscription || {},
    completedJobs: Number(
      sourceBarber.completed_bookings || sourceBarber.jobs_completed || sourceBarber.completedJobs || 0
    ),
    responseTime: sourceBarber.avg_response_time || sourceBarber.responseTime || "",
    ontimeRate: Number(sourceBarber.ontime_rate || sourceBarber.ontimeRate || 0),
    payment_methods: sourceBarber.payment_methods || sourceBarber.paymentMethods || [],
    date_joined: sourceBarber.date_joined || sourceBarber.created_at || "",
    accepts_mtn_mobile_money: sourceBarber.accepts_mtn_mobile_money || false,
    social_links: sourceBarber.social_links || sourceBarber.socialLinks || {},
  };
  const verificationState = getVerificationState(sourceBarber);
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "services", label: "Services" },
    { id: "portfolio", label: "Portfolio" },
    { id: "reviews", label: "Reviews" },
    { id: "about", label: "Location" },
  ];

  const planTier = String(
    safeBarber.subscription?.tier || sourceBarber.subscription_tier || ""
  ).toUpperCase();
  const isPlatinum = planTier === "PLATINUM";
  const isPremium = planTier === "PREMIUM";

  const isOpen = (() => {
    const now = new Date();
    const toMinutes = (v) => {
      const [h, m] = String(v || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    const cur = now.getHours() * 60 + now.getMinutes();
    return (
      cur >= toMinutes(safeBarber.availability.start) &&
      cur < toMinutes(safeBarber.availability.end)
    );
  })();

  const isOwnBarberProfile =
    safeBarber.isOwnedByCurrentUser === true ||
    safeBarber.is_owned_by_current_user === true ||
    Boolean(currentUser?.id && safeBarber.ownerUserId && Number(currentUser.id) === Number(safeBarber.ownerUserId)) ||
    Boolean(currentUser?.username && safeBarber.ownerUsername && safeBarber.ownerUsername === currentUser.username);

  const canManageReviewBlocks = isOwnBarberProfile && isPlatinum;
  const blockUsage = {
    used: Number(reviewBlockUsage?.used || 0),
    limit: Number(reviewBlockUsage?.limit || 10),
  };

  const quoteRelevant = safeBarber.services.some(
    (s) =>
      String(s.pricing_type || s.pricingType || "").toLowerCase() === "quote" ||
      formatServicePrice(s) === "Request quote"
  );

  const serviceCategories = groupServiceCategories(safeBarber.services);
  const portfolioLightboxItems = safeBarber.portfolio
    .map((item, index) => ({
      item,
      index,
      src: buildAssetUrl(getPortfolioImage(item)),
      title: item?.title || `Portfolio image ${index + 1}`,
    }))
    .filter((item) => item.src);
  const activeLightbox = lightboxIndex >= 0 ? portfolioLightboxItems[lightboxIndex] : null;
  const selectedServiceIsQuote = selectedService
    ? String(selectedService.pricing_type || selectedService.pricingType || "").toLowerCase() === "quote" ||
      formatServicePrice(selectedService) === "Request quote"
    : false;
  const selectedServiceImages = selectedService
    ? [selectedService.image, selectedService.image_url, selectedService.photo, selectedService.photo_url]
        .map((value) => buildAssetUrl(value || ""))
        .filter(Boolean)
    : [];
  const selectedServiceReviews = selectedService
    ? safeBarber.reviews.filter((review) => {
        const serviceName = String(selectedService.service_name || selectedService.name || "").toLowerCase();
        return serviceName && String(review.service || review.serviceName || review.bookingService || "").toLowerCase() === serviceName;
      })
    : [];

  /* rating distribution (simulated from reviews array if per-star breakdown not available) */
  const ratingDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  safeBarber.reviews.forEach((r) => {
    const s = Math.round(Number(r.rating || 0));
    if (s >= 1 && s <= 5) ratingDist[s]++;
  });

  function handleShare() {
    try {
      const url = `${window.location.origin}`;
      const text = `Check out ${safeBarber.business_name} on Queless: ${url}`;
      if (navigator.share) {
        navigator.share({ title: safeBarber.business_name, text, url });
      } else {
        navigator.clipboard?.writeText(text);
      }
    } catch {
      /* share not supported */
    }
  }

  /* payment label */
  const paymentLabel = [
    "Cash",
    safeBarber.accepts_mtn_mobile_money ? "Mobile Money" : null,
  ]
    .filter(Boolean)
    .join(", ") || "Cash";

  useEffect(() => {
    if (!selectedService && !activeLightbox) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedService(null);
        setLightboxIndex(-1);
      }
      if (activeLightbox && portfolioLightboxItems.length > 1 && event.key === "ArrowLeft") {
        setLightboxIndex((index) => (index <= 0 ? portfolioLightboxItems.length - 1 : index - 1));
      }
      if (activeLightbox && portfolioLightboxItems.length > 1 && event.key === "ArrowRight") {
        setLightboxIndex((index) => (index + 1) % portfolioLightboxItems.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      if (activeLightbox) closeLightboxButtonRef.current?.focus();
      else closeServiceButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeLightbox, portfolioLightboxItems.length, selectedService]);

  /* ── render ── */
  return (
    <>
      {/* backdrop */}
      <button
        type="button"
        className="profile-overlay-v4 open"
        onClick={onClose}
        aria-label="Close provider profile"
      />

      {/* full-screen sheet */}
      <div className="barber-profile-sheet-v4 pps-no-pad open" data-testid="provider-profile-page">
        <div className="barber-profile-card-v4 pps-full-page">

          {/* ══════════════════════════════════════════
              HERO BANNER
          ══════════════════════════════════════════ */}
          <div className="pps-hero">
            {/* cover image */}
            <div className="pps-banner-bg">
              <img
                src={buildAssetUrl(safeBarber.image)}
                alt=""
                aria-hidden="true"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <div className="pps-banner-overlay" />

            {/* nav row floating over banner */}
            <div className="pps-hero-nav">
              <button
                type="button"
                className="pps-circle-btn"
                onClick={onClose}
                aria-label="Go back"
              >
                <FiArrowLeft size={18} />
              </button>
              <div className="pps-hero-actions">
                {!isOwnBarberProfile && (
                  <button
                    type="button"
                    className={`pps-circle-btn${safeBarber.isFavorite ? " pps-fav-active" : ""}`}
                    onClick={() => onToggleFavorite(safeBarber.id)}
                    aria-label={safeBarber.isFavorite ? "Remove from favorites" : "Save to favorites"}
                  >
                    <FiHeart size={17} />
                  </button>
                )}
                <button
                  type="button"
                  className="pps-circle-btn"
                  onClick={handleShare}
                  aria-label="Share profile"
                >
                  <FiShare2 size={17} />
                </button>
                {!isOwnBarberProfile && (
                  <button
                    type="button"
                    className="pps-circle-btn"
                    onClick={() => onReportProvider?.(safeBarber)}
                    aria-label="More options"
                  >
                    <FiMoreHorizontal size={17} />
                  </button>
                )}
              </div>
            </div>

            {/* avatar overlapping hero bottom edge */}
            <div className="pps-hero-avatar-wrap">
              <div className="pps-hero-avatar">
                <img
                  src={buildAssetUrl(safeBarber.image)}
                  alt={safeBarber.business_name}
                  onError={(e) => {
                    e.currentTarget.src = resolveProviderImage(safeBarber);
                  }}
                />
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════
              IDENTITY SECTION
          ══════════════════════════════════════════ */}
          <div className="pps-identity">
            {isOwnBarberProfile && (
              <span className="pps-owner-badge">
                <FiCheckCircle size={12} /> Your stand
              </span>
            )}
            <h1 className="pps-name">{safeBarber.business_name}</h1>
            <p className="pps-category">{safeBarber.business_type}</p>
            <p className="pps-location">
              <FiMapPin size={13} /> {safeBarber.location}
            </p>
            <VerificationBadge barber={barber} size="sm" className="pps-verify" />
          </div>

          {/* ══════════════════════════════════════════
              STATS ROW
          ══════════════════════════════════════════ */}
          <button type="button" className="pps-stats-card pps-stats-card--button" onClick={() => setActiveTab("reviews")}>
            <div className="pps-stat">
              <FiStar className="pps-stat-icon pps-stat-gold" size={15} />
              <strong className="pps-stat-value">
                {safeBarber.rating > 0 ? safeBarber.rating.toFixed(1) : "—"}
              </strong>
              <span className="pps-stat-label">
                ({safeBarber.reviewCount}{" "}
                {safeBarber.reviewCount === 1 ? "review" : "reviews"})
              </span>
            </div>

            {safeBarber.completedJobs > 0 ? (
              <>
                <div className="pps-stat-sep" />
                <div className="pps-stat">
                  <FiBriefcase className="pps-stat-icon" size={15} />
                  <strong className="pps-stat-value">
                    {safeBarber.completedJobs}
                  </strong>
                  <span className="pps-stat-label">Jobs done</span>
                </div>
              </>
            ) : null}

            {/* Only show Response when a real avg response time exists — never a
                fabricated "~1h" fallback (honest trust signals only). */}
            {safeBarber.responseTime ? (
              <>
                <div className="pps-stat-sep" />
                <div className="pps-stat">
                  <FiClock className="pps-stat-icon" size={15} />
                  <strong className="pps-stat-value">
                    {safeBarber.responseTime}
                  </strong>
                  <span className="pps-stat-label">Response</span>
                </div>
              </>
            ) : null}

            {safeBarber.ontimeRate > 0 ? (
              <>
                <div className="pps-stat-sep" />
                <div className="pps-stat">
                  <FiShield className="pps-stat-icon pps-stat-green" size={15} />
                  <strong className="pps-stat-value">
                    {safeBarber.ontimeRate}%
                  </strong>
                  <span className="pps-stat-label">On-time</span>
                </div>
              </>
            ) : null}
          </button>

          {/* ══════════════════════════════════════════
              SPECIALTY CHIPS
          ══════════════════════════════════════════ */}
          {serviceCategories.length > 0 && (
            <div className="pps-spec-chips">
              {serviceCategories.map((cat) => (
                <span key={cat} className="pps-spec-chip">
                  {getCategoryIcon(cat)} {cat}
                </span>
              ))}
              {safeBarber.home_service_enabled === 1 && (
                <span className="pps-spec-chip">
                  <FiMapPin size={13} /> Home service
                </span>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════
              BIO
          ══════════════════════════════════════════ */}
          {safeBarber.intro_text ? (
            <div className="pps-bio">
              <p className="pps-bio-text">
                {bioExpanded || safeBarber.intro_text.length <= BIO_LIMIT
                  ? safeBarber.intro_text
                  : `${safeBarber.intro_text.slice(0, BIO_LIMIT).trim()}…`}
              </p>
              {safeBarber.intro_text.length > BIO_LIMIT && (
                <button
                  type="button"
                  className="pps-show-more"
                  onClick={() => setBioExpanded((v) => !v)}
                >
                  {bioExpanded ? "Show less ↑" : "Show more ↓"}
                </button>
              )}
            </div>
          ) : null}

          {/* ══════════════════════════════════════════
              TAB BAR
          ══════════════════════════════════════════ */}
          <div className="pps-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`pps-tab${activeTab === t.id ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
                {t.id === "services" && safeBarber.services.length > 0 && (
                  <span className="pps-tab-badge">{safeBarber.services.length}</span>
                )}
                {t.id === "reviews" && safeBarber.reviewCount > 0 && (
                  <span className="pps-tab-badge">{safeBarber.reviewCount}</span>
                )}
                {t.id === "portfolio" && safeBarber.portfolio.length > 0 && (
                  <span className="pps-tab-badge">{safeBarber.portfolio.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════
              TAB PANELS
          ══════════════════════════════════════════ */}
          <div className="pps-tab-panel">

            {/* ─── OVERVIEW ──────────────────────────── */}
            {activeTab === "overview" && (
              <div className="pps-panel-overview">

                {/* owner live status */}
                {isOwnBarberProfile ? (
                  <div className="pps-owner-status">
                    <div className="pps-owner-live-row">
                      <span className="pps-live-dot" aria-hidden="true" />
                      <div className="pps-owner-live-copy">
                        <strong>Your stand is live</strong>
                        <p>This is how customers see your business on Queless.</p>
                      </div>
                    </div>
                    <div className="pps-owner-action-grid">
                      <button
                        type="button"
                        className="pps-owner-action-btn"
                        onClick={onEditStand}
                      >
                        <FiEdit2 size={17} />
                        <span>Edit Stand</span>
                      </button>
                      <button
                        type="button"
                        className="pps-owner-action-btn"
                        onClick={onOpenDashboard}
                      >
                        <FiLayout size={17} />
                        <span>Dashboard</span>
                      </button>
                      <button
                        type="button"
                        className="pps-owner-action-btn"
                        onClick={onViewOnMap}
                      >
                        <FiMap size={17} />
                        <span>View on Map</span>
                      </button>
                      <button
                        type="button"
                        className="pps-owner-action-btn"
                        onClick={handleShare}
                      >
                        <FiShare2 size={17} />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* visitor CTAs — Book only for customers, Message for everyone */
                  <div className="pps-cta-section">
                    <div className="pps-cta-row">
                      {!currentUserIsBarber && safeBarber.services.length > 0 && (
                        <button
                          type="button"
                          className="pps-btn-primary"
                          onClick={onBook}
                        >
                          <FiCalendar size={17} /> Book service
                        </button>
                      )}
                      <button
                        type="button"
                        className="pps-btn-secondary"
                        onClick={onOpenChat}
                      >
                        <FiMessageCircle size={17} /> Message
                      </button>
                    </div>
                    {!currentUserIsBarber && quoteRelevant && (
                      <button
                        type="button"
                        className="pps-btn-tertiary"
                        onClick={onRequestQuote || onOpenChat}
                      >
                        <FiTag size={16} /> Request quote
                      </button>
                    )}
                  </div>
                )}

                {/* availability + location + trust + payment info card */}
                <div className="pps-info-card">
                  {/* next slot */}
                  <div className="pps-info-row">
                    <div className="pps-info-icon-wrap">
                      <FiCalendar size={17} />
                    </div>
                    <div className="pps-info-body">
                      <span className="pps-info-label">Next available slot</span>
                      <strong className="pps-info-val">
                        {isOpen ? "Today" : "Tomorrow"} ·{" "}
                        {safeBarber.availability.start} – {safeBarber.availability.end}
                      </strong>
                      <small className="pps-info-sub">Booking lead time: 1–24 hrs</small>
                    </div>
                    {!isOwnBarberProfile && !currentUserIsBarber && (
                      <button
                        type="button"
                        className="pps-info-action-btn"
                        onClick={onBook}
                      >
                        Check availability
                      </button>
                    )}
                    {isOwnBarberProfile && (
                      <button
                        type="button"
                        className="pps-info-action-btn"
                        onClick={onOpenDashboard}
                      >
                        Manage stand
                      </button>
                    )}
                  </div>

                  <div className="pps-info-sep" />

                  {/* service area */}
                  <div className="pps-info-row">
                    <div className="pps-info-icon-wrap">
                      <FiMapPin size={17} />
                    </div>
                    <div className="pps-info-body">
                      <span className="pps-info-label">Service area</span>
                      <strong className="pps-info-val">{safeBarber.location}</strong>
                      <small className="pps-info-sub">
                        {safeBarber.home_service_enabled === 1
                          ? "Provider location & home service available"
                          : "Provider location only"}
                      </small>
                    </div>
                    {!isOwnBarberProfile ? (
                      <button
                        type="button"
                        className="pps-info-action-btn"
                        onClick={onViewOnMap}
                      >
                        View on map
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pps-info-action-btn"
                        onClick={onViewOnMap}
                      >
                        View on map
                      </button>
                    )}
                  </div>

                  <div className="pps-info-sep" />

                  {/* trust */}
                  <div className="pps-info-row pps-info-row--chevron">
                    <div className="pps-info-icon-wrap">
                      <FiShield size={17} />
                    </div>
                    <div className="pps-info-body">
                      <span className="pps-info-label">Trust & Safety</span>
                      <strong className="pps-info-val">{verificationState.label}</strong>
                      <small className="pps-info-sub">{verificationState.detail}</small>
                    </div>
                    <FiChevronRight size={16} className="pps-info-arrow" />
                  </div>

                  <div className="pps-info-sep" />

                  {/* payment */}
                  <div className="pps-info-row pps-info-row--chevron">
                    <div className="pps-info-icon-wrap">
                      <FiCreditCard size={17} />
                    </div>
                    <div className="pps-info-body">
                      <span className="pps-info-label">Payment</span>
                      <strong className="pps-info-val">{paymentLabel}</strong>
                      <small className="pps-info-sub">Pay provider directly for now</small>
                    </div>
                    <FiChevronRight size={16} className="pps-info-arrow" />
                  </div>
                </div>

                {safeBarber.team_members.length > 0 && (
                    <div className="pps-team-card">
                      <div className="pps-section-head-sm">
                        <FiUsers size={14} />
                        <span>Team members</span>
                      </div>
                      <div className="pps-team-chips">
                        {safeBarber.team_members.map((m) => (
                          <span key={m.id || m.name} className="pps-team-chip">
                            {m.name || m}
                          </span>
                        ))}
                      </div>
                    </div>
                )}

                {/* report link */}
                {!isOwnBarberProfile && (
                  <button
                    type="button"
                    className="pps-report-link"
                    onClick={() => onReportProvider?.(safeBarber)}
                  >
                    <FiFlag size={14} /> Report provider
                  </button>
                )}
              </div>
            )}

            {/* ─── SERVICES ──────────────────────────── */}
            {activeTab === "services" && (
              <div className="pps-panel-services">
                <div className="pps-section-head">
                  <h2 className="pps-section-title">Services</h2>
                  {safeBarber.services.length > 0 && (
                    <span className="pps-view-all-label">
                      {safeBarber.services.length} service
                      {safeBarber.services.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {safeBarber.services.length > 0 ? (
                  <div className="pps-svc-list">
                    {safeBarber.services.map((service, idx) => (
                      <ServiceCard
                        key={service.id || service.service_name || idx}
                        service={service}
                        barber={safeBarber}
                        isOwner={isOwnBarberProfile}
                        onBook={onBook}
                        onRequestQuote={onRequestQuote}
                        onOpenChat={onOpenChat}
                        onOpenDetails={setSelectedService}
                        currentUserIsBarber={currentUserIsBarber}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="pps-empty-state">
                    <FiScissors className="pps-empty-icon" size={36} />
                    <strong>No services yet</strong>
                    <p>
                      {isOwnBarberProfile
                        ? "Add services so customers can book you."
                        : "This provider hasn't added services yet."}
                    </p>
                  </div>
                )}

                {/* review notice if any */}
                {reviewNotice?.message ? (
                  <div
                    className={`pps-review-notice ${reviewNotice.tone || "info"}`}
                  >
                    {reviewNotice.message}
                  </div>
                ) : null}
              </div>
            )}

            {/* ─── PORTFOLIO ─────────────────────────── */}
            {activeTab === "portfolio" && (
              <div className="pps-panel-portfolio">
                <div className="pps-section-head">
                  <h2 className="pps-section-title">Portfolio</h2>
                  {safeBarber.portfolio.length > 0 && (
                    <span className="pps-view-all-label">
                      {safeBarber.portfolio.length} item
                      {safeBarber.portfolio.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {safeBarber.portfolio.length > 0 ? (
                  <div className="pps-portfolio-grid">
                    {safeBarber.portfolio.map((item, i) => {
                      const imgSrc = buildAssetUrl(getPortfolioImage(item));
                      const hasVideo = !!(item.video_url || item.videoUrl);
                      return (
                        <button
                          type="button"
                          key={item.id || i}
                          className="pps-portfolio-item pps-portfolio-item--button"
                          onClick={() => setLightboxIndex(portfolioLightboxItems.findIndex((entry) => entry.index === i))}
                        >
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={item.title || "Portfolio"}
                              loading="lazy"
                              decoding="async"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="pps-portfolio-placeholder">
                              <FiImage size={24} />
                            </div>
                          )}
                          {hasVideo && (
                            <div className="pps-portfolio-play">
                              <FiPlay size={16} />
                            </div>
                          )}
                          {item.title && (
                            <div className="pps-portfolio-caption">{item.title}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="pps-empty-state">
                    <FiImage className="pps-empty-icon" size={36} />
                    <strong>No portfolio yet</strong>
                    <p>
                      {isOwnBarberProfile
                        ? "Upload portfolio photos to showcase your work."
                        : "This provider hasn't added portfolio items yet."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ─── REVIEWS ───────────────────────────── */}
            {activeTab === "reviews" && (
              <div className="pps-panel-reviews">
                {/* summary */}
                <div className="pps-review-summary">
                  <div className="pps-rating-big-col">
                    <span className="pps-rating-big">
                      {safeBarber.rating > 0
                        ? safeBarber.rating.toFixed(1)
                        : "—"}
                    </span>
                    <StarRow rating={safeBarber.rating} size={16} />
                    <span className="pps-rating-count">
                      {safeBarber.reviewCount}{" "}
                      {safeBarber.reviewCount === 1 ? "review" : "reviews"}
                    </span>
                  </div>
                  <div className="pps-rating-bars">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <RatingBar
                        key={n}
                        label={`${n}★`}
                        count={ratingDist[n]}
                        total={safeBarber.reviewCount}
                      />
                    ))}
                  </div>
                </div>

                {/* trust chips for high-rated providers */}
                {safeBarber.rating >= 4.5 && safeBarber.reviewCount >= 5 && (
                  <div className="pps-trust-chips">
                    <span className="pps-trust-chip">
                      <FiStar size={12} /> Highly rated
                    </span>
                    <span className="pps-trust-chip">
                      <FiClock size={12} /> Fast response
                    </span>
                    {isPlatinum && (
                      <span className="pps-trust-chip pps-trust-chip--plat">
                        <FiShield size={12} /> Top provider
                      </span>
                    )}
                  </div>
                )}

                {canManageReviewBlocks && (
                  <div className="pps-review-manage-note">
                    <FiShield size={13} /> {blockUsage.used} of {blockUsage.limit}{" "}
                    review blocks used (Platinum)
                  </div>
                )}

                {reviewNotice?.message ? (
                  <div
                    className={`pps-review-notice ${reviewNotice.tone || "info"}`}
                  >
                    {reviewNotice.message}
                  </div>
                ) : null}

                {safeBarber.reviews.length > 0 ? (
                  <div className="pps-review-list">
                    {safeBarber.reviews.map((review) => (
                      <ReviewCard
                        key={review.id}
                        review={review}
                        canManage={canManageReviewBlocks}
                        blockUsage={blockUsage}
                        onToggleBlock={onToggleReviewBlock}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="pps-empty-state">
                    <FiStar className="pps-empty-icon" size={36} />
                    <strong>No reviews yet</strong>
                    <p>Customer reviews will appear here after completed bookings.</p>
                  </div>
                )}
              </div>
            )}

            {/* ─── ABOUT ─────────────────────────────── */}
            {activeTab === "about" && (
              <div className="pps-panel-about">
                {safeBarber.intro_text ? (
                  <div className="pps-about-card">
                    <h3 className="pps-about-card-title">About</h3>
                    <p className="pps-about-bio">{safeBarber.intro_text}</p>
                  </div>
                ) : null}

                <div className="pps-about-card">
                  <h3 className="pps-about-card-title">Business info</h3>
                  <div className="pps-about-rows">
                    <div className="pps-about-row">
                      <FiTag size={15} className="pps-about-row-icon" />
                      <div>
                        <span className="pps-about-row-label">Category</span>
                        <span className="pps-about-row-val">
                          {safeBarber.business_type}
                        </span>
                      </div>
                    </div>
                    <div className="pps-about-row">
                      <FiMapPin size={15} className="pps-about-row-icon" />
                      <div>
                        <span className="pps-about-row-label">Location</span>
                        <span className="pps-about-row-val">
                          {safeBarber.location}
                        </span>
                      </div>
                    </div>
                    <div className="pps-about-row">
                      <FiClock size={15} className="pps-about-row-icon" />
                      <div>
                        <span className="pps-about-row-label">Working hours</span>
                        <span className="pps-about-row-val">
                          {safeBarber.availability.start} –{" "}
                          {safeBarber.availability.end}
                          <span
                            className={`pps-open-tag ${isOpen ? "open" : "closed"}`}
                          >
                            {isOpen ? "Open now" : "Closed"}
                          </span>
                        </span>
                      </div>
                    </div>
                    {safeBarber.phone ? (
                      <div className="pps-about-row">
                        <FiPhone size={15} className="pps-about-row-icon" />
                        <div>
                          <span className="pps-about-row-label">Phone</span>
                          <span className="pps-about-row-val">
                            {safeBarber.phone}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="pps-about-row">
                      <FiCreditCard size={15} className="pps-about-row-icon" />
                      <div>
                        <span className="pps-about-row-label">Accepted payments</span>
                        <span className="pps-about-row-val">{paymentLabel}</span>
                      </div>
                    </div>
                    {safeBarber.date_joined ? (
                      <div className="pps-about-row">
                        <FiCalendar size={15} className="pps-about-row-icon" />
                        <div>
                          <span className="pps-about-row-label">Member since</span>
                          <span className="pps-about-row-val">
                            {new Date(safeBarber.date_joined).toLocaleDateString(
                              "en-UG",
                              { month: "long", year: "numeric" }
                            )}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="pps-about-row">
                      <FiZap size={15} className="pps-about-row-icon" />
                      <div>
                        <span className="pps-about-row-label">Service type</span>
                        <span className="pps-about-row-val">
                          {safeBarber.home_service_enabled === 1
                            ? "In-person & home service"
                            : "In-person only"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* social links if any */}
                {Object.keys(safeBarber.social_links).length > 0 && (
                  <div className="pps-about-card">
                    <h3 className="pps-about-card-title">Social</h3>
                    <div className="pps-about-rows">
                      {Object.entries(safeBarber.social_links).map(
                        ([platform, url]) =>
                          url ? (
                            <div key={platform} className="pps-about-row">
                              <FiGlobe size={15} className="pps-about-row-icon" />
                              <div>
                                <span className="pps-about-row-label">
                                  {platform.charAt(0).toUpperCase() +
                                    platform.slice(1)}
                                </span>
                                <span className="pps-about-row-val pps-social-link">
                                  {url}
                                </span>
                              </div>
                            </div>
                          ) : null
                      )}
                    </div>
                  </div>
                )}

                {/* trust & safety full card */}
                <div className="pps-trust-full-card">
                  <div className="pps-trust-full-head">
                    <FiShield size={18} />
                    <strong>Trust & Safety</strong>
                  </div>
                  <p className="pps-trust-full-body">{verificationState.body}</p>
                  {!isOwnBarberProfile && (
                    <button
                      type="button"
                      className="pps-report-link pps-report-link--inline"
                      onClick={() => onReportProvider?.(safeBarber)}
                    >
                      <FiFlag size={13} /> Report provider
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
          {/* end .pps-tab-panel */}

        </div>
      </div>

      {selectedService ? (
        <div className="pps-dialog-shell" role="presentation" onClick={() => setSelectedService(null)}>
          <section className="pps-service-detail" role="dialog" aria-modal="true" aria-labelledby="pps-service-detail-title" onClick={(event) => event.stopPropagation()}>
            <button ref={closeServiceButtonRef} type="button" className="pps-dialog-close" onClick={() => setSelectedService(null)} aria-label="Close service details">
              <FiX />
            </button>
            {selectedServiceImages[0] ? <img className="pps-service-detail-image" src={selectedServiceImages[0]} alt="" /> : null}
            <div className="pps-service-detail-body">
              <span className="pps-service-detail-provider">{safeBarber.business_name}</span>
              <h2 id="pps-service-detail-title">{selectedService.service_name || selectedService.name || "Service"}</h2>
              {selectedService.description ? <p>{selectedService.description}</p> : null}
              <div className="pps-service-detail-facts">
                <span><strong>{formatServicePrice(selectedService)}</strong><small>Price</small></span>
                {fmtDuration(selectedService.duration_minutes) ? <span><strong>{fmtDuration(selectedService.duration_minutes)}</strong><small>Duration</small></span> : null}
                <span><strong>{safeBarber.rating ? safeBarber.rating.toFixed(1) : "New"}</strong><small>{safeBarber.reviewCount} reviews</small></span>
                <span><strong>{isOpen ? "Open today" : "Next opening"}</strong><small>{safeBarber.availability.start} - {safeBarber.availability.end}</small></span>
              </div>
              {selectedServiceReviews.length ? (
                <div className="pps-service-detail-reviews">
                  <strong>Reviews for this service</strong>
                  {selectedServiceReviews.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} canManage={false} blockUsage={blockUsage} />)}
                </div>
              ) : safeBarber.reviews.length ? (
                <div className="pps-service-detail-reviews">
                  <strong>Provider reviews</strong>
                  {safeBarber.reviews.slice(0, 2).map((review) => <ReviewCard key={review.id} review={review} canManage={false} blockUsage={blockUsage} />)}
                </div>
              ) : (
                <div className="pps-service-detail-empty">
                  <strong>No reviews yet</strong>
                  <span>Customer reviews will appear here after completed bookings.</span>
                </div>
              )}
              {isOwnBarberProfile ? (
                <button type="button" className="pps-btn-primary pps-service-book-btn" onClick={onEditStand}>
                  <FiEdit2 /> Manage stand
                </button>
              ) : selectedServiceIsQuote ? (
                <button type="button" className="pps-btn-primary pps-service-book-btn" onClick={() => { setSelectedService(null); onRequestQuote?.(selectedService); }}>
                  <FiTag /> Request quote
                </button>
              ) : !currentUserIsBarber ? (
                <button type="button" className="pps-btn-primary pps-service-book-btn" onClick={() => { setSelectedService(null); onBook?.(selectedService); }}>
                  <FiCalendar /> Book appointment
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeLightbox ? (
        <div className="pps-lightbox" role="dialog" aria-modal="true" aria-label="Portfolio image viewer" onClick={() => setLightboxIndex(-1)}>
          <button ref={closeLightboxButtonRef} type="button" className="pps-lightbox-close" onClick={() => setLightboxIndex(-1)} aria-label="Close image viewer"><FiX /></button>
          <button type="button" className="pps-lightbox-nav prev" onClick={(event) => { event.stopPropagation(); setLightboxIndex((index) => (index <= 0 ? portfolioLightboxItems.length - 1 : index - 1)); }} aria-label="Previous image"><FiChevronLeft /></button>
          <img src={activeLightbox.src} alt={activeLightbox.title} decoding="async" onClick={(event) => event.stopPropagation()} />
          <button type="button" className="pps-lightbox-nav next" onClick={(event) => { event.stopPropagation(); setLightboxIndex((index) => (index + 1) % portfolioLightboxItems.length); }} aria-label="Next image"><FiChevronRight /></button>
          <div className="pps-lightbox-count">{lightboxIndex + 1} / {portfolioLightboxItems.length}</div>
        </div>
      ) : null}
    </>
  );
}
