/**
 * Queless Category Icon Registry
 * Single source of truth for all service category icons, colors, and labels.
 * Every screen that shows a category icon must pull from here.
 */
import {
  Baby,
  Briefcase,
  Building2,
  Calculator,
  Camera,
  Car,
  Code2,
  Droplets,
  FileText,
  Flower2,
  GraduationCap,
  Hammer,
  HeartPulse,
  Home,
  Leaf,
  MapPin,
  Megaphone,
  MessageSquare,
  Monitor,
  Navigation,
  Package,
  Palette,
  PawPrint,
  Printer,
  Scale,
  Scissors,
  Shield,
  Shirt,
  Sparkles,
  Stethoscope,
  Truck,
  UtensilsCrossed,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Registry entries. Each key is the canonical category ID used throughout the app.
 * primaryColor  – icon/text color (meets contrast on white and dark bg)
 * softBg        – pastel background for icon bubble
 * borderColor   – subtle border for card/chip
 */
export const CATEGORY_REGISTRY = {
  barber: {
    id: "barber",
    label: "Barber",
    shortLabel: "Barber",
    Icon: Scissors,
    primaryColor: "#522B5B",
    softBg: "#f5edf8",
    borderColor: "rgba(82,43,91,0.18)",
  },
  beauty: {
    id: "beauty",
    label: "Beauty",
    shortLabel: "Beauty",
    Icon: Flower2,
    primaryColor: "#be185d",
    softBg: "#fdf2f8",
    borderColor: "rgba(190,24,93,0.15)",
  },
  salon: {
    id: "salon",
    label: "Salon",
    shortLabel: "Salon",
    Icon: Scissors,
    primaryColor: "#7c3aed",
    softBg: "#f5f3ff",
    borderColor: "rgba(124,58,237,0.15)",
  },
  spa: {
    id: "spa",
    label: "Spa",
    shortLabel: "Spa",
    Icon: Sparkles,
    primaryColor: "#0d9488",
    softBg: "#f0fdfa",
    borderColor: "rgba(13,148,136,0.15)",
  },
  "home-services": {
    id: "home-services",
    label: "Home Services",
    shortLabel: "Home",
    Icon: Home,
    primaryColor: "#b45309",
    softBg: "#fffbeb",
    borderColor: "rgba(180,83,9,0.15)",
  },
  "auto-services": {
    id: "auto-services",
    label: "Auto Services",
    shortLabel: "Auto",
    Icon: Car,
    primaryColor: "#1d4ed8",
    softBg: "#eff6ff",
    borderColor: "rgba(29,78,216,0.15)",
  },
  "events-photography": {
    id: "events-photography",
    label: "Events & Photography",
    shortLabel: "Events",
    Icon: Camera,
    primaryColor: "#7c3aed",
    softBg: "#f5f3ff",
    borderColor: "rgba(124,58,237,0.15)",
  },
  "education-tutoring": {
    id: "education-tutoring",
    label: "Tutor / Lessons",
    shortLabel: "Tutor",
    Icon: GraduationCap,
    primaryColor: "#1d4ed8",
    softBg: "#eff6ff",
    borderColor: "rgba(29,78,216,0.15)",
  },
  "health-fitness": {
    id: "health-fitness",
    label: "Health & Fitness",
    shortLabel: "Health",
    Icon: Stethoscope,
    primaryColor: "#9f1239",
    softBg: "#fff1f2",
    borderColor: "rgba(159,18,57,0.15)",
  },
  "repairs-maintenance": {
    id: "repairs-maintenance",
    label: "Repairs & Maintenance",
    shortLabel: "Repair",
    Icon: Wrench,
    primaryColor: "#92400e",
    softBg: "#fff7ed",
    borderColor: "rgba(146,64,14,0.15)",
  },
  "business-services": {
    id: "business-services",
    label: "Business Services",
    shortLabel: "Business",
    Icon: Briefcase,
    primaryColor: "#3730a3",
    softBg: "#eef2ff",
    borderColor: "rgba(55,48,163,0.15)",
  },
  "cleaning-services": {
    id: "cleaning-services",
    label: "Cleaning Services",
    shortLabel: "Cleaning",
    Icon: Droplets,
    primaryColor: "#0f766e",
    softBg: "#f0fdfa",
    borderColor: "rgba(15,118,110,0.15)",
  },
  "delivery-errands": {
    id: "delivery-errands",
    label: "Delivery & Errands",
    shortLabel: "Delivery",
    Icon: Navigation,
    primaryColor: "#0369a1",
    softBg: "#f0f9ff",
    borderColor: "rgba(3,105,161,0.15)",
  },
  "catering-food-services": {
    id: "catering-food-services",
    label: "Catering & Food Services",
    shortLabel: "Food",
    Icon: UtensilsCrossed,
    primaryColor: "#c2410c",
    softBg: "#fff7ed",
    borderColor: "rgba(194,65,12,0.15)",
  },
  "website-app-development": {
    id: "website-app-development",
    label: "Website & App Development",
    shortLabel: "Dev",
    Icon: Code2,
    primaryColor: "#6d28d9",
    softBg: "#f5f3ff",
    borderColor: "rgba(109,40,217,0.15)",
  },
  "digital-marketing": {
    id: "digital-marketing",
    label: "Digital Marketing",
    shortLabel: "Marketing",
    Icon: Megaphone,
    primaryColor: "#be185d",
    softBg: "#fdf2f8",
    borderColor: "rgba(190,24,93,0.15)",
  },
  "consulting-services": {
    id: "consulting-services",
    label: "Consulting Services",
    shortLabel: "Consulting",
    Icon: MessageSquare,
    primaryColor: "#0369a1",
    softBg: "#f0f9ff",
    borderColor: "rgba(3,105,161,0.15)",
  },
  "accounting-tax": {
    id: "accounting-tax",
    label: "Accounting & Tax",
    shortLabel: "Accounting",
    Icon: Calculator,
    primaryColor: "#166534",
    softBg: "#f0fdf4",
    borderColor: "rgba(22,101,52,0.15)",
  },
  "legal-services": {
    id: "legal-services",
    label: "Legal Services",
    shortLabel: "Legal",
    Icon: Scale,
    primaryColor: "#1e3a5f",
    softBg: "#eff6ff",
    borderColor: "rgba(30,58,95,0.15)",
  },
  "design-branding": {
    id: "design-branding",
    label: "Design & Branding",
    shortLabel: "Design",
    Icon: Palette,
    primaryColor: "#7c3aed",
    softBg: "#f5f3ff",
    borderColor: "rgba(124,58,237,0.15)",
  },
  "writing-translation": {
    id: "writing-translation",
    label: "Writing & Translation",
    shortLabel: "Writing",
    Icon: FileText,
    primaryColor: "#475569",
    softBg: "#f8fafc",
    borderColor: "rgba(71,85,105,0.15)",
  },
  "it-support": {
    id: "it-support",
    label: "IT Support",
    shortLabel: "IT",
    Icon: Monitor,
    primaryColor: "#1d4ed8",
    softBg: "#eff6ff",
    borderColor: "rgba(29,78,216,0.15)",
  },
  "printing-stationery": {
    id: "printing-stationery",
    label: "Printing & Stationery",
    shortLabel: "Printing",
    Icon: Printer,
    primaryColor: "#475569",
    softBg: "#f8fafc",
    borderColor: "rgba(71,85,105,0.15)",
  },
  "real-estate-services": {
    id: "real-estate-services",
    label: "Real Estate Services",
    shortLabel: "Real Estate",
    Icon: Building2,
    primaryColor: "#b45309",
    softBg: "#fffbeb",
    borderColor: "rgba(180,83,9,0.15)",
  },
  "construction-renovation": {
    id: "construction-renovation",
    label: "Construction & Renovation",
    shortLabel: "Construction",
    Icon: Hammer,
    primaryColor: "#92400e",
    softBg: "#fff7ed",
    borderColor: "rgba(146,64,14,0.15)",
  },
  "moving-transport": {
    id: "moving-transport",
    label: "Moving & Transport",
    shortLabel: "Moving",
    Icon: Truck,
    primaryColor: "#1d4ed8",
    softBg: "#eff6ff",
    borderColor: "rgba(29,78,216,0.15)",
  },
  "laundry-services": {
    id: "laundry-services",
    label: "Laundry Services",
    shortLabel: "Laundry",
    Icon: Shirt,
    primaryColor: "#0369a1",
    softBg: "#f0f9ff",
    borderColor: "rgba(3,105,161,0.15)",
  },
  "childcare-services": {
    id: "childcare-services",
    label: "Childcare Services",
    shortLabel: "Childcare",
    Icon: Baby,
    primaryColor: "#be185d",
    softBg: "#fdf2f8",
    borderColor: "rgba(190,24,93,0.15)",
  },
  "pet-services": {
    id: "pet-services",
    label: "Pet Services",
    shortLabel: "Pets",
    Icon: PawPrint,
    primaryColor: "#c2410c",
    softBg: "#fff7ed",
    borderColor: "rgba(194,65,12,0.15)",
  },
  "agriculture-services": {
    id: "agriculture-services",
    label: "Agriculture Services",
    shortLabel: "Agriculture",
    Icon: Leaf,
    primaryColor: "#166534",
    softBg: "#f0fdf4",
    borderColor: "rgba(22,101,52,0.15)",
  },
  "security-services": {
    id: "security-services",
    label: "Security Services",
    shortLabel: "Security",
    Icon: Shield,
    primaryColor: "#1e3a5f",
    softBg: "#eff6ff",
    borderColor: "rgba(30,58,95,0.15)",
  },
  "plumbing-services": {
    id: "plumbing-services",
    label: "Plumbing Services",
    shortLabel: "Plumbing",
    Icon: Droplets,
    primaryColor: "#0369a1",
    softBg: "#f0f9ff",
    borderColor: "rgba(3,105,161,0.15)",
  },
  "electrical-services": {
    id: "electrical-services",
    label: "Electrical Services",
    shortLabel: "Electrical",
    Icon: Zap,
    primaryColor: "#a16207",
    softBg: "#fefce8",
    borderColor: "rgba(161,98,7,0.15)",
  },
  carpentry: {
    id: "carpentry",
    label: "Carpentry",
    shortLabel: "Carpentry",
    Icon: Hammer,
    primaryColor: "#92400e",
    softBg: "#fff7ed",
    borderColor: "rgba(146,64,14,0.15)",
  },
  "packaging-services": {
    id: "packaging-services",
    label: "Packaging Services",
    shortLabel: "Packaging",
    Icon: Package,
    primaryColor: "#475569",
    softBg: "#f8fafc",
    borderColor: "rgba(71,85,105,0.15)",
  },
};

/** Fallback entry for unknown/missing categories */
export const CATEGORY_FALLBACK = {
  id: "default",
  label: "Services",
  shortLabel: "Services",
  Icon: MapPin,
  primaryColor: "#64748b",
  softBg: "#f8fafc",
  borderColor: "rgba(100,116,139,0.15)",
};

/**
 * Legacy icon key mapper: converts old string identifiers to canonical registry IDs.
 * Handles backend icon field values ("scissors", "sparkles", "book", etc.)
 * and legacy emoji or freestyle names.
 */
const LEGACY_ICON_KEY_MAP = {
  scissors: "barber",
  sparkles: "beauty",
  home: "home-services",
  truck: "moving-transport",
  camera: "events-photography",
  book: "education-tutoring",
  activity: "health-fitness",
  tool: "repairs-maintenance",
  briefcase: "business-services",
  droplet: "cleaning-services",
  navigation: "delivery-errands",
  // emoji fallbacks
  "✂️": "barber",
  "💅": "beauty",
  "🏠": "home-services",
  "🚗": "auto-services",
  "📚": "education-tutoring",
  "💪": "health-fitness",
  "🔧": "repairs-maintenance",
  "🍽️": "catering-food-services",
  "📷": "events-photography",
  // common misspellings/variants
  grooming: "barber",
  "hair-cut": "barber",
  haircut: "barber",
  makeup: "beauty",
  nails: "beauty",
  "health-and-fitness": "health-fitness",
  health: "health-fitness",
  fitness: "health-fitness",
  wellness: "health-fitness",
  education: "education-tutoring",
  tutoring: "education-tutoring",
  auto: "auto-services",
  mechanics: "auto-services",
  photography: "events-photography",
  events: "events-photography",
  cleaning: "cleaning-services",
  business: "business-services",
  delivery: "delivery-errands",
  errands: "delivery-errands",
  repairs: "repairs-maintenance",
  maintenance: "repairs-maintenance",
  food: "catering-food-services",
  catering: "catering-food-services",
  "real-estate": "real-estate-services",
  construction: "construction-renovation",
  renovation: "construction-renovation",
  moving: "moving-transport",
  transport: "moving-transport",
  laundry: "laundry-services",
  childcare: "childcare-services",
  pets: "pet-services",
  pet: "pet-services",
  agriculture: "agriculture-services",
  security: "security-services",
  plumbing: "plumbing-services",
  electrical: "electrical-services",
  "it-support": "it-support",
  printing: "printing-stationery",
  stationery: "printing-stationery",
  writing: "writing-translation",
  translation: "writing-translation",
  consulting: "consulting-services",
  accounting: "accounting-tax",
  tax: "accounting-tax",
  legal: "legal-services",
  design: "design-branding",
  branding: "design-branding",
  "website-development": "website-app-development",
  "app-development": "website-app-development",
  "digital-marketing": "digital-marketing",
  marketing: "digital-marketing",
};

/**
 * Returns the registry entry for a category id, with safe fallback.
 * Handles legacy icon keys, label-based lookups, and unknown values.
 */
export function getCategoryDef(idOrKey = "") {
  if (!idOrKey) return CATEGORY_FALLBACK;
  const key = String(idOrKey).trim().toLowerCase();

  // Direct match
  if (CATEGORY_REGISTRY[key]) return CATEGORY_REGISTRY[key];

  // Legacy key lookup
  const resolved = LEGACY_ICON_KEY_MAP[key];
  if (resolved && CATEGORY_REGISTRY[resolved]) return CATEGORY_REGISTRY[resolved];

  // Try normalizing (remove special chars)
  const normalized = key.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (CATEGORY_REGISTRY[normalized]) return CATEGORY_REGISTRY[normalized];

  // Substring match as last resort
  for (const [id, def] of Object.entries(CATEGORY_REGISTRY)) {
    if (id.includes(normalized) || normalized.includes(id)) return def;
  }

  return CATEGORY_FALLBACK;
}

/**
 * Returns all registry entries as an ordered array.
 * Pass an optional array of IDs to filter/order a subset.
 */
export function getCategoryList(ids = null) {
  if (ids) return ids.map((id) => getCategoryDef(id));
  return Object.values(CATEGORY_REGISTRY);
}

/* ─────────────────────────────────────────────────────────────
   Reusable React components
   ───────────────────────────────────────────────────────────── */

/**
 * CategoryIcon — just the icon glyph, no background.
 * Props: categoryId, size (px number), className, style, aria-hidden
 */
export function CategoryIcon({ categoryId, size = 18, className = "", style = {}, ...rest }) {
  const def = getCategoryDef(categoryId);
  const { Icon, primaryColor } = def;
  return (
    <Icon
      size={size}
      className={className}
      style={{ color: primaryColor, flexShrink: 0, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}

/**
 * CategoryBadge — circular icon on a soft pastel background.
 * Props: categoryId, size ("sm"|"md"|"lg"), className
 */
const BADGE_SIZES = {
  xs: { bubble: 28, icon: 13 },
  sm: { bubble: 36, icon: 16 },
  md: { bubble: 48, icon: 22 },
  lg: { bubble: 60, icon: 28 },
  xl: { bubble: 72, icon: 34 },
};

export function CategoryBadge({ categoryId, size = "md", className = "", style = {}, label }) {
  const def = getCategoryDef(categoryId);
  const { Icon, primaryColor, softBg, borderColor } = def;
  const s = BADGE_SIZES[size] || BADGE_SIZES.md;
  const ariaLabel = label || def.label;

  return (
    <span
      className={`ql-cat-badge ql-cat-badge--${size} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: s.bubble,
        height: s.bubble,
        borderRadius: "50%",
        background: softBg,
        border: `1.5px solid ${borderColor}`,
        flexShrink: 0,
        ...style,
      }}
      aria-label={ariaLabel}
    >
      <Icon size={s.icon} style={{ color: primaryColor }} aria-hidden="true" />
    </span>
  );
}

/**
 * CategoryChip — pill with icon + label.
 * Props: categoryId, active, onClick, size ("sm"|"md")
 */
export function CategoryChip({ categoryId, active = false, onClick, size = "md", className = "" }) {
  const def = getCategoryDef(categoryId);
  const { Icon, label, shortLabel, primaryColor, softBg, borderColor } = def;
  const iconSize = size === "sm" ? 12 : 14;
  const displayLabel = size === "sm" ? shortLabel : label;

  return (
    <button
      type="button"
      className={`ql-cat-chip ql-cat-chip--${size} ${active ? "ql-cat-chip--active" : ""} ${className}`}
      onClick={onClick}
      aria-pressed={active}
      style={
        active
          ? { "--chip-color": primaryColor, "--chip-bg": softBg, "--chip-border": borderColor }
          : undefined
      }
    >
      <Icon size={iconSize} aria-hidden="true" />
      <span>{displayLabel}</span>
    </button>
  );
}

/**
 * CategorySelectorItem — large selectable tile for provider icon selection.
 * Props: categoryId, selected, onSelect
 */
export function CategorySelectorItem({ categoryId, selected = false, onSelect }) {
  const def = getCategoryDef(categoryId);
  const { Icon, label, primaryColor, softBg, borderColor } = def;

  return (
    <button
      type="button"
      className={`ql-cat-selector-item ${selected ? "ql-cat-selector-item--selected" : ""}`}
      onClick={() => onSelect?.(categoryId)}
      aria-pressed={selected}
      title={label}
      style={{ "--cat-color": primaryColor, "--cat-bg": softBg, "--cat-border": borderColor }}
    >
      <span className="ql-cat-selector-item__bubble">
        <Icon size={24} aria-hidden="true" />
      </span>
      <span className="ql-cat-selector-item__label">{label}</span>
      {selected && (
        <span className="ql-cat-selector-item__check" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <polyline points="2,6 5,9 10,3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}
