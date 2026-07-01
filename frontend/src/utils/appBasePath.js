export function normalizeAppBasePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "." || raw === "./" || raw === "/") return "";
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}
