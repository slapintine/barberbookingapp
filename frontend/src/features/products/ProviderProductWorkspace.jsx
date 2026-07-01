import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiChevronRight,
  FiEdit2,
  FiImage,
  FiInbox,
  FiMessageCircle,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
} from "react-icons/fi";
import { buildAssetUrl } from "../../config/api.js";
import {
  createProduct,
  getMyProductInquiries,
  getMyProducts,
  getSellerProductOrders,
  removeProduct,
  updateProduct,
  updateProductOrderStatus,
  updateProductStock,
} from "../../api/productsApi.js";
import useProductMarketplaceAvailability from "../../hooks/useProductMarketplaceAvailability.js";
import { isProductMarketplaceDisabledError } from "../../utils/marketplaceMode.js";
import { ProductFormModal } from "./ProductCatalogueEditor.jsx";

const ORDER_FILTERS = [
  ["all", "All"],
  ["new", "New"],
  ["confirmed", "Confirmed"],
  ["ready_for_pickup", "Ready"],
  ["out_for_delivery", "Delivery"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

function stockLabel(value) {
  return String(value || "in_stock").replace(/_/g, " ");
}

function orderTransitions(order) {
  if (order.status === "new") return [["confirmed", "Confirm"], ["cancelled", "Cancel"]];
  if (order.status === "confirmed" && order.fulfilment_method === "pickup") return [["ready_for_pickup", "Ready for pickup"], ["cancelled", "Cancel"]];
  if (order.status === "confirmed" && order.fulfilment_method === "delivery") return [["out_for_delivery", "Out for delivery"], ["cancelled", "Cancel"]];
  if (["ready_for_pickup", "out_for_delivery"].includes(order.status)) return [["completed", "Complete"], ["cancelled", "Cancel"]];
  return [];
}

function OrderCard({ order, onStatus, busy }) {
  return (
    <article className="product-order-card-v21">
      <header>
        <div>
          <span>Order request #{order.id}</span>
          <strong>{order.customer_name || order.customerUsername || "Customer"}</strong>
          <small>{order.customer_phone || "Phone not supplied"}</small>
        </div>
        <em className={`product-order-status-v21 ${order.status}`}>{String(order.status).replace(/_/g, " ")}</em>
      </header>
      <div className="product-order-items-v21">
        {(order.items || []).map((item) => (
          <div key={item.id}>
            <span>{item.product_image_snapshot ? <img src={buildAssetUrl(item.product_image_snapshot)} alt="" /> : <FiPackage />}</span>
            <div>
              <strong>{item.product_name_snapshot || item.productName}</strong>
              <small>Qty {item.quantity} · UGX {Number(item.line_total || item.lineTotal || 0).toLocaleString()}</small>
              {Object.keys(item.selected_options || item.selectedOptions || {}).length ? (
                <small>{Object.entries(item.selected_options || item.selectedOptions).map(([name, value]) => `${name}: ${value}`).join(" · ")}</small>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <dl className="product-order-meta-v21">
        <div><dt>Fulfilment</dt><dd>{order.fulfilment_method === "delivery" ? "Delivery" : "Pickup"}</dd></div>
        {order.fulfilment_method === "delivery" ? <div><dt>Deliver to</dt><dd>{[order.delivery_area, order.delivery_address].filter(Boolean).join(" · ")}</dd></div> : null}
        {order.customer_note ? <div><dt>Customer note</dt><dd>{order.customer_note}</dd></div> : null}
        <div><dt>Total estimate</dt><dd>UGX {Number(order.total || 0).toLocaleString()}</dd></div>
      </dl>
      {orderTransitions(order).length ? (
        <footer>
          {orderTransitions(order).map(([status, label]) => (
            <button
              type="button"
              key={status}
              className={status === "cancelled" ? "danger" : ""}
              disabled={busy}
              onClick={() => onStatus(order, status)}
            >
              {label}
            </button>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

export default function ProviderProductWorkspace({ stand, onSummary, activeTab, onTabChange }) {
  const availability = useProductMarketplaceAvailability(true);
  const [internalTab, setInternalTab] = useState("products");
  const tab = activeTab || internalTab;
  const selectTab = (nextTab) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [limits, setLimits] = useState(stand?.productLimits || stand?.product_limits || { productLimit: 5, productImageLimit: 3 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyOrder, setBusyOrder] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");

  const load = useCallback(async () => {
    if (!availability.enabled) return;
    setLoading(true);
    setError("");
    try {
      const [productData, orderData, inquiryData] = await Promise.all([
        getMyProducts(),
        getSellerProductOrders(),
        getMyProductInquiries("seller"),
      ]);
      setProducts(productData?.products || []);
      if (productData?.limits) setLimits(productData.limits);
      setOrders(orderData?.orders || []);
      setInquiries(inquiryData?.inquiries || []);
    } catch (loadError) {
      setError(isProductMarketplaceDisabledError(loadError)
        ? "Shop stands are coming soon."
        : loadError.message || "Could not load shop tools.");
    } finally {
      setLoading(false);
    }
  }, [availability.enabled]);

  useEffect(() => {
    if (availability.checked && availability.enabled) load();
  }, [availability.checked, availability.enabled, load]);

  const filteredOrders = useMemo(
    () => orderFilter === "all" ? orders : orders.filter((order) => order.status === orderFilter),
    [orderFilter, orders]
  );
  const activeCount = products.filter((product) => product.is_active ?? product.isActive).length;
  const productLimit = Number(limits?.productLimit ?? 5);
  const imageLimit = Number(limits?.productImageLimit ?? 3);
  const canAdd = productLimit < 0 || activeCount < productLimit;

  useEffect(() => {
    onSummary?.({
      checked: availability.checked,
      enabled: availability.enabled,
      productCount: products.length,
      activeProductCount: activeCount,
      newOrderCount: orders.filter((order) => order.status === "new").length,
      orderCount: orders.length,
    });
  }, [activeCount, availability.checked, availability.enabled, onSummary, orders, products.length]);

  const saveProduct = async (payload) => {
    setSaving(true);
    setError("");
    try {
      const data = payload.id
        ? await updateProduct(payload.id, payload)
        : await createProduct(payload);
      const saved = data?.product;
      setProducts((current) => payload.id
        ? current.map((product) => String(product.id) === String(payload.id) ? saved : product)
        : [saved, ...current]);
      if (data?.limits) setLimits(data.limits);
      setEditing(null);
      return { success: true };
    } catch (saveError) {
      const message = saveError.message || "Could not save this product.";
      setError(message);
      return { success: false, message };
    } finally {
      setSaving(false);
    }
  };
  const deleteProduct = async (product) => {
    if (!window.confirm(`Remove ${product.name} from this shop? Existing order history will stay readable.`)) return;
    try {
      await removeProduct(product.id);
      setProducts((current) => current.filter((item) => String(item.id) !== String(product.id)));
    } catch (removeError) {
      setError(removeError.message || "Could not remove this product.");
    }
  };
  const changeStock = async (product, stockStatus) => {
    try {
      const data = await updateProductStock(product.id, { stock_status: stockStatus });
      setProducts((current) => current.map((item) => String(item.id) === String(product.id) ? data.product : item));
    } catch (stockError) {
      setError(stockError.message || "Could not update stock.");
    }
  };
  const changeOrderStatus = async (order, status) => {
    setBusyOrder(`${order.id}:${status}`);
    setError("");
    try {
      const data = await updateProductOrderStatus(order.id, { status });
      setOrders((current) => current.map((item) => String(item.id) === String(order.id) ? data.order : item));
    } catch (statusError) {
      setError(statusError.message || "Could not update this order.");
    } finally {
      setBusyOrder("");
    }
  };

  if (availability.loading) {
    return <section className="provider-product-workspace-v21"><div className="product-loading-v21"><FiRefreshCw /> Checking shop tools...</div></section>;
  }
  if (!availability.enabled) {
    return (
      <section className="provider-product-workspace-v21">
        <div className="product-coming-soon-v21">
          <FiPackage />
          <div><strong>Shop stands are coming soon</strong><p>Your current service stand and bookings continue to work normally.</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="provider-product-workspace-v21">
      <div className="product-workspace-title-v21">
        <div><span>Shop workspace</span><h2>Products & orders</h2><p>Product requests stay separate from appointment bookings.</p></div>
        <button type="button" className="icon-btn-v21" onClick={load} aria-label="Refresh shop workspace"><FiRefreshCw /></button>
      </div>
      <div className="product-workspace-tabs-v21" role="tablist">
        <button type="button" className={tab === "products" ? "active" : ""} onClick={() => selectTab("products")}><FiPackage /> Products <span>{products.length}</span></button>
        <button type="button" className={tab === "orders" ? "active" : ""} onClick={() => selectTab("orders")}><FiInbox /> Orders <span>{orders.filter((order) => order.status === "new").length}</span></button>
        <button type="button" className={tab === "inquiries" ? "active" : ""} onClick={() => selectTab("inquiries")}><FiMessageCircle /> Inquiries <span>{inquiries.filter((item) => item.status === "new").length}</span></button>
      </div>
      {error ? <div className="product-error-v21"><FiAlertCircle /> {error}</div> : null}
      {loading ? <div className="product-loading-v21"><FiRefreshCw /> Loading shop workspace...</div> : null}

      {!loading && tab === "products" ? (
        <div className="provider-products-panel-v21">
          <div className="product-panel-toolbar-v21">
            <div><strong>Product catalogue</strong><small>{productLimit < 0 ? `${activeCount} active` : `${activeCount} of ${productLimit} active`}</small></div>
            <button type="button" onClick={() => setEditing({})} disabled={!canAdd}><FiPlus /> Add product</button>
          </div>
          {!products.length ? (
            <div className="product-empty-v21"><FiPackage /><strong>No products yet</strong><p>Add your first product before publishing a Shop Stand.</p><button type="button" onClick={() => setEditing({})}><FiPlus /> Add product</button></div>
          ) : (
            <div className="provider-product-grid-v21">
              {products.map((product) => {
                const image = product.images?.[0]?.image_url || product.image || "";
                return (
                  <article className="provider-product-card-v21" key={product.id}>
                    <div className="provider-product-image-v21">{image ? <img src={buildAssetUrl(image)} alt="" /> : <FiImage />}</div>
                    <div className="provider-product-body-v21">
                      <div><strong>{product.name}</strong><small>{product.category}</small></div>
                      <div className="provider-product-price-v21">
                        <b>UGX {Number(product.sale_price ?? product.price ?? 0).toLocaleString()}</b>
                        {product.sale_price ? <del>UGX {Number(product.price).toLocaleString()}</del> : null}
                      </div>
                      <select value={product.stock_status} onChange={(event) => changeStock(product, event.target.value)} aria-label={`Stock status for ${product.name}`}>
                        <option value="in_stock">In stock</option>
                        <option value="limited">Limited stock</option>
                        <option value="out_of_stock">Out of stock</option>
                        <option value="hidden">Hidden</option>
                      </select>
                      <span className={product.is_active ? "product-active-v21" : "product-hidden-v21"}>{product.is_active ? "Visible" : "Hidden"}</span>
                    </div>
                    <footer>
                      <button type="button" onClick={() => setEditing(product)}><FiEdit2 /> Edit</button>
                      <button type="button" className="danger" onClick={() => deleteProduct(product)}><FiTrash2 /></button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "orders" ? (
        <div className="provider-orders-panel-v21">
          <div className="product-order-filters-v21">
            {ORDER_FILTERS.map(([value, label]) => <button type="button" key={value} className={orderFilter === value ? "active" : ""} onClick={() => setOrderFilter(value)}>{label}</button>)}
          </div>
          {!filteredOrders.length ? (
            <div className="product-empty-v21"><FiInbox /><strong>No {orderFilter === "all" ? "product orders" : stockLabel(orderFilter)} yet</strong><p>New order requests will appear here.</p></div>
          ) : (
            <div className="product-order-list-v21">
              {filteredOrders.map((order) => <OrderCard key={order.id} order={order} onStatus={changeOrderStatus} busy={busyOrder.startsWith(`${order.id}:`)} />)}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "inquiries" ? (
        <div className="product-inquiry-list-v21">
          {!inquiries.length ? (
            <div className="product-empty-v21"><FiMessageCircle /><strong>No product inquiries yet</strong><p>Questions from interested customers will appear here and in Messages.</p></div>
          ) : inquiries.map((inquiry) => (
            <article key={inquiry.id}>
              <span><FiMessageCircle /></span>
              <div><strong>{inquiry.product_name || "Product inquiry"}</strong><p>{inquiry.message}</p><small>{inquiry.customer_username} · {inquiry.status}</small></div>
              <FiChevronRight />
            </article>
          ))}
        </div>
      ) : null}

      <ProductFormModal
        key={`${editing?.id || "new"}-${Boolean(editing)}`}
        open={Boolean(editing)}
        product={editing}
        imageLimit={imageLimit}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={saveProduct}
      />
    </section>
  );
}
