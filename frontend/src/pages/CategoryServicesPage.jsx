import { FiArrowLeft, FiMap, FiSearch, FiStar } from "react-icons/fi";
import fallbackStandIcon from "../assets/queless-logo-icon.png";
import { buildCategoryServices } from "../utils/marketplaceServices.js";

export default function CategoryServicesPage({
  category,
  providers,
  onBack,
  onOpenProvider,
  onOpenMap,
}) {
  const services = buildCategoryServices(providers, category);

  return (
    <div className="content-v4 standard-page-v4 queless-utility-page queless-services-page">
      <div className="queless-view-toolbar">
        <button type="button" onClick={onBack} aria-label="Back">
          <FiArrowLeft />
        </button>
        <div>
          <h1>{category || "Services"}</h1>
          <p>{services.length ? `${services.length} services available` : "Browse providers in this category"}</p>
        </div>
      </div>

      <button type="button" className="queless-map-button" onClick={() => onOpenMap?.(category)}>
        <FiMap /> View Map
      </button>

      {services.length ? (
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
      ) : (
        <div className="queless-empty-state">
          <FiSearch />
          <strong>No providers found in this category yet.</strong>
        </div>
      )}
    </div>
  );
}
