import { useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiImage,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiSearch,
  FiShoppingBag,
  FiTruck,
  FiX,
} from "react-icons/fi";
import { browseProducts, createProductInquiry, createProductOrder } from "../../api/productsApi.js";
import { buildAssetUrl } from "../../config/api.js";
import useProductMarketplaceAvailability from "../../hooks/useProductMarketplaceAvailability.js";
import { isProductMarketplaceDisabledError, supportsProducts } from "../../utils/marketplaceMode.js";

function productPrice(product) {
  const sale = Number(product.sale_price ?? product.salePrice ?? 0);
  const regular = Number(product.price || 0);
  return { current: sale > 0 && sale < regular ? sale : regular, regular, onSale: sale > 0 && sale < regular };
}

function makeRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ProductDetailModal({ product, currentUser, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [fulfilmentMethod, setFulfilmentMethod] = useState(product?.stand?.pickup_available ? "pickup" : "delivery");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setSelectedOptions({});
    setFulfilmentMethod(product.stand?.pickup_available ? "pickup" : "delivery");
    setPhone(currentUser?.phone || "");
    setDeliveryArea("");
    setDeliveryAddress("");
    setNote("");
    setStatus("");
  }, [currentUser?.phone, product]);
  if (!product) return null;

  const image = product.images?.[0]?.image_url || product.image || "";
  const price = productPrice(product);
  const isCustomer = !["provider", "barber", "business"].includes(String(currentUser?.role || "").toLowerCase());
  const canPickup = Boolean(product.stand?.pickup_available ?? product.stand?.pickupAvailable);
  const canDeliver = Boolean(product.stand?.delivery_available ?? product.stand?.deliveryAvailable);
  const submitOrder = async (event) => {
    event.preventDefault();
    if (!isCustomer) {
      setStatus("Use a customer account to send an order request.");
      return;
    }
    setSubmitting(true);
    setStatus("");
    try {
      const data = await createProductOrder({
        items: [{ product_id: product.id, quantity: Number(quantity), selected_options: selectedOptions }],
        fulfilment_method: fulfilmentMethod,
        customer_phone: phone,
        delivery_area: fulfilmentMethod === "delivery" ? deliveryArea : "",
        delivery_address: fulfilmentMethod === "delivery" ? deliveryAddress : "",
        customer_note: note,
        idempotency_key: makeRequestId("product-order"),
      });
      setStatus(data?.message || "Order request sent. The seller will confirm the details.");
    } catch (error) {
      setStatus(error.message || "Could not send this order request.");
    } finally {
      setSubmitting(false);
    }
  };
  const messageSeller = async () => {
    if (!isCustomer) {
      setStatus("Use a customer account to message this seller.");
      return;
    }
    setSubmitting(true);
    setStatus("");
    try {
      await createProductInquiry({
        product_id: product.id,
        message: note.trim() || `Hi, I am interested in ${product.name}.`,
        idempotency_key: makeRequestId("product-inquiry"),
      });
      setStatus("Message sent. Continue the conversation from Messages.");
    } catch (error) {
      setStatus(error.message || "Could not message this seller.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="product-modal-backdrop-v21" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className="customer-product-modal-v21" role="dialog" aria-modal="true" aria-labelledby="customer-product-title">
        <header className="customer-product-modal-head-v21">
          <button type="button" className="icon-btn-v21" onClick={onClose} aria-label="Back"><FiArrowLeft /></button>
          <strong>Product details</strong>
          <button type="button" className="icon-btn-v21" onClick={onClose} aria-label="Close"><FiX /></button>
        </header>
        <div className="customer-product-modal-scroll-v21">
          <div className="customer-product-hero-v21">
            {image ? <img src={buildAssetUrl(image)} alt={product.name} /> : <span><FiImage /></span>}
          </div>
          <div className="customer-product-copy-v21">
            <div>
              <span>{product.category}{product.subcategory ? ` · ${product.subcategory}` : ""}</span>
              <h2 id="customer-product-title">{product.name}</h2>
              <p>{product.description || "Ask the seller for more information about this item."}</p>
            </div>
            <div className="customer-product-price-v21">
              <strong>UGX {price.current.toLocaleString()}</strong>
              {price.onSale ? <del>UGX {price.regular.toLocaleString()}</del> : null}
            </div>
          </div>
          <div className="customer-product-seller-v21">
            <FiShoppingBag />
            <div><strong>{product.stand?.business_name || "Local seller"}</strong><small><FiMapPin /> {product.stand?.location || "Location available from seller"}</small></div>
          </div>
          <form className="customer-order-form-v21" onSubmit={submitOrder}>
            <div className="customer-order-heading-v21"><span>Order request</span><small>No payment is collected</small></div>
            <label>Quantity<input type="number" min="1" max={product.quantity_available || 999} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            {(product.options || []).map((option) => (
              <label key={option.name}>{option.name}
                <select
                  value={selectedOptions[option.name] || ""}
                  onChange={(event) => setSelectedOptions((current) => ({ ...current, [option.name]: event.target.value }))}
                  required
                >
                  <option value="">Choose {option.name.toLowerCase()}</option>
                  {(option.values || []).map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
            ))}
            <fieldset>
              <legend>Pickup or delivery</legend>
              <div className="fulfilment-choice-v21">
                {canPickup ? <label className={fulfilmentMethod === "pickup" ? "active" : ""}><input type="radio" name="fulfilment" value="pickup" checked={fulfilmentMethod === "pickup"} onChange={() => setFulfilmentMethod("pickup")} /><FiPackage /><span><strong>Pickup</strong><small>Collect from seller</small></span></label> : null}
                {canDeliver ? <label className={fulfilmentMethod === "delivery" ? "active" : ""}><input type="radio" name="fulfilment" value="delivery" checked={fulfilmentMethod === "delivery"} onChange={() => setFulfilmentMethod("delivery")} /><FiTruck /><span><strong>Delivery</strong><small>Seller confirms details</small></span></label> : null}
              </div>
            </fieldset>
            <label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+256 7..." required /></label>
            {fulfilmentMethod === "delivery" ? (
              <div className="product-form-grid-v21">
                <label>Delivery area<input value={deliveryArea} onChange={(event) => setDeliveryArea(event.target.value)} required /></label>
                <label>Delivery address<input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} required /></label>
              </div>
            ) : null}
            <label>Note to seller<textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Color, collection time, delivery directions..." /></label>
            {status ? <div className="product-request-status-v21"><FiCheckCircle /> {status}</div> : null}
            <div className="customer-product-actions-v21">
              <button type="button" className="secondary-btn-v4" onClick={messageSeller} disabled={submitting}><FiMessageCircle /> Chat seller</button>
              <button type="submit" className="primary-btn-v4" disabled={submitting || (!canPickup && !canDeliver)}>{submitting ? "Sending..." : "Send order request"}</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

export default function ProductMarketplacePanel({
  currentUser,
  standId = "",
  compact = false,
  shopStands = [],
  onOpenShopStand,
  onCreateShopStand,
  onBrowseServices,
}) {
  const availability = useProductMarketplaceAvailability(true);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiDisabled, setApiDisabled] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!availability.enabled) return undefined;
    setLoading(true);
    setError("");
    setApiDisabled(false);
    browseProducts({ stand_id: standId || undefined, limit: compact ? 12 : 30 })
      .then((data) => {
        if (!cancelled) {
          setProducts(data?.products || []);
          setApiDisabled(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          if (isProductMarketplaceDisabledError(loadError)) setApiDisabled(true);
          else setError(loadError.message || "Could not load seller listings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [availability.enabled, compact, standId]);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      `${product.name} ${product.category} ${product.subcategory} ${product.stand?.business_name}`.toLowerCase().includes(term)
    );
  }, [products, query]);
  const visibleShopStands = useMemo(() => {
    if (compact) return [];
    const term = query.trim().toLowerCase();
    return (Array.isArray(shopStands) ? shopStands : [])
      .filter((stand) => supportsProducts(stand))
      .filter((stand) => {
        if (!term) return true;
        return `${stand.business_name || stand.businessName || stand.name || ""} ${stand.business_type || stand.category || ""} ${stand.location || ""}`
          .toLowerCase()
          .includes(term);
      });
  }, [compact, query, shopStands]);
  const isProviderAccount = ["provider", "barber", "business"].includes(String(currentUser?.role || "").toLowerCase());
  const showDisabledState = !availability.enabled || apiDisabled;

  if (availability.loading) return <div className="product-loading-v21"><FiShoppingBag /> Checking local shops...</div>;
  if (showDisabledState) {
    return (
      <section className={`product-coming-soon-v21${compact ? " compact" : ""}`} role="status">
        <span className="product-state-icon-v21"><FiShoppingBag /></span>
        <div>
          <span className="product-state-eyebrow-v21">Local seller marketplace</span>
          <strong>Shop Stands are almost ready</strong>
          <p>Soon you’ll be able to discover products listed by local sellers on Queless. Service bookings continue to work normally.</p>
          {!compact && onBrowseServices ? <button type="button" onClick={onBrowseServices}>Browse services</button> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={`customer-products-panel-v21${compact ? " compact" : ""}`}>
      {!compact ? (
        <div className="customer-products-heading-v21">
          <div><span>Seller marketplace</span><h2>Shop from local sellers</h2><p>Browse products listed by real businesses on Queless, then request from or chat with the seller.</p></div>
          <label><FiSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or sellers" /></label>
        </div>
      ) : null}
      {loading ? <div className="product-loading-v21"><FiPackage /> Loading seller listings...</div> : null}
      {error ? <div className="product-error-v21">{error}</div> : null}
      {!loading && !error && visibleShopStands.length ? (
        <section className="shop-stand-results-v21" aria-labelledby="shop-stand-results-title-v21">
          <div className="shop-stand-results-heading-v21">
            <span>Local businesses</span>
            <h3 id="shop-stand-results-title-v21">Browse Shop Stands</h3>
          </div>
          <div className="shop-stand-grid-v21">
            {visibleShopStands.map((stand) => {
              const name = stand.business_name || stand.businessName || stand.name || "Local seller";
              const image = stand.cover_image_url || stand.coverImage || stand.image_url || stand.image || stand.logo || "";
              return (
                <article className="shop-stand-card-v21" key={stand.id || name}>
                  <span className="shop-stand-card-image-v21">{image ? <img src={buildAssetUrl(image)} alt="" /> : <FiShoppingBag />}</span>
                  <div>
                    <small>{stand.business_type || stand.category?.name || stand.category || "Shop Stand"}</small>
                    <strong>{name}</strong>
                    <span><FiMapPin /> {stand.location || "Location available from seller"}</span>
                    <p>{stand.delivery_available || stand.deliveryAvailable ? "Delivery available" : "Pickup from seller"}</p>
                  </div>
                  <button type="button" onClick={() => onOpenShopStand?.(stand)}>Visit shop stand</button>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {!loading && !error && !visibleProducts.length && !visibleShopStands.length ? (
        <div className="product-empty-v21">
          <span className="product-state-icon-v21"><FiShoppingBag /></span>
          <strong>{query.trim() ? "No seller listings found" : compact ? "No products listed yet" : "No shop stands yet"}</strong>
          <p>{query.trim() ? "Try another product, business, or location." : compact ? "This seller has not published products yet." : "Local businesses will appear here once they publish products."}</p>
          {!compact && (isProviderAccount ? onCreateShopStand : onBrowseServices) ? (
            <button type="button" onClick={isProviderAccount ? onCreateShopStand : onBrowseServices}>
              {isProviderAccount ? "Create a Shop Stand" : "Browse services"}
            </button>
          ) : null}
        </div>
      ) : visibleProducts.length ? (
        <div className="customer-product-grid-v21">
          {visibleProducts.map((product) => {
            const image = product.images?.[0]?.image_url || product.image || "";
            const price = productPrice(product);
            return (
              <article className="customer-product-card-v21" key={product.id}>
                <button type="button" className="customer-product-card-main-v21" onClick={() => setSelectedProduct(product)}>
                  <span className="customer-product-card-image-v21">{image ? <img src={buildAssetUrl(image)} alt={product.name} /> : <FiImage />}</span>
                  <span className="customer-product-card-copy-v21">
                    <small>{product.category}</small>
                    <strong>{product.name}</strong>
                    <b>UGX {price.current.toLocaleString()}</b>
                    {price.onSale ? <del>UGX {price.regular.toLocaleString()}</del> : null}
                    <em>{String(product.stock_status || "in_stock").replace(/_/g, " ")}</em>
                    <span><FiMapPin /> {product.stand?.location || product.stand?.business_name}</span>
                  </span>
                </button>
                <footer>
                  <button type="button" onClick={() => setSelectedProduct(product)}>View product</button>
                  <button type="button" className="primary" onClick={() => setSelectedProduct(product)}>Request item</button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}
      <ProductDetailModal product={selectedProduct} currentUser={currentUser} onClose={() => setSelectedProduct(null)} />
    </section>
  );
}
