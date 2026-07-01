import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCamera,
  FiEdit2,
  FiImage,
  FiPackage,
  FiPlus,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { buildAssetUrl } from "../../config/api.js";

const STOCK_OPTIONS = [
  { value: "in_stock", label: "In stock" },
  { value: "limited", label: "Limited stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "hidden", label: "Hidden" },
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function parseProductOptions(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => {
      const [name, ...rest] = line.split(":");
      const values = rest.join(":").split(",").map((item) => item.trim()).filter(Boolean);
      return { name: String(name || "").trim(), values: [...new Set(values)] };
    })
    .filter((option) => option.name && option.values.length);
}

export function formatProductOptions(options = []) {
  return (Array.isArray(options) ? options : [])
    .map((option) => `${option.name}: ${(option.values || []).join(", ")}`)
    .join("\n");
}

export function normalizeProductDraft(product = {}) {
  product = product && typeof product === "object" ? product : {};
  const images = Array.isArray(product.images)
    ? product.images
    : product.image
    ? [{ image_url: product.image }]
    : [];
  return {
    id: product.id || "",
    name: product.name || "",
    category: product.category || "",
    subcategory: product.subcategory || "",
    description: product.description || "",
    price: product.price ?? "",
    salePrice: product.sale_price ?? product.salePrice ?? "",
    stockStatus: product.stock_status || product.stockStatus || "in_stock",
    quantityAvailable: product.quantity_available ?? product.quantityAvailable ?? "",
    optionsText: formatProductOptions(product.options || product.variants || []),
    isActive: product.is_active ?? product.isActive ?? true,
    images,
    removeImageIds: [],
  };
}

export function serializeProductDraft(product = {}) {
  return {
    name: String(product.name || "").trim(),
    category: String(product.category || "").trim(),
    subcategory: String(product.subcategory || "").trim(),
    description: String(product.description || "").trim(),
    price: Number(product.price || 0),
    sale_price: product.salePrice === "" ? null : Number(product.salePrice),
    stock_status: product.stockStatus || "in_stock",
    quantity_available: product.quantityAvailable === "" ? null : Number(product.quantityAvailable),
    options: parseProductOptions(product.optionsText),
    is_active: Boolean(product.isActive),
    images: (product.images || []).map((image) => ({
      id: image.id,
      image_url: image.image_url || image.imageUrl || image.url || image.image || "",
    })).filter((image) => image.image_url),
    remove_image_ids: product.removeImageIds || [],
  };
}

export function ProductFormModal({
  open,
  product,
  onClose,
  onSave,
  imageLimit = 3,
  saving = false,
}) {
  const [draft, setDraft] = useState(() => normalizeProductDraft(product));
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    setDraft(normalizeProductDraft(product));
    setError("");
  }, [open, product]);

  if (!open) return null;

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const uploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (draft.images.length + files.length > imageLimit) {
      setError(`Your plan allows up to ${imageLimit} images per product.`);
      return;
    }
    try {
      const next = [];
      for (const file of files) {
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Use PNG, JPG, or WebP product images.");
        if (file.size > 10 * 1024 * 1024) throw new Error("Each product image must be 10MB or smaller.");
        next.push({ image_url: await fileToDataUrl(file), local: true });
      }
      setDraft((current) => ({ ...current, images: [...current.images, ...next] }));
      setError("");
    } catch (uploadError) {
      setError(uploadError.message || "Could not read that image.");
    }
  };
  const removeImage = (index) => {
    setDraft((current) => {
      const target = current.images[index];
      return {
        ...current,
        images: current.images.filter((_, itemIndex) => itemIndex !== index),
        removeImageIds: target?.id
          ? [...new Set([...current.removeImageIds, target.id])]
          : current.removeImageIds,
      };
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    const payload = serializeProductDraft(draft);
    if (!payload.name || !payload.category || payload.price <= 0) {
      setError("Add a product name, category, and valid price.");
      return;
    }
    if (payload.sale_price !== null && (payload.sale_price <= 0 || payload.sale_price >= payload.price)) {
      setError("Sale price must be lower than the regular price.");
      return;
    }
    setError("");
    const result = await onSave?.({ ...payload, id: draft.id });
    if (result?.success === false) setError(result.message || "Could not save this product.");
  };

  return (
    <div className="product-modal-backdrop-v21" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <form className="product-form-modal-v21" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="product-form-title">
        <header>
          <div>
            <span>Shop catalogue</span>
            <h2 id="product-form-title">{draft.id ? "Edit product" : "Add product"}</h2>
          </div>
          <button type="button" className="icon-btn-v21" onClick={onClose} aria-label="Close product form"><FiX /></button>
        </header>
        <div className="product-form-scroll-v21">
          <label>Product name<input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label>
          <div className="product-form-grid-v21">
            <label>Category<input value={draft.category} onChange={(event) => update("category", event.target.value)} required /></label>
            <label>Subcategory<input value={draft.subcategory} onChange={(event) => update("subcategory", event.target.value)} /></label>
          </div>
          <div className="product-form-grid-v21">
            <label>Price (UGX)<input type="number" min="1" inputMode="numeric" value={draft.price} onChange={(event) => update("price", event.target.value)} required /></label>
            <label>Sale price (optional)<input type="number" min="1" inputMode="numeric" value={draft.salePrice} onChange={(event) => update("salePrice", event.target.value)} /></label>
          </div>
          <div className="product-form-grid-v21">
            <label>Stock status
              <select value={draft.stockStatus} onChange={(event) => update("stockStatus", event.target.value)}>
                {STOCK_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Quantity (optional)<input type="number" min="0" inputMode="numeric" value={draft.quantityAvailable} onChange={(event) => update("quantityAvailable", event.target.value)} /></label>
          </div>
          <label>Description<textarea rows="4" value={draft.description} onChange={(event) => update("description", event.target.value)} /></label>
          <label>Options
            <textarea
              rows="3"
              value={draft.optionsText}
              onChange={(event) => update("optionsText", event.target.value)}
              placeholder={"Size: Small, Medium, Large\nColor: Maroon, Purple"}
            />
            <small>One option per line. Separate choices with commas.</small>
          </label>
          <div className="product-image-editor-v21">
            <div>
              <strong>Product photos</strong>
              <small>{draft.images.length} of {imageLimit}</small>
            </div>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={uploadImages} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={draft.images.length >= imageLimit}><FiCamera /> Add photos</button>
            {draft.images.length ? (
              <div className="product-image-grid-v21">
                {draft.images.map((image, index) => (
                  <figure key={image.id || image.image_url || index}>
                    <img src={buildAssetUrl(image.image_url || image.imageUrl)} alt="" />
                    <button type="button" onClick={() => removeImage(index)} aria-label="Remove product image"><FiTrash2 /></button>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="product-image-empty-v21"><FiImage /><span>Add clear photos customers can inspect.</span></div>
            )}
          </div>
          <label className="product-active-toggle-v21">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} />
            <span>Show this product in the shop</span>
          </label>
          {error ? <div className="product-error-v21">{error}</div> : null}
        </div>
        <footer>
          <button type="button" className="secondary-btn-v4" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-btn-v4" disabled={saving}>{saving ? "Saving..." : "Save product"}</button>
        </footer>
      </form>
    </div>
  );
}

export default function ProductCatalogueEditor({
  products = [],
  onChange,
  onRemove,
  productLimit = 5,
  imageLimit = 3,
  disabled = false,
}) {
  const [editing, setEditing] = useState(null);
  const activeCount = useMemo(() => products.filter((product) => product.is_active ?? product.isActive ?? true).length, [products]);
  const save = async (payload) => {
    const localId = payload.id || `local-product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = { ...payload, id: localId, localOnly: !payload.id || String(payload.id).startsWith("local-product-") };
    onChange?.(
      payload.id
        ? products.map((product) => String(product.id) === String(payload.id) ? { ...product, ...next } : product)
        : [...products, next]
    );
    setEditing(null);
    return { success: true };
  };
  const canAdd = productLimit < 0 || activeCount < productLimit;

  return (
    <section className="product-catalogue-editor-v21">
      <div className="product-workspace-head-v21">
        <div>
          <span>Product catalogue</span>
          <h3>Products</h3>
          <small>{productLimit < 0 ? `${activeCount} active products` : `${activeCount} of ${productLimit} active products`}</small>
        </div>
        <button type="button" onClick={() => setEditing({})} disabled={disabled || !canAdd}><FiPlus /> Add product</button>
      </div>
      {!products.length ? (
        <div className="product-empty-v21">
          <FiPackage />
          <strong>No products yet</strong>
          <p>Add your first product so customers can request it for pickup or delivery.</p>
          <button type="button" onClick={() => setEditing({})} disabled={disabled || !canAdd}><FiPlus /> Add product</button>
        </div>
      ) : (
        <div className="product-editor-list-v21">
          {products.map((product) => {
            const image = product.images?.[0]?.image_url || product.images?.[0]?.imageUrl || product.image || "";
            return (
              <article key={product.id} className="product-editor-row-v21">
                <span className="product-editor-thumb-v21">{image ? <img src={buildAssetUrl(image)} alt="" /> : <FiImage />}</span>
                <div>
                  <strong>{product.name || "Untitled product"}</strong>
                  <small>UGX {Number(product.sale_price ?? product.salePrice ?? product.price ?? 0).toLocaleString()}</small>
                  <em>{String(product.stock_status || product.stockStatus || "in_stock").replace(/_/g, " ")}</em>
                </div>
                <div className="product-editor-actions-v21">
                  <button type="button" onClick={() => setEditing(product)} aria-label={`Edit ${product.name}`}><FiEdit2 /></button>
                  <button type="button" onClick={() => onRemove?.(product)} aria-label={`Remove ${product.name}`}><FiTrash2 /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!canAdd ? <div className="product-limit-note-v21">You have reached your current plan’s product limit.</div> : null}
      <ProductFormModal
        key={`${editing?.id || "new"}-${Boolean(editing)}`}
        open={Boolean(editing)}
        product={editing}
        imageLimit={imageLimit}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </section>
  );
}
