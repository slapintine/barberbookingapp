import {
  FiActivity,
  FiBookOpen,
  FiBriefcase,
  FiCamera,
  FiDroplet,
  FiGrid,
  FiHome,
  FiNavigation,
  FiTool,
  FiTruck,
  FiZap,
} from "react-icons/fi";
import { MARKETPLACE_CATEGORIES } from "../utils/serviceCatalog.js";

const ICONS = {
  sparkles: FiZap,
  home: FiHome,
  truck: FiTruck,
  camera: FiCamera,
  book: FiBookOpen,
  activity: FiActivity,
  tool: FiTool,
  briefcase: FiBriefcase,
  droplet: FiDroplet,
  navigation: FiNavigation,
};

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
          const Icon = ICONS[category.icon] || FiGrid;
          const active = selectedCategory === category.name;
          return (
            <button
              type="button"
              key={category.id}
              className={active ? "queless-category-page-card active" : "queless-category-page-card"}
              onClick={() => {
                setSelectedCategory(category.name);
                onOpenCategory?.(category.name);
              }}
            >
              <span><Icon /></span>
              <strong>{category.name}</strong>
              <small>{category.description}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
