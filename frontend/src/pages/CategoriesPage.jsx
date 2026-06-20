import { FiGrid } from "react-icons/fi";
import { MARKETPLACE_CATEGORIES } from "../utils/serviceCatalog.js";
import { getCategoryDef } from "../utils/categoryRegistry.jsx";

export default function CategoriesPage({ selectedCategory, setSelectedCategory, onOpenCategory }) {
  const categories = Array.isArray(MARKETPLACE_CATEGORIES) ? MARKETPLACE_CATEGORIES.filter((item) => item.active) : [];

  return (
    <div className="content-v4 app-page-v4 queless-utility-page">
      <div className="queless-utility-head">
        <span><FiGrid /></span>
        <div>
          <h1>Categories</h1>
          <p>Browse trusted providers by service type.</p>
        </div>
      </div>

      <div className="queless-category-page-grid">
        {categories.map((category) => {
          const def = getCategoryDef(category.id);
          const { Icon, primaryColor, softBg, borderColor } = def;
          const active = selectedCategory === category.name;
          return (
            <button
              type="button"
              key={category.id}
              className={active ? "queless-category-page-card active" : "queless-category-page-card"}
              style={{ "--category-start": primaryColor, "--category-end": softBg, "--category-border": borderColor }}
              onClick={() => {
                setSelectedCategory(category.name);
                onOpenCategory?.(category.name);
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  background: softBg,
                  border: `1.5px solid ${borderColor}`,
                  flexShrink: 0,
                }}
              >
                <Icon size={20} style={{ color: primaryColor }} aria-hidden="true" />
              </span>
              <strong>{category.name}</strong>
              <small>{category.description}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
