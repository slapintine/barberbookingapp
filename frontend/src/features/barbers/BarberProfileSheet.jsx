import {
  FiArrowLeft,
  FiClock,
  FiCreditCard,
  FiHeart,
  FiHome,
  FiMapPin,
  FiMessageCircle,
  FiPhone,
  FiFlag,
  FiScissors,
  FiShield,
  FiStar,
  FiUsers,
  FiImage,
} from "react-icons/fi";

function getBadgeLabel(value) {
  if (!value) return "New";
  return String(value).toLowerCase() === "new barber" ? "New" : value;
}

function formatServicePrice(service = {}) {
  const money = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? `UGX ${amount.toLocaleString("en-UG")}` : "";
  };
  const type = String(service.pricing_type || service.pricingType || "fixed").toLowerCase();
  if (type === "quote") return "Request quote";
  if (type === "range") {
    const min = money(service.min_price ?? service.minPrice);
    const max = money(service.max_price ?? service.maxPrice);
    return min && max ? `${min} - ${max}` : "Request quote";
  }
  if (type === "starting_from") return money(service.starting_price ?? service.startingPrice) ? `From ${money(service.starting_price ?? service.startingPrice)}` : "Request quote";
  return money(service.price_extra ?? service.price ?? service.extra) || "Request quote";
}

function getLocationLabel(service = {}, provider = {}) {
  const type = String(service.location_type || service.locationType || "").toLowerCase();
  if (type === "customer_location") return "Home service";
  if (Number(provider.home_service_enabled || provider.homeServiceEnabled || 0) === 1) return "Provider or home";
  return "Provider location";
}

