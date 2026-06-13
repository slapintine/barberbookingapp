import { useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiClock,
  FiMap,
  FiMapPin,
  FiSearch,
  FiSliders,
  FiStar,
  FiZap,
} from "react-icons/fi";
import { buildInitialsAvatar } from "../utils/providerImage.js";
import { getCategoryDef } from "../utils/categoryRegistry.jsx";
import VerificationBadge from "../components/ui/VerificationBadge.jsx";
import { buildCategoryServices } from "../utils/marketplaceServices.js";

const FILTERS = ["All", "Barber", "Beauty", "Salon", "Spa", "Cleaning Services", "Home Services", "Repairs & Maintenance", "Tutor / Lessons"];

// Maps filter label → registry category id for icon lookup
const FILTER_CATEGORY_ID = {
  Barber: "barber",
  Beauty: "beauty",
  Salon: "salon",
  Spa: "spa",
  "Cleaning Services": "cleaning-services",
  "Home Services": "home-services",
  "Repairs & Maintenance": "repairs-maintenance",
  "Tutor / Lessons": "education-tutoring",
};
const SORT_OPTIONS = ["Top rated", "Nearest", "Price", "Available today"];
const CATEGORY_FILTER_TERMS = {
  Barber: ["barber", "grooming", "haircut", "beard", "shave"],
  Beauty: ["beauty", "makeup", "nails", "lashes", "skin care"],
  Salon: ["salon", "hair", "braids", "styling"],
  Spa: ["spa", "massage", "wellness", "facial"],
  "Cleaning Services": ["clean", "cleaning", "cleaner", "laundry", "fumigation", "sofa", "carpet", "office cleaning"],
  "Home Services": ["home", "plumbing", "plumber", "electric", "electrical", "gardening", "moving", "home help"],
  "Repairs & Maintenance": ["repair", "maintenance", "carpentry", "carpenter", "appliance", "phone repair", "furniture", "painting"],
  "Tutor / Lessons": ["tutor", "tutoring", "lesson", "lessons", "teacher", "mathematics", "math", "english", "science", "homework", "exam", "academic"],
};

