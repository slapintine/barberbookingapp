import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowRight,
  FiBriefcase,
  FiCheckCircle,
  FiMap,
  FiMapPin,
  FiSearch,
  FiShield,
  FiStar,
  FiZap,
} from "react-icons/fi";
import { resolveProviderImage, getProviderInitials, buildInitialsAvatar } from "../utils/providerImage.js";
import { getCategoryDef } from "../utils/categoryRegistry.jsx";
import heroProfessional from "../assets/queless-hero-service-professional.png";

// Homepage category chips — registry-driven so icons/colors stay in sync with the rest of the app
const HOME_CHIP_IDS = [
  { id: "barber",                  category: "Barber" },
  { id: "beauty",                  category: "Beauty" },
  { id: "education-tutoring",      category: "Tutor / Lessons" },
  { id: "health-fitness",          category: "Health & Fitness" },
  { id: "catering-food-services",  category: "Catering & Food Services" },
  { id: "repairs-maintenance",     category: "Repairs & Maintenance" },
  { id: "cleaning-services",       category: "Cleaning Services" },
  { id: "health-fitness",          category: "Health & Fitness", labelOverride: "Fitness" },
  { id: "business-services",       category: "Business Services", labelOverride: "Professional" },
];

const CATEGORY_CHIPS = HOME_CHIP_IDS.map(({ id, category, labelOverride }) => {
  const def = getCategoryDef(id);
  return {
    label: labelOverride || def.shortLabel,
    icon: def.Icon,
    category,
    colors: [def.primaryColor, def.softBg],
  };
});

const TRUST_BADGES = [
  {
    title: "Verified Professionals",
    text: "Trust signals help you choose providers when you are new to an area.",
    icon: FiShield,
  },
  {
    title: "Secure Booking",
    text: "Your bookings and payments stay safe.",
    icon: FiCheckCircle,
  },
  {
    title: "Fast Response",
    text: "Get quick replies and service updates.",
    icon: FiZap,
  },
  {
    title: "Trusted Providers",
    text: "Top-rated by real customers like you.",
    icon: FiStar,
  },
];

