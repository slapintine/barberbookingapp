import {
  FiArrowLeft,
  FiClock,
  FiHeart,
  FiMapPin,
  FiPhone,
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

  const isOwnBarberProfile =
    currentUser?.username && safeBarber.ownerUsername === currentUser.username;

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

          <div className="barber-profile-hero-v4">
            <img
              src={safeBarber.image}
              alt={safeBarber.business_name}
              onError={(e) => {
                e.currentTarget.src = fallbackImage;
              }}
            />
          </div>

          <div className="barber-profile-main-v4">
            <div className="barber-profile-title-v4">{safeBarber.business_name}</div>
            <div className="barber-profile-location-v4">
              <FiMapPin /> {safeBarber.location}
            </div>

            <div className="barber-profile-stats-v4">
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
                  <FiShield /> {getBadgeLabel(safeBarber.verified)}
                </div>
              ) : null}
              <div className="barber-profile-pill-v4">
                {String(safeBarber.business_type || "Services")}
              </div>
              <div className="barber-profile-pill-v4">
                <FiClock /> {safeBarber.availability.start} - {safeBarber.availability.end}
              </div>
              <div className="barber-profile-pill-v4 gold-pill-v4">
                <FiStar /> {safeBarber.rating} / 5
              </div>
            </div>

            {safeBarber.intro_text ? (
              <div className="profile-section-v4">
                <div className="profile-sub-v4">{safeBarber.intro_text}</div>
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
                <FiScissors /> Service listings
              </div>
              <div className="chips-v4">
                {safeBarber.services.length ? (
                  safeBarber.services.map((service) => (
                    <span key={service.id || service.service_name || service} className="chip-v4">
                      {typeof service === "string" ? service : service.service_name}
                    </span>
                  ))
                ) : (
                  <span className="chip-v4">General service</span>
                )}
              </div>
            </div>

            <div className="profile-section-v4">
              <div className="profile-section-title-v4">
                <FiPhone /> Contact
              </div>
              <div className="profile-sub-v4">{safeBarber.phone}</div>
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

            <div className="profile-section-v4">
              <div className="profile-section-title-v4">
                <FiStar /> Reviews
              </div>
              <div className="profile-sub-v4">
                {safeBarber.reviewCount
                  ? `${safeBarber.rating} / 5 from ${safeBarber.reviewCount} review${safeBarber.reviewCount === 1 ? "" : "s"}`
                  : "No reviews yet."}
              </div>
              {safeBarber.reviews.length > 0 ? (
                <div className="profile-review-list-v4 space-top">
                  {safeBarber.reviews.slice(0, 3).map((review) => (
                    <div key={review.id} className="profile-review-card-v4">
                      <div className="profile-review-head-v4">
                        <strong>{review.name || review.username || "Customer"}</strong>
                        <span className="profile-review-rating-v4">{Number(review.rating || 0).toFixed(1)} stars</span>
                      </div>
                      <div className="profile-review-text-v4">{review.text || "No written comment."}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="quick-contact-row-v4">
              {!isOwnBarberProfile && !currentUserIsBarber && (
                <button className="secondary-btn-v4 compact-btn-v4" onClick={onBook}>
                  Book now
                </button>
              )}
              {!isOwnBarberProfile && !currentUserIsBarber && (
                <button className="secondary-btn-v4 compact-btn-v4" onClick={onRequestQuote || onOpenChat}>
                  Request quote
                </button>
              )}
              {!isOwnBarberProfile && (
                <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenChat}>
                  Message
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