const QUERY_GROUPS = {
  barber: ["barber", "barbers", "barber shop", "haircut", "men's grooming", "grooming", "salon", "hair"],
  clean: ["clean", "cleaning", "cleaner", "house cleaning", "deep cleaning", "office cleaning", "sofa cleaning", "carpet cleaning", "laundry"],
  plumb: ["plumb", "plumber", "plumbing", "pipe", "leakage", "bathroom plumbing", "emergency plumber"],
  electric: ["electric", "electrical", "electrician", "wiring", "power"],
  carpent: ["carpentry", "carpenter", "wood", "furniture", "furniture repair"],
  paint: ["painting", "paint", "painter"],
  repair: ["repair", "maintenance", "appliance", "phone repair", "electronics"],
  beauty: ["beauty", "makeup", "spa", "massage", "hair braiding", "salon"],
  tutor: ["tutor", "tutoring", "private tutor", "lessons", "teacher", "mathematics tutor", "homework support"],
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProviderCategory(provider = {}, service = {}) {
  return service?.category || provider.category_name || provider.business_type || provider.category || "Services";
}

function getProviderImage(provider = {}, service = {}) {
  const portfolioImage = (Array.isArray(provider.portfolio) ? provider.portfolio : [])
    .flatMap((item) => [item?.afterImage, item?.beforeImage, item?.image].filter(Boolean))
    .find(Boolean);
  const galleryImage = (Array.isArray(provider.gallery) ? provider.gallery : []).find(Boolean);
  return service?.image || service?.image_url || service?.photo || portfolioImage || galleryImage || provider.image || "";
}

function providerIsVerified(provider = {}) {
  return ["verified", "certified", "top rated", "top-rated"].includes(
    String(provider.verified || provider.verified_status || "").toLowerCase()
  );
}

function priceNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function distanceNumber(value) {
  const match = String(value || "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function expandedQueryTerms(query) {
  const clean = normalize(query);
  if (!clean) return [];
  const terms = new Set([clean, ...clean.split(" ").filter(Boolean)]);
  Object.entries(QUERY_GROUPS).forEach(([key, values]) => {
    if (clean.includes(key) || values.some((term) => clean.includes(normalize(term)))) {
      values.forEach((term) => terms.add(normalize(term)));
    }
  });
  return [...terms].filter(Boolean);
}

function serviceMatchesQuery(item, query) {
  const terms = expandedQueryTerms(query);
  if (!terms.length) return true;
  const provider = item.provider || {};
  const service = item.service || {};
  const haystack = normalize(
    [
      item.title,
      item.category,
      item.providerName,
      service.service_name,
      service.name,
      service.title,
      service.category,
      service.description,
      Array.isArray(service.tags) ? service.tags.join(" ") : "",
      provider.business_name,
      provider.name,
      provider.business_type,
      provider.category,
      provider.category_name,
      provider.location,
      Array.isArray(provider.tags) ? provider.tags.join(" ") : "",
    ].join(" ")
  );
  return terms.some((term) => haystack.includes(term));
}

function categoryMatches(item, category) {
  if (!category || category === "All") return true;
  const cleanCategory = normalize(category);
  const haystack = normalize(
    [
      item.title,
      item.category,
      item.service?.service_name,
      item.service?.name,
      item.service?.title,
      item.service?.category,
      item.service?.description,
      item.provider?.business_name,
      item.provider?.business_type,
      item.provider?.category_name,
    ].join(" ")
  );
  const terms = [cleanCategory, ...(CATEGORY_FILTER_TERMS[category] || []).map(normalize)].filter(Boolean);
  return terms.some((term) => haystack.includes(term));
}

function makeInitials(name) {
  return String(name || "K")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function SearchResultsPage({ query = "", location = "", providers = [], onBack, onOpenProvider, onOpenCategory, onOpenMap, onOpenSmartMatch, smartMatchPremiumActive = false, smartMatchUpsellVisible = false }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState("Top rated");
  const cleanQuery = String(query || "").trim();
  const cleanLocation = String(location || "").trim();

  const allServices = useMemo(() => buildCategoryServices(providers, "All"), [providers]);

  const matchingServices = useMemo(() => {
    const filtered = allServices
      .filter((item) => serviceMatchesQuery(item, cleanQuery))
      .filter((item) => categoryMatches(item, activeCategory));
    return filtered.toSorted((a, b) => {
      if (sortBy === "Price") return priceNumber(a.price) - priceNumber(b.price);
      if (sortBy === "Nearest") return distanceNumber(a.provider?.distance || a.provider?.location) - distanceNumber(b.provider?.distance || b.provider?.location);
      if (sortBy === "Available today") {
        const aAvailable = a.service?.is_available !== false && a.service?.isAvailable !== false;
        const bAvailable = b.service?.is_available !== false && b.service?.isAvailable !== false;
        return Number(bAvailable) - Number(aAvailable);
      }
      return Number(b.provider?.rating || 0) - Number(a.provider?.rating || 0);
    });
  }, [activeCategory, allServices, cleanQuery, sortBy]);

  const heading = cleanLocation && cleanQuery ? `${cleanQuery} near ${cleanLocation}` : cleanQuery ? `Results for ${cleanQuery}` : "Search results";
  const relatedCategories = FILTERS.filter((item) => item !== "All").slice(0, 4);

  return (
    <div className="content-v4 app-page-v4 queless-utility-page queless-results-page">
      <div className="queless-view-toolbar">
        <button type="button" onClick={onBack} aria-label="Back">
          <FiArrowLeft />
        </button>
        <div>
          <h1>{heading}</h1>
          <p>{matchingServices.length ? `${matchingServices.length} matching services available for this area` : "New here? Try related categories or open the map to explore nearby providers."}</p>
        </div>
      </div>

      <div className="queless-results-summary">
        <span><FiSearch /> {cleanQuery || "Any service"}</span>
        {cleanLocation ? <span><FiMapPin /> {cleanLocation}</span> : null}
      </div>

      <button type="button" className="queless-map-button" onClick={() => onOpenMap?.(activeCategory === "All" ? cleanQuery || "All" : activeCategory)}>
        <FiMap /> View Map
      </button>
      {matchingServices.length && (smartMatchPremiumActive || smartMatchUpsellVisible) ? (
        <button type="button" className="queless-smart-card-v18 compact" onClick={() => onOpenSmartMatch?.({ category: activeCategory === "All" ? cleanQuery : activeCategory, location: cleanLocation })}>
          <span><FiZap /></span>
          <div>
            <strong>{smartMatchPremiumActive ? "Smart Match these results" : "Try Smart Match with Premium"}</strong>
            <small>Get matched by location, budget, rating and availability when you do not know who to choose.</small>
          </div>
        </button>
      ) : null}

      <div className="queless-filter-chips" aria-label="Category filters">
        {FILTERS.map((category) => {
          const catId = FILTER_CATEGORY_ID[category];
          const def = catId ? getCategoryDef(catId) : null;
          const Icon = def?.Icon;
          const active = activeCategory === category;
          return (
            <button
              type="button"
              key={category}
              className={active ? "active" : ""}
              style={def ? { "--chip-color": def.primaryColor, "--chip-bg": def.softBg } : undefined}
              onClick={() => setActiveCategory(category)}
            >
              {Icon && <Icon size={12} aria-hidden="true" />}
              {category === "All" ? "All" : category.replace(" Services", "")}
            </button>
          );
        })}
      </div>

      <label className="queless-sort-select">
        <FiSliders />
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          {SORT_OPTIONS.map((option) => (
            <option value={option} key={option}>{option}</option>
          ))}
        </select>
      </label>

      {matchingServices.length ? (
        <div className="queless-results-list">
          {matchingServices.map((item) => {
            const provider = item.provider || {};
            const image = getProviderImage(provider, item.service);
            const providerName = item.providerName || provider.business_name || "Queless Provider";
            const rating = Number(provider.rating || 0) ? Number(provider.rating).toFixed(1) : "New";
            return (
              <article className="queless-result-card" key={item.id}>
                {image ? (
                  <img
                    src={image}
                    alt={providerName}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.src = buildInitialsAvatar(providerName);
                    }}
                  />
                ) : (
                  <span className="queless-result-avatar">{makeInitials(providerName)}</span>
                )}
                <div className="queless-result-body">
                  <div className="queless-result-title">
                    <strong>{providerName}</strong>
                    <VerificationBadge barber={provider} size="xs" />
                  </div>
                  <small>{item.title}</small>
                  <em>{getProviderCategory(provider, item.service)}</em>
                  <div className="queless-result-meta">
                    <span><FiStar /> {rating}</span>
                    <span><FiMapPin /> {provider.distance || provider.location || cleanLocation || "Nearby"}</span>
                    <span><FiClock /> Available today</span>
                  </div>
                  <b>{item.price}</b>
                  <div className="queless-result-actions">
                    <button type="button" onClick={() => onOpenProvider?.(provider)}>
                      Book Now
                    </button>
                    <button type="button" onClick={() => onOpenProvider?.(provider)}>
                      View Details
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="queless-category-empty-v18 queless-results-empty-v18">
          <span className="queless-empty-icon-v18">
            <FiSearch />
          </span>
          <strong>No results found.</strong>
          <p>Try different keywords, a nearby town, or browse all categories on the map.</p>
          <div className="queless-empty-actions-v18">
            <button type="button" className="primary" onClick={() => onOpenCategory?.("All")}>
              <FiSearch /> Browse Categories
            </button>
            <button type="button" onClick={() => onOpenMap?.(activeCategory === "All" ? cleanQuery || "All" : activeCategory)}>
              <FiMap /> View Map
            </button>
          </div>
          {smartMatchPremiumActive || smartMatchUpsellVisible ? (
            <button type="button" className={smartMatchPremiumActive ? "queless-smart-card-v18 compact" : "queless-smart-card-v18"} onClick={() => onOpenSmartMatch?.({ category: cleanQuery || activeCategory, location: cleanLocation })}>
              <span><FiZap /></span>
              <div>
                <strong>{smartMatchPremiumActive ? "Smart Match these results" : "Try Smart Match with Premium"}</strong>
                <small>Get matched by location, budget, rating and availability when you are unfamiliar with the area.</small>
              </div>
            </button>
          ) : null}
          <div className="queless-empty-suggestions">
            {relatedCategories.map((category) => (
              <button type="button" key={category} onClick={() => onOpenCategory?.(category)}>
                {category.replace(" Services", "")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