function SectionHeader({ title, onViewAll, actionLabel = "View all" }) {
  return (
    <div className="customer-home-section-head">
      <h2>{title}</h2>
      {onViewAll ? (
        <button type="button" onClick={onViewAll}>
          {actionLabel}
          <FiArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function getFirstService(item = {}) {
  if (Array.isArray(item.services) && item.services.length) return item.services[0] || {};
  return item.service && typeof item.service === "object" ? item.service : {};
}

function getPopularItemTitle(item = {}) {
  const service = getFirstService(item);
  return (
    item.business_name ||
    item.businessName ||
    item.provider_name ||
    item.providerName ||
    item.title ||
    item.name ||
    item.service_name ||
    service.service_name ||
    service.name ||
    service.title ||
    ""
  );
}

function getPopularItemCategory(item = {}) {
  const service = getFirstService(item);
  return (
    item.category ||
    item.category_name ||
    item.business_type ||
    item.businessType ||
    item.serviceType ||
    service.category ||
    service.category_name ||
    service.serviceType ||
    ""
  );
}

function getPopularItemImage(item = {}) {
  const service = getFirstService(item);
  return (
    item.coverImage ||
    item.cover_image ||
    item.image ||
    item.logo ||
    item.profilePhoto ||
    item.profile_photo ||
    item.photo ||
    item.image_url ||
    service.image ||
    service.image_url ||
    service.photo ||
    resolveProviderImage(item, service)
  );
}

function getPopularItemPrice(item = {}) {
  const service = getFirstService(item);
  return item.price || item.priceLabel || item.price_label || service.priceLabel || service.price_label || service.price || "";
}

function getPopularItemRating(item = {}) {
  const rating = item.rating ?? item.averageRating ?? item.average_rating ?? item.reviewRating;
  const numericRating = Number(rating);
  if (Number.isFinite(numericRating) && numericRating > 0) return numericRating.toFixed(1);
  return typeof rating === "string" && rating.trim() ? rating.trim() : "";
}

function getPopularItemLocation(item = {}, fallbackLocation = "") {
  const location = item.location || item.address || item.town || item.area || item.city || item.business_location;
  return String(location || fallbackLocation || "Location unavailable").split(",")[0];
}

function getReviewCount(item = {}) {
  const count = item.reviewCount ?? item.review_count ?? item.reviewsCount ?? item.totalReviews;
  const numericCount = Number(count);
  return Number.isFinite(numericCount) && numericCount > 0 ? numericCount : "";
}

function isVerifiedProvider(item = {}) {
  return Boolean(item.verified || item.isVerified || item.is_verified || item.verified_badge);
}

function hasRealProviderMarker(item = {}) {
  return Boolean(
    item.ownerUsername ||
      item.owner_user_id ||
      item.ownerUserId ||
      item.username ||
      item.created_at ||
      item.createdAt
  );
}

export default function HomeScreen({
  query,
  setQuery,
  setSelectedCategory,
  requestLocation,
  locationLabel = "Gayaza Town, Wakiso",
  locationLoading = false,
  onOpenCategory,
  onOpenMap,
  onSearchSubmit,
  onOpenSmartMatch,
  smartMatchPremiumActive = false,
  smartMatchUpsellVisible = false,
  openBarber,
  onBecomeProvider,
  popularServices = [],
  topBarbers = [],
  filteredBarbers = [],
}) {
  const carouselRef = useRef(null);
  const frameRef = useRef(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const serviceQuery = String(query || "");
  const shortLocation = locationLoading
    ? "Detecting location..."
    : String(locationLabel || "Gayaza Town, Wakiso").split(",")[0] || "Gayaza Town";

  const popularItems = useMemo(() => {
    const explicitPopularItems = Array.isArray(popularServices) ? popularServices.filter(Boolean) : [];
    const realTopBarbers = Array.isArray(topBarbers) ? topBarbers.filter(hasRealProviderMarker) : [];
    const realFilteredBarbers = Array.isArray(filteredBarbers) ? filteredBarbers.filter(hasRealProviderMarker) : [];
    const source = explicitPopularItems.length ? explicitPopularItems : realTopBarbers.length ? realTopBarbers : realFilteredBarbers;

    return source
      .slice(0, 8)
      .map((item, index) => {
        const title = getPopularItemTitle(item);
        const category = getPopularItemCategory(item);
        const rating = getPopularItemRating(item);
        const reviews = getReviewCount(item);
        return {
          id: item.id || item.service_id || item.business_id || `${title || category}-${index}`,
          title,
          category,
          rating,
          reviews,
          price: getPopularItemPrice(item),
          image: getPopularItemImage(item),
          location: getPopularItemLocation(item, shortLocation),
          verified: isVerifiedProvider(item),
          query: title || category,
          provider: hasRealProviderMarker(item) ? item : null,
        };
      })
      .filter((item) => item.title || item.category);
  }, [filteredBarbers, popularServices, shortLocation, topBarbers]);

  const updateActiveSlide = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const slides = Array.from(carousel.querySelectorAll(".customer-home-provider-card"));
    if (!slides.length) return;

    const carouselRect = carousel.getBoundingClientRect();
    const viewportCenter = carouselRect.left + carouselRect.width / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const slideRect = slide.getBoundingClientRect();
      const slideCenter = slideRect.left + slideRect.width / 2;
      const distance = Math.abs(viewportCenter - slideCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveSlide((current) => (current === closestIndex ? current : closestIndex));
  }, []);

  const scheduleActiveSlideUpdate = useCallback(() => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(updateActiveSlide);
  }, [updateActiveSlide]);

  useEffect(() => {
    scheduleActiveSlideUpdate();
    window.addEventListener("resize", scheduleActiveSlideUpdate);

    return () => {
      window.removeEventListener("resize", scheduleActiveSlideUpdate);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [popularItems.length, scheduleActiveSlideUpdate]);

  const submitSearch = () => {
    const cleanQuery = serviceQuery.trim() || "General service";
    setQuery?.(cleanQuery);
    onSearchSubmit?.(cleanQuery, locationLabel);
  };

  const chooseCategory = (category, label) => {
    setSelectedCategory?.(category);
    setQuery?.(label);
    onOpenCategory?.(category);
  };

  const scrollToProvider = (index) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const slide = carousel.querySelectorAll(".customer-home-provider-card")[index];
    slide?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveSlide(index);
  };

  return (
    <main className="content-v4 customer-home" aria-label="Queless customer home">
      <section className="customer-home-hero">
        <div className="customer-home-hero-copy">
          <span className="customer-home-eyebrow">Trusted local services</span>
          <h1>Find trusted services near you</h1>
          <p>New around here? Discover nearby providers, compare trust signals, and book services without guessing where to go.</p>
          <button type="button" className="customer-home-primary-btn" onClick={submitSearch}>
            Find Services
            <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="customer-home-hero-media">
          <img
            src={heroProfessional}
            alt="Professional service provider ready for work"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </div>
      </section>

      <section className="customer-home-search" aria-label="Search services">
        <label className="customer-home-search-field">
          <FiSearch aria-hidden="true" />
          <input
            value={serviceQuery}
            onChange={(event) => setQuery?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="What service or area do you need?"
            autoComplete="off"
          />
        </label>
        <button type="button" className="customer-home-location-pill" onClick={requestLocation} disabled={locationLoading}>
          <FiMapPin aria-hidden="true" />
          <span>{shortLocation}</span>
        </button>
        <button type="button" className="customer-home-search-btn" onClick={submitSearch} aria-label="Search">
          <FiSearch aria-hidden="true" />
          <span>Search</span>
        </button>
        <button type="button" className="customer-home-search-btn smart" onClick={() => onOpenSmartMatch?.({ category: serviceQuery })}>
          <FiZap aria-hidden="true" />
          <span>Smart Match</span>
        </button>
      </section>

      <section className="customer-home-section customer-home-category-section">
        <SectionHeader title="Browse by Category" onViewAll={() => onOpenCategory?.("All")} />
        <div className="customer-home-category-row" aria-label="Popular categories">
          {CATEGORY_CHIPS.map(({ label, icon: Icon, category, colors }) => (
            <button
              type="button"
              className="customer-home-category-card"
              key={label}
              onClick={() => chooseCategory(category, label)}
              style={{ "--category-start": colors[0], "--category-end": colors[1] }}
            >
              <span className="customer-home-icon-bubble">
                <Icon aria-hidden="true" />
              </span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="customer-home-section customer-home-providers-section">
        <SectionHeader
          title="Top Providers"
          onViewAll={() => {
            setSelectedCategory?.("All");
            onOpenCategory?.("All");
          }}
          actionLabel="See all"
        />
        {popularItems.length ? (
          <>
            <div
              className="customer-home-provider-carousel"
              aria-label="Top providers near you"
              ref={carouselRef}
              onScroll={scheduleActiveSlideUpdate}
            >
              {popularItems.map(({ id, title, category, rating, reviews, price, image, location, verified, query: slideQuery, provider }, index) => (
                <button
                  type="button"
                  className={`customer-home-provider-card${index === activeSlide ? " is-active" : ""}`}
                  key={id}
                  onClick={() => {
                    if (provider && openBarber) {
                      openBarber(provider);
                      return;
                    }
                    onSearchSubmit?.(slideQuery || title, locationLabel);
                  }}
                >
                  <span className="customer-home-provider-media">
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.src = buildInitialsAvatar(
                          provider?.business_name || title || getProviderInitials(provider || {})
                        );
                      }}
                    />
                    {rating ? (
                      <span className="customer-home-rating-pill">
                        <FiStar aria-hidden="true" />
                        {rating}
                      </span>
                    ) : null}
                    {verified ? <FiCheckCircle className="customer-home-verified-icon" aria-label="Verified provider" /> : null}
                  </span>

                  <span className="customer-home-provider-body">
                    <strong>{title || category}</strong>
                    {category ? <small>{category}</small> : null}
                    <span className="customer-home-provider-meta">
                      {reviews ? <span>{reviews} reviews</span> : price ? <span>{price}</span> : null}
                      <span>
                        <FiMapPin aria-hidden="true" />
                        {location}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {popularItems.length > 1 ? (
              <div className="customer-home-provider-dots" aria-label="Top provider carousel controls">
                {popularItems.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={index === activeSlide ? "is-active" : ""}
                    onClick={() => scrollToProvider(index)}
                    aria-label={`Show provider ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="customer-home-empty-state">
            <span className="customer-home-empty-icon"><FiSearch /></span>
            <strong>No providers match this filter yet.</strong>
            <p>Try a different category, clear the filter, or view all nearby providers on the map.</p>
            <div className="customer-home-empty-actions">
              <button type="button" onClick={requestLocation}><FiMapPin /> Change location</button>
              <button type="button" onClick={() => onOpenMap?.("All")}><FiMap /> View all services</button>
            </div>
          </div>
        )}
      </section>

      <section className="customer-home-section customer-home-map-section">
        <SectionHeader title="Explore nearby" onViewAll={() => onOpenMap?.("All")} />
        <button type="button" className="customer-home-map-preview" onClick={() => onOpenMap?.("All")}>
          <span>
            <FiMap aria-hidden="true" />
          </span>
          <div>
            <strong>View Map</strong>
            <small>New around here? See trusted providers around your current or selected area.</small>
          </div>
          <FiArrowRight aria-hidden="true" />
        </button>
      </section>

      {smartMatchUpsellVisible ? (
        <section className="customer-home-section">
          <button type="button" className="customer-home-premium-card" onClick={() => onOpenSmartMatch?.({ category: serviceQuery })}>
            <span className="customer-home-premium-icon">
              <FiZap aria-hidden="true" />
            </span>
            <span>
              <strong>Smart Match with Premium</strong>
              <small>Location, budget, rating and availability matching for unfamiliar places.</small>
            </span>
            <FiArrowRight aria-hidden="true" />
          </button>
        </section>
      ) : null}

      <section className="customer-home-section">
        <SectionHeader title="Why book with Queless" />
        <div className="customer-home-trust-grid" aria-label="Why book with Queless">
          {TRUST_BADGES.map(({ title, text, icon: Icon }) => (
            <article className="customer-home-card customer-home-trust-card" key={title}>
              <span className="customer-home-icon-bubble">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="customer-home-premium-cta">
        <div>
          <small>For Local Professionals</small>
          <h2>Join Queless</h2>
          <p>List your services, reach more customers, and grow your business.</p>
          <button type="button" onClick={onBecomeProvider}>
            Join Queless
            <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <span aria-hidden="true">
          <FiBriefcase />
        </span>
      </section>
    </main>
  );
}
