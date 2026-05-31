import { FiArrowLeft, FiCompass, FiMap, FiSearch, FiStar, FiZap } from "react-icons/fi";
import fallbackStandIcon from "../assets/queless-logo-icon.png";
import { buildCategoryServices } from "../utils/marketplaceServices.js";

export default function CategoryServicesPage({
  category,
  providers,
  onBack,
  onOpenProvider,
  onOpenMap,
  onOpenSmartMatch,
  onSearchSubmit,
  smartMatchPremiumActive = false,
}) {
  const services = buildCategoryServices(providers, category);
  const smartMatchLabel = smartMatchPremiumActive ? "Find My Best Match" : "Try Smart Match with Premium";

  return (
    <div className="content-v4 app-page-v4 queless-utility-page queless-services-page">
      <div className="queless-view-toolbar">
        <button type="button" onClick={onBack} aria-label="Back">
          <FiArrowLeft />
        </button>
        <div>
          <h1>{category || "Services"}</h1>
          <p>{services.length ? `${services.length} services available` : "Browse providers in this category"}</p>
        </div>
      </div>

      <div className="queless-category-actions-v18" aria-label="Category actions">
        <button type="button" className="queless-action-btn-v18 primary" onClick={() => onOpenMap?.(category)}>
          <FiMap /> View Map
        </button>
        <button type="button" className="queless-action-btn-v18 secondary" onClick={() => onSearchSubmit?.(category || "Services", "")}>
          <FiSearch /> Search Manually
        </button>
      </div>

      {services.length ? (
        <>
          <button type="button" className="queless-smart-card-v18 compact" onClick={() => onOpenSmartMatch?.({ category })}>
            <span><FiZap /></span>
            <div>
              <strong>{smartMatchPremiumActive ? "Smart Match this category" : smartMatchLabel}</strong>
              <small>Get matched by location, budget, rating and availability.</small>
            </div>
          </button>

          <div className="queless-services-grid">
            {services.map((item) => (
              <article className="queless-service-list-card" key={item.id}>
                <img
                  src={item.image}
                  alt={item.title}
                  onError={(event) => {
                    event.currentTarget.src = fallbackStandIcon;
                  }}
                />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.providerName}</small>
                  <span><FiStar /> {item.rating}</span>
                  <em>{item.price}</em>
                </div>
                <button type="button" onClick={() => onOpenProvider?.(item.provider)}>
                  View
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="queless-category-empty-v18">
          <span className="queless-empty-icon-v18">
            <FiCompass />
          </span>
          <strong>No providers available yet</strong>
          <p>Try another category, adjust your search, or check the map for nearby providers.</p>
          <div className="queless-empty-actions-v18">
            <button type="button" className="primary" onClick={() => onSearchSubmit?.(category || "Services", "")}>
              <FiSearch /> Search Manually
            </button>
            <button type="button" onClick={() => onOpenMap?.(category)}>
              <FiMap /> View Map
            </button>
          </div>
          <button type="button" className="queless-smart-card-v18" onClick={() => onOpenSmartMatch?.({ category })}>
            <span><FiZap /></span>
            <div>
              <strong>{smartMatchPremiumActive ? "Smart Match this category" : smartMatchLabel}</strong>
              <small>Get matched by location, budget, rating and availability.</small>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