function groupServices(services = []) {
  return services.reduce((groups, service) => {
    const category = service.category || service.service_category || "Services";
    if (!groups[category]) groups[category] = [];
    groups[category].push(service);
    return groups;
  }, {});
}

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
}) {
  if (!barber || !show) return null;

  const safeBarber = {
    id: barber.id ?? "",
    business_name: barber.business_name || "Unnamed Business",
    location: barber.location || "Location unavailable",
    ownerUsername: barber.ownerUsername || "",
    availability: barber.availability || { start: "08:00", end: "20:00" },
    verified: barber.verified || "Business",
    rating: barber.rating || 0,
    reviewCount: Number(barber.reviewCount || 0),
    reviews: Array.isArray(barber.reviews) ? barber.reviews : [],
    services: Array.isArray(barber.services) ? barber.services : [],
    phone: barber.phone || "No phone added yet.",
    image: barber.image || fallbackImage,
    intro_text: barber.intro_text || barber.introText || "",
    business_type: barber.business_type || barber.businessType || "Services",
    home_service_enabled: Number(barber.home_service_enabled || barber.homeServiceEnabled || 0),
    portfolio: Array.isArray(barber.portfolio) ? barber.portfolio : [],
    stand_type: barber.stand_type || barber.standType || "individual",
    team_members: Array.isArray(barber.team_members || barber.teamMembers)
      ? (barber.team_members || barber.teamMembers)
      : [],
    isFavorite: !!barber.isFavorite,
    subscription: barber.subscription || {},
  };
  const planTier = String(safeBarber.subscription?.tier || barber.subscription_tier || "").toUpperCase();
  const isPlatinum = planTier === "PLATINUM";
  const isPremium = planTier === "PREMIUM";
  const verificationStatus = String(
    barber.verification_status ||
      barber.verificationStatus ||
      barber.business_status ||
      barber.subscription_status ||
      ""
  ).toLowerCase();
  const verificationPending = verificationStatus.includes("pending") || verificationStatus.includes("review");
  const isOpen = (() => {
    const now = new Date();
    const toMinutes = (value) => {
      const [h, m] = String(value || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    const current = now.getHours() * 60 + now.getMinutes();
    return current >= toMinutes(safeBarber.availability.start) && current < toMinutes(safeBarber.availability.end);
  })();
  const shortDescription = safeBarber.intro_text.length > 150
    ? `${safeBarber.intro_text.slice(0, 150).trim()}... Read more`
    : safeBarber.intro_text;
  const serviceGroups = groupServices(safeBarber.services);
  const quoteRelevant = safeBarber.services.some((service) =>
    String(service.pricing_type || service.pricingType || "").toLowerCase() === "quote" ||
    formatServicePrice(service) === "Request quote"
  );

  const isOwnBarberProfile =
    currentUser?.username && safeBarber.ownerUsername === currentUser.username;
  const canManageReviewBlocks = isOwnBarberProfile && isPlatinum;
  const blockUsage = {
    used: Number(reviewBlockUsage?.used || 0),
    limit: Number(reviewBlockUsage?.limit || 10),
  };

  return (
    <>
      <div className="profile-overlay-v4 open" onClick={onClose} />
      <div className="barber-profile-sheet-v4 open">
        <div className="barber-profile-card-v4" onClick={(e) => e.stopPropagation()}>
          <div className="barber-profile-topbar-v4">
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiArrowLeft />
            </button>
            <div className="profile-top-title-v4">Provider Profile</div>
            <button
              type="button"
              className={safeBarber.isFavorite ? "fav-btn-v4 small active" : "fav-btn-v4 small"}
              onClick={() => onToggleFavorite(safeBarber.id)}
            >
              <FiHeart />
            </button>
          </div>

          <div className="barber-profile-main-v4 barber-profile-main-redesign">
            <div className="provider-hero-card-v6">
              <div className="provider-hero-image-v6">
                <img
                  src={safeBarber.image}
                  alt={safeBarber.business_name}
                  onError={(e) => {
                    e.currentTarget.src = fallbackImage;
                  }}
                />
              </div>
              <div className="provider-hero-copy-v6">
                <div className="provider-category-v6">{safeBarber.business_type}</div>
                <h2 className="barber-profile-title-v4">{safeBarber.business_name}</h2>
                <div className="provider-meta-grid-v6">
                  <span><FiMapPin /> {safeBarber.distance || safeBarber.location}</span>
                  <span><FiStar /> {safeBarber.reviewCount ? `${safeBarber.rating} (${safeBarber.reviewCount})` : "No reviews yet"}</span>
                  <span className={isOpen ? "provider-open-v6" : "provider-closed-v6"}><FiClock /> {isOpen ? "Open now" : "Closed"} - {safeBarber.availability.start} - {safeBarber.availability.end}</span>
                  <span><FiCreditCard /> Cash accepted{safeBarber.accepts_mtn_mobile_money ? " - MTN MoMo" : ""}</span>
                </div>
              </div>
            </div>

            <div className="provider-badge-row-v6">
              {isPlatinum ? (
                <>
                  <div className="barber-profile-pill-v4 success platinum-pill-v15">
                    <FiShield /> Verified
                  </div>
                  <div className="barber-profile-pill-v4 gold-pill-v4">
                    <FiStar /> Top Provider
                  </div>
                  <div className="barber-profile-pill-v4 platinum-pill-v15">
                    Platinum
                  </div>
                </>
              ) : null}
              {isPremium ? (
                <div className="barber-profile-pill-v4 gold-pill-v4">
                  <FiStar /> Recommended
                </div>
              ) : null}
              {!isPlatinum ? (
                <div className="barber-profile-pill-v4 success">
                  <FiShield /> {verificationPending ? "Verification pending" : getBadgeLabel(safeBarber.verified)}
                </div>
              ) : null}
              <div className="barber-profile-pill-v4">
                <FiHome /> {safeBarber.home_service_enabled === 1 ? "Home service" : "In-person"}
              </div>
            </div>

            {safeBarber.intro_text ? (
              <div className="profile-section-v4 profile-compact-section-v6">
                <div className="profile-sub-v4">{shortDescription}</div>
              </div>
            ) : null}

            {safeBarber.home_service_enabled === 1 ? (
              <div className="profile-section-v4">
                <div className="profile-section-title-v4">Customer location available</div>
                <div className="profile-sub-v4">This provider can travel to the customer when the service allows it.</div>
              </div>
            ) : null}

            {safeBarber.stand_type === "shop" ? (
              <div className="profile-section-v4">
                <div className="profile-section-title-v4">
                  <FiUsers /> Staff / service agents
                </div>
                <div className="chips-v4">
                  {safeBarber.team_members.length ? (
                    safeBarber.team_members.map((member) => (
                      <span key={member.id || member.name} className="chip-v4">
                        {member.name || member}
                      </span>
                    ))
                  ) : (
                    <span className="chip-v4">Team not added yet</span>
                  )}
                </div>
              </div>
            ) : null}

            <div className="profile-section-v4">
              <div className="profile-section-title-v4">
                <FiScissors /> Services
              </div>
              {safeBarber.services.length ? (
                <div className="provider-service-groups-v6">
                  {Object.entries(serviceGroups).map(([category, services]) => (
                    <div key={category} className="provider-service-group-v6">
                      {Object.keys(serviceGroups).length > 1 ? <div className="provider-service-category-v6">{category}</div> : null}
                      <div className="provider-service-list-v6">
                        {services.map((service) => (
                          <article key={service.id || service.service_name} className="provider-service-card-v6">
                            <div>
                              <strong>{service.service_name || service.name || "Service"}</strong>
                              {service.description ? <p>{service.description}</p> : null}
                              <small>
                                {formatServicePrice(service)} - {service.duration_minutes || 30} mins
                              </small>
                              <em>Available: {getLocationLabel(service, safeBarber)}</em>
                            </div>
                            <button type="button" onClick={onBook}>Select</button>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="provider-empty-v6">
                  This provider has not added services yet.
                </div>
              )}
            </div>

            {!safeBarber.services.length ? null : (
              <div className="profile-section-v4 profile-compact-section-v6">
                <div className="profile-section-title-v4">
                  <FiCreditCard /> Payment
                </div>
                <div className="profile-sub-v4">Cash is available for bookings. Mobile money appears only when enabled and verified.</div>
              </div>
            )}

            <div className="profile-section-v4">
              <div className="profile-section-title-v4">
                <FiStar /> Reviews
              </div>
              <div className="profile-sub-v4">
                {safeBarber.reviewCount
                  ? `${safeBarber.rating} / 5 from ${safeBarber.reviewCount} review${safeBarber.reviewCount === 1 ? "" : "s"}`
                  : "No reviews yet."}
              </div>
              {canManageReviewBlocks ? (
                <div className="profile-sub-v4">
                  {blockUsage.used} of {blockUsage.limit} review blocks used. Hidden reviews stay visible to admins.
                </div>
              ) : null}
              {safeBarber.reviews.length > 0 ? (
                <div className="profile-review-list-v4 space-top">
                  {safeBarber.reviews.slice(0, 2).map((review) => (
                    <div key={review.id} className={review.blockedFromPublic ? "profile-review-card-v4 muted" : "profile-review-card-v4"}>
                      <div className="profile-review-head-v4">
                        <strong>{review.name || review.username || "Customer"}</strong>
                        <span className="profile-review-rating-v4">{review.blockedFromPublic ? "Hidden from public" : `${Number(review.rating || 0).toFixed(1)} stars`}</span>
                      </div>
                      <div className="profile-review-text-v4">{review.text || "No written comment."}</div>
                      {canManageReviewBlocks ? (
                        <button
                          type="button"
                          className="secondary-btn-v4 compact-btn-v4 space-top"
                          onClick={() => onToggleReviewBlock?.(review, !review.blockedFromPublic)}
                          disabled={!review.blockedFromPublic && blockUsage.used >= blockUsage.limit}
                        >
                          {review.blockedFromPublic ? "Restore public review" : blockUsage.used >= blockUsage.limit ? "Block limit reached" : "Hide from public stand"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="profile-section-v4 profile-compact-section-v6">
              <div className="profile-section-title-v4">
                <FiShield /> Trust and safety
              </div>
              <div className="profile-sub-v4">
                Check the service price, location, opening hours, rating, and reviews before booking. Do not share mobile money PINs or verification codes. Report no-shows, fake listings, unsafe conduct, or payment pressure.
              </div>
              {!isOwnBarberProfile ? (
                <button type="button" className="secondary-btn-v4 compact-btn-v4 space-top" onClick={() => onReportProvider?.(safeBarber)}>
                  <FiFlag /> Report Provider
                </button>
              ) : null}
            </div>

            <div className="profile-section-v4">
              <div className="profile-section-title-v4">
                <FiPhone /> Contact
              </div>
              <div className="profile-sub-v4">{safeBarber.phone}</div>
            </div>

            <div className="quick-contact-row-v4 profile-inline-actions-v6">
              {!isOwnBarberProfile && !currentUserIsBarber && safeBarber.services.length > 0 && (
                <button className="primary-btn-v4 compact-btn-v4" onClick={onBook}>
                  Book Service
                </button>
              )}
              {!isOwnBarberProfile && !currentUserIsBarber && quoteRelevant && (
                <button className="secondary-btn-v4 compact-btn-v4" onClick={onRequestQuote || onOpenChat}>
                  Request Quote
                </button>
              )}
              {!isOwnBarberProfile && (
                <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenChat}>
                  Message
                </button>
              )}
            </div>

            {safeBarber.portfolio.length > 0 ? (
              <div className="profile-section-v4">
                <div className="profile-section-title-v4">
                  <FiImage /> Portfolio
                </div>
                <div className="profile-review-list-v4 space-top">
                  {safeBarber.portfolio.slice(0, 3).map((item) => (
                    <div key={item.id || item.title} className="profile-review-card-v4">
                      <div className="profile-review-head-v4">
                        <strong>{item.title || item.service || "Transformation"}</strong>
                        <span className="profile-review-rating-v4">{item.service || safeBarber.business_type}</span>
                      </div>
                      {(item.afterImage || item.beforeImage || item.image) ? (
                        <div className="portfolio-preview-grid-v9">
                          {[item.afterImage, item.beforeImage, item.image].filter(Boolean).slice(0, 2).map((image) => (
                            <div key={image} className="portfolio-preview-v9">
                              <img src={image} alt={item.title || "Portfolio image"} />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="profile-review-text-v4">{item.note || "Portfolio item."}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!isOwnBarberProfile ? (
              <div className="provider-sticky-actions-v6">
                {!currentUserIsBarber && safeBarber.services.length > 0 ? (
                  <button type="button" className="provider-sticky-primary-v6" onClick={onBook}>
                    <FiScissors /> Book Service
                  </button>
                ) : null}
                <button type="button" className="provider-sticky-secondary-v6" onClick={onOpenChat}>
                  <FiMessageCircle /> Message
                </button>
                {!currentUserIsBarber && quoteRelevant ? (
                  <button type="button" className="provider-sticky-secondary-v6" onClick={onRequestQuote || onOpenChat}>
                    Request Quote
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
