import { useEffect, useState } from "react";

export default function useTheme(storageKey = "queless-theme", fallback = "light") {
  const normalizeTheme = (value) => (value === "light" || value === "dark" ? value : fallback);

  const [theme, setStoredTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const legacySaved = localStorage.getItem("lineup_theme") || localStorage.getItem("cutz_theme");
      return normalizeTheme(saved || legacySaved || fallback);
    } catch {
      return fallback;
    }
  });
  const setTheme = (value) => {
    setStoredTheme((previous) => normalizeTheme(typeof value === "function" ? value(previous) : value));
  };

  useEffect(() => {
    const nextTheme = normalizeTheme(theme);
    try {
      localStorage.setItem(storageKey, nextTheme);
      localStorage.setItem("lineup_theme", nextTheme);
      localStorage.setItem("cutz_theme", nextTheme);
    } catch {
      setStoredTheme(fallback);
    }
  }, [storageKey, theme]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const nextTheme = normalizeTheme(theme);
      document.documentElement.dataset.theme = nextTheme;
      document.body.dataset.theme = nextTheme;
      document.body.dataset.lineupTheme = nextTheme;
      document.body.dataset.cutzTheme = nextTheme;
    }
  }, [theme]);

  return [normalizeTheme(theme), setTheme];
}
