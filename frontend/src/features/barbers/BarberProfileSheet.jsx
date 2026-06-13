import { useState } from "react";
import {
  FiArrowLeft,
  FiCalendar,
  FiCamera,
  FiCheckCircle,
  FiChevronRight,
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
  FiZap,
  FiSliders,
  FiBookOpen,
  FiGlobe,
  FiPackage,
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
  return FiPackage;
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

function getPopularityTags(service = {}, index = 0, totalRating = 0, reviewCount = 0) {
  // use explicit tag if set on the service
  if (service.tag_label || service.badge || service.popularity_tag) {
    return [service.tag_label || service.badge || service.popularity_tag];
  }
  const tags = [];
  if (index === 0 && reviewCount >= 10 && totalRating >= 4.5) tags.push("High demand", "Popular");
  else if (index === 1 && totalRating >= 4.5) tags.push("Top rated");
  else if (Number(service.duration_minutes || 30) <= 20) tags.push("Quick service");
  else tags.push("Usually available");
  return tags;
}

function fmtDuration(mins) {
  const m = Number(mins || 30);
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

function ServiceCard({ service, barber, isOwner, onBook, onRequestQuote, onOpenChat, currentUserIsBarber }) {
  const isQuote =
    String(service.pricing_type || service.pricingType || "").toLowerCase() ===
      "quote" || formatServicePrice(service) === "Request quote";
  const SvcIcon = getServiceIcon(service, barber.business_type);
  const priceLabel = formatServicePrice(service);
  const duration = fmtDuration(service.duration_minutes);
  const tags = getPopularityTags(service, 0, barber.rating, barber.reviewCount);
  const imgSrc = service.image || service.image_url || null;

  function handleAction() {
    if (isOwner) return;
    if (isQuote) {
      onRequestQuote?.(service) || onOpenChat?.();
    } else {
      onBook?.(service);
    }
  }

  return (
    <article className="pps-svc-card">
      <div className="pps-svc-img-wrap">
        {imgSrc ? (
          <img src={imgSrc} alt={service.service_name || "Service"} loading="lazy" />
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
        <span className="pps-svc-from">Starting from</span>
        <strong className="pps-svc-price">{priceLabel}</strong>
        <span className="pps-svc-duration">
          <FiClock size={11} /> {duration}
        </span>
        {!isOwner && !currentUserIsBarber && (
          <button type="button" className="pps-svc-action-btn" onClick={handleAction}>
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

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
  { id: "reviews", label: "Reviews" },
  { id: "about", label: "About" },
];

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
  const [activeTab, setActiveTab] = useState("overview");
  const [bioExpanded, setBioExpanded] = useState(false);

  if (!barber || !show) return null;

  /* ── safe data ── */
  const safeBarber = {
    id: barber.id ?? "",
    business_name: barber.business_name || "Unnamed Business",
    location: barber.location || "Location unavailable",
    ownerUsername: barber.ownerUsername || "",
    availability: barber.availability || { start: "08:00", end: "20:00" },
    verified: barber.verified || "Business",
    rating: Number(barber.rating || 0),
    reviewCount: Number(barber.reviewCount || 0),
    reviews: Array.isArray(barber.reviews) ? barber.reviews : [],
    services: Array.isArray(barber.services) ? barber.services : [],
    phone: barber.phone || "",
    image: barber.image || fallbackImage || resolveProviderImage(barber),
    intro_text: barber.intro_text || barber.introText || "",
    business_type: barber.business_type || barber.businessType || "Services",
    home_service_enabled: Number(
      barber.home_service_enabled || barber.homeServiceEnabled || 0
    ),
    portfolio: Array.isArray(barber.portfolio) ? barber.portfolio : [],
    stand_type: barber.stand_type || barber.standType || "individual",
    team_members: Array.isArray(barber.team_members || barber.teamMembers)
      ? barber.team_members || barber.teamMembers
      : [],
    isFavorite: !!barber.isFavorite,
    subscription: barber.subscription || {},
    completedJobs: Number(
      barber.completed_bookings || barber.jobs_completed || barber.completedJobs || 0
    ),
    responseTime: barber.avg_response_time || barber.responseTime || "",
    ontimeRate: Number(barber.ontime_rate || barber.ontimeRate || 0),
    payment_methods: barber.payment_methods || barber.paymentMethods || [],
    date_joined: barber.date_joined || barber.created_at || "",
    accepts_mtn_mobile_money: barber.accepts_mtn_mobile_money || false,
    social_links: barber.social_links || barber.socialLinks || {},
  };

  const planTier = String(
    safeBarber.subscription?.tier || barber.subscription_tier || ""
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
    currentUser?.username &&
    safeBarber.ownerUsername === currentUser.username;

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
    safeBarber.payment_methods?.includes("card") ? "Card" : null,
  ]
    .filter(Boolean)
    .join(", ") || "Cash";

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
                src={safeBarber.image}
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
                <button
                  type="button"
                  className={`pps-circle-btn${safeBarber.isFavorite ? " pps-fav-active" : ""}`}
                  onClick={() => onToggleFavorite(safeBarber.id)}
                  aria-label={safeBarber.isFavorite ? "Remove from favorites" : "Save to favorites"}
                >
                  <FiHeart size={17} />
                </button>
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
                  src={safeBarber.image}
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
                <FiCheckCircle size={12} /> Owner view
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
          <div className="pps-stats-card">
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

            <div className="pps-stat-sep" />

            {safeBarber.completedJobs > 0 ? (
              <>
                <div className="pps-stat">
                  <FiPackage className="pps-stat-icon" size={15} />
                  <strong className="pps-stat-value">
                    {safeBarber.completedJobs}
                  </strong>
                  <span className="pps-stat-label">Jobs done</span>
                </div>
                <div className="pps-stat-sep" />
              </>
            ) : null}

            <div className="pps-stat">
              <FiClock className="pps-stat-icon" size={15} />
              <strong className="pps-stat-value">
                {safeBarber.responseTime || "~1h"}
              </strong>
              <span className="pps-stat-label">Response</span>
            </div>

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
          </div>

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
            {TABS.map((t) => (
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
                    {!isOwnBarberProfile && (
                      <button
                        type="button"
                        className="pps-info-action-btn"
                        onClick={onBook}
                      >
                        Check availability
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
                      <strong className="pps-info-val">
                        ID verified · Background checked
                      </strong>
                      <small className="pps-info-sub">
                        Committed to Queless's community standards
                      </small>
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
                      <small className="pps-info-sub">Pay securely through Queless</small>
                    </div>
                    <FiChevronRight size={16} className="pps-info-arrow" />
                  </div>
                </div>

                {/* team members if shop */}
                {safeBarber.stand_type === "shop" &&
                  safeBarber.team_members.length > 0 && (
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
                      const imgSrc =
                        item.afterImage || item.image || item.beforeImage || null;
                      const hasVideo = !!item.video_url;
                      return (
                        <div key={item.id || i} className="pps-portfolio-item">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={item.title || "Portfolio"}
                              loading="lazy"
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
                        </div>
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
                    <p>Be the first to leave a review after booking.</p>
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
                  <p className="pps-trust-full-body">
                    ID verified, background checked, and committed to Queless
                    community standards. Check the price, hours, and reviews before
                    booking. Never share PINs or verification codes.
                  </p>
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
    </>
  );
}
