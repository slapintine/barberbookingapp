import { FiGrid } from "react-icons/fi";
import { SERVICE_CATEGORY_DEFINITIONS } from "../utils/serviceCatalog.js";
import { CategoryBadge, getCategoryDef } from "../utils/categoryRegistry.jsx";

export default function CategoriesPage({ selectedCategory, setSelectedCategory, onOpenCategory }) {
  const categories = Array.isArray(SERVICE_CATEGORY_DEFINITIONS) ? SERVICE_CATEGORY_DEFINITIONS.filter((item) => item.active) : [];

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
          const { primaryColor, softBg, borderColor } = def;
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
              <CategoryBadge categoryId={category.id} size="md" label={category.name} />
              <strong>{category.name}</strong>
              <small>{category.description}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
