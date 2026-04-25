import { useEffect, useState } from "react";

export default function useTheme(storageKey = "lineup_theme", fallback = "dark") {
  const normalizeTheme = (value) => (value === "light" || value === "dark" ? value : fallback);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const legacySaved = localStorage.getItem("cutz_theme");
    return normalizeTheme(saved || legacySaved || fallback);
  });

  useEffect(() => {
    const nextTheme = normalizeTheme(theme);
    localStorage.setItem(storageKey, nextTheme);
    localStorage.setItem("cutz_theme", nextTheme);
  }, [storageKey, theme]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const nextTheme = normalizeTheme(theme);
      document.body.dataset.lineupTheme = nextTheme;
      document.body.dataset.cutzTheme = nextTheme;
    }
  }, [theme]);

  return [theme, setTheme];
}
