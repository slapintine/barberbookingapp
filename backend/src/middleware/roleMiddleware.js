import { get } from "../db/query.js";

export function requireRole(...roles) {
  return async (req, res, next) => {
    const role = String(req.user?.role || "").trim().toLowerCase();
    const allowed = new Set(roles);
    if (allowed.has("admin")) {
      allowed.add("superadmin");
      allowed.add("super_admin");
      allowed.add("super-admin");
    }
    if (allowed.has("barber")) allowed.add("business");
    if (allowed.has("barber")) allowed.add("provider");
    if (allowed.has("business")) allowed.add("barber");
    if (allowed.has("business")) allowed.add("provider");

    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: "Access denied."
      });
    }

    if (allowed.has(role)) return next();

    if (allowed.has("barber")) {
      try {
        const ownedBusiness = await get(`SELECT id FROM barbers WHERE owner_user_id = ? LIMIT 1`, [req.user.id]);
        if (ownedBusiness) return next();
      } catch (error) {
        return next(error);
      }
    }

    return res.status(403).json({
      success: false,
      message: "Access denied."
    });
  };
}
