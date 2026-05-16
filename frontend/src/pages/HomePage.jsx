import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowRight,
  FiBriefcase,
  FiCheckCircle,
  FiDroplet,
  FiHome,
  FiMap,
  FiMapPin,
  FiSearch,
  FiShield,
  FiStar,
  FiTool,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import fallbackStandIcon from "../assets/queless-logo-icon.png";
import heroProfessional from "../assets/queless-hero-service-pro.png";

const CATEGORY_CHIPS = [
  { label: "Cleaning", icon: FiDroplet, category: "Cleaning Services" },
  { label: "Plumbing", icon: FiTool, category: "Home Services" },
  { label: "Electrical", icon: FiZap, category: "Home Services" },
  { label: "Carpentry", icon: FiHome, category: "Repairs & Maintenance" },
  { label: "Beauty", icon: FiUsers, category: "Beauty & Grooming" },
  { label: "Home", icon: FiHome, category: "Home Services" },
];

const TRUST_BADGES = [
  {
    title: "Verified Professionals",
    text: "Skilled and background-checked providers.",
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
    fallbackStandIcon
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

function getPopularItemLocation(item = {}, fallbackLocation = "Gayaza Town") {
  const location = item.location || item.address || item.town || item.area || item.city || item.business_location;
  return String(location || fallbackLocation || "Gayaza Town").split(",")[0];
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
      item.createdAt ||
      item.id ||
      item.business_id
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
          <p>Book home services, salons, spas, repairs and more.</p>
          <button type="button" className="customer-home-primary-btn" onClick={submitSearch}>
            Book a Service
            <FiArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="customer-home-hero-media">
          <img
            src={heroProfessional}
            alt="Professional service provider ready for work"
            onError={(event) => {
              event.currentTarget.src = fallbackStandIcon;
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
            placeholder="What service do you need?"
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
      </section>

      <section className="customer-home-section customer-home-category-section">
        <SectionHeader title="Browse by Category" onViewAll={() => onOpenCategory?.("All")} />
        <div className="customer-home-category-row" aria-label="Popular categories">
          {CATEGORY_CHIPS.map(({ label, icon: Icon, category }) => (
            <button type="button" className="customer-home-category-card" key={label} onClick={() => chooseCategory(category, label)}>
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
                      onError={(event) => {
                        event.currentTarget.src = fallbackStandIcon;
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
          <div className="customer-home-empty-state">No services found near you yet. Try another category or location.</div>
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
            <small>Find trusted providers near you</small>
          </div>
          <FiArrowRight aria-hidden="true" />
        </button>
      </section>

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

      <section className="customer-home-pro-cta">
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
