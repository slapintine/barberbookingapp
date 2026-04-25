import { useEffect } from "react";
import { FiHeart, FiMapPin, FiNavigation, FiSearch } from "react-icons/fi";
import { FaRegStar, FaStar, FaStarHalfAlt } from "react-icons/fa";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import logo from "../assets/logo.png";

const FILTERS = ["All", "Top Rated", "Nearby", "Affordable"];
const DEFAULT_CENTER = [0.3136, 32.5811];

const barberPin = new L.DivIcon({
  className: "custom-pin-wrap",
  html: `<div class="custom-pin"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString()}`;
}

function getBadgeLabel(value) {
  if (!value) return "New";
  return String(value).toLowerCase() === "new barber" ? "New" : value;
}

function renderStars(value) {
  const stars = [];
  for (let i = 1; i <= 5; i += 1) {
    if (value >= i) stars.push(<FaStar key={i} />);
    else if (value >= i - 0.5) stars.push(<FaStarHalfAlt key={i} />);
    else stars.push(<FaRegStar key={i} />);
  }
  return stars;
}

function FlyToMarker({ barber }) {
  const map = useMap();
  useEffect(() => {
    if (barber?.latitude && barber?.longitude) {
      map.flyTo([Number(barber.latitude), Number(barber.longitude)], 14, { duration: 0.9 });
    }
  }, [barber, map]);
  return null;
}

export default function HomeScreen({
  query,
  setQuery,
  selectedFilter,
  setSelectedFilter,
  filteredBarbers,
  topBarbers,
  selectedBarber,
  openBarber,
  toggleFavorite,
  requestLocation,
  barbersLoading,
  userLocation,
}) {
  const topIds = new Set(topBarbers.map((barber) => Number(barber.id)));
  const remainingBarbers = filteredBarbers.filter((barber) => !topIds.has(Number(barber.id)));

  const renderCardMeta = (barber) => (
    <>
      <div className="barber-card-title-row-v4">
        <div className="barber-card-name-wrap-v4 barber-card-name-flat-v4">
          <div className="barber-name-v4 barber-name-compact-v4">{barber.business_name}</div>
          <div className="barber-card-meta-row-v4">
            <div className="top-badge-v4">{getBadgeLabel(barber.verified)}</div>
            {barber.subscription?.features?.topBarberBadge ? <div className="top-badge-v4">Top barber</div> : null}
            {barber.subscription?.features?.homepageFeatured ? <div className="top-badge-v4">Featured</div> : null}
            <div className="price-chip-v4">From {formatMoney(barber.price_from)}</div>
          </div>
        </div>
      </div>

      <div className="barber-location-v4">
        <FiMapPin /> {barber.location}
      </div>

      <div className="top-meta-v4 list-meta-v4">
        <span className="stars-inline-v4">{renderStars(barber.rating)}</span>
        <span className="rating-value-v4">
          {barber.reviewCount ? `${barber.rating} (${barber.reviewCount})` : "No ratings yet"}
        </span>
        <span>{barber.distance}</span>
      </div>
    </>
  );

  return (
    <div className="content-v4 standard-page-v4">
      <div className="search-panel-v4 floating-search-v4">
        <div className="search-box-v4">
          <FiSearch className="search-icon-v4" />
          <input
            className="search-input-v4"
            placeholder="Search barber or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filters-v4">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={selectedFilter === item ? "filter-btn active" : "filter-btn"}
              onClick={() => setSelectedFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="map-panel-v4">
        <MapContainer center={DEFAULT_CENTER} zoom={13} className="leaflet-map-v4" scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filteredBarbers.map((barber) => (
            <Marker
              key={barber.id}
              position={[Number(barber.latitude), Number(barber.longitude)]}
              icon={barberPin}
              eventHandlers={{ click: () => openBarber(barber) }}
            >
              <Popup>
                <strong>{barber.business_name}</strong>
                <br />
                {barber.location}
              </Popup>
            </Marker>
          ))}
          {selectedBarber ? <FlyToMarker barber={selectedBarber} /> : null}
        </MapContainer>
        <button className="nearby-button-v4 theme-aware-v4" type="button" onClick={requestLocation}>
          <FiNavigation /> {userLocation ? "Location enabled" : "Use my location"}
        </button>
      </div>

      <div className="panel-head-v4">
        <div className="panel-title-v4">Top barbers</div>
        <div className="panel-link-v4">{barbersLoading ? "Finding barbers" : `${filteredBarbers.length} available`}</div>
      </div>

      <div className="top-barbers-grid-v4 top-barbers-grid-single-v4">
        {barbersLoading ? (
          <>
            <div className="barber-skeleton-card-v7" />
            <div className="barber-skeleton-card-v7" />
          </>
        ) : topBarbers.map((barber) => (
          <div key={barber.id} className="top-barber-card-v4 top-barber-card-clean-v4">
            <button type="button" className="unstyled-card-btn-v4 top-barber-button-v4" onClick={() => openBarber(barber)}>
              <div className="barber-image-v4 barber-image-compact-v4">
                <img src={barber.image || logo} alt={barber.business_name} />
              </div>
              <div className="barber-card-content-v4">{renderCardMeta(barber)}</div>
            </button>
            <div className="barber-card-fav-wrap-v4 barber-card-fav-middle-v4">
              <button
                type="button"
                className={barber.isFavorite ? "fav-btn-v4 active" : "fav-btn-v4"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(barber.id);
                }}
              >
                <FiHeart />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="panel-head-v4 space-top">
        <div className="panel-title-v4">Available barbers</div>
        <div className="panel-link-v4">{remainingBarbers.length} more</div>
      </div>

      <div className="barber-list-v4">
        {barbersLoading ? (
          <div className="skeleton-list-v7" aria-label="Loading barbers">
            <span />
            <span />
            <span />
          </div>
        ) : remainingBarbers.length === 0 ? (
          <div className="empty-state-v7 compact">
            <FiSearch />
            <strong>No more barbers here</strong>
            <span>Try another filter or search a nearby location.</span>
          </div>
        ) : (
          remainingBarbers.map((barber) => (
            <div key={barber.id} className={selectedBarber?.id === barber.id ? "barber-card-v4 selected barber-card-clean-v4" : "barber-card-v4 barber-card-clean-v4"}>
              <button type="button" className="unstyled-card-btn-v4 barber-card-main-btn-v4 barber-card-main-layout-v4" onClick={() => openBarber(barber)}>
                <div className="barber-list-image-v4 barber-image-compact-v4">
                  <img src={barber.image || logo} alt={barber.business_name} />
                </div>
                <div className="barber-card-content-v4">{renderCardMeta(barber)}</div>
              </button>
              <button
                type="button"
                className={barber.isFavorite ? "fav-btn-v4 small active" : "fav-btn-v4 small"}
                onClick={() => toggleFavorite(barber.id)}
              >
                <FiHeart />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
