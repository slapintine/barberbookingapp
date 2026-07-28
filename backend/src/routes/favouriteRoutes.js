import express from "express";
import { all, get, run } from "../db/query.js";
import { protect } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";
import { getCustomerEntitlementSnapshot } from "../services/entitlementService.js";
import { publicBusinessParams, publicBusinessWhere } from "../services/businessVisibility.js";

const router = express.Router();

router.use(protect);

function requireCustomer(req, res) {
  if (String(req.user?.role || "").toLowerCase() !== "customer") {
    res.status(403).json({ success: false, message: "Favorites are available for customer accounts." });
    return false;
  }
  return true;
}

router.get("/", async (req, res, next) => {
  try {
    if (!requireCustomer(req, res)) return;
    const snapshot = await getCustomerEntitlementSnapshot(req.user.id);
    const rows = await all(
      `SELECT f.id, f.user_id, f.barber_id, f.created_at,
              b.business_name, b.business_type, b.location, b.image,
              b.business_status, b.is_published
       FROM favorites f
       LEFT JOIN barbers b ON b.id = f.barber_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, favorites: rows, limits: snapshot.limits, plan: snapshot.plan });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateRequest(schemas.favouriteCreate), async (req, res, next) => {
  try {
    if (!requireCustomer(req, res)) return;
    const barberId = Number(req.body.barber_id ?? req.body.barberId);

    if (!barberId) {
      return res.status(400).json({ error: "barber_id is required." });
    }

    const provider = await get(
      `SELECT id, business_status, is_published
       FROM barbers b
       WHERE b.id = ? AND ${publicBusinessWhere("b")}`,
      [barberId, ...publicBusinessParams(new Date())]
    );
    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider is not available to save." });
    }

    const existing = await get(
      `SELECT id, user_id, barber_id, created_at
       FROM favorites
       WHERE user_id = ? AND barber_id = ?`,
      [req.user.id, barberId]
    );

    if (existing) {
      return res.status(200).json({
        message: "Already in favorites.",
        id: existing.id,
        user_id: existing.user_id,
        barber_id: existing.barber_id,
        created_at: existing.created_at,
      });
    }

    const snapshot = await getCustomerEntitlementSnapshot(req.user.id);
    const countRow = await get(`SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?`, [req.user.id]);
    const count = Number(countRow?.count || 0);
    if (count >= Number(snapshot.limits?.favourites || 0)) {
      return res.status(403).json({
        success: false,
        code: "FAVOURITE_LIMIT_REACHED",
        message: snapshot.premium
          ? "You've reached the saved-provider limit. Remove one before adding another."
          : "Free customers can save up to 3 providers. Remove one or upgrade to Customer Premium for more.",
        limit: snapshot.limits.favourites,
        plan: snapshot.plan,
      });
    }

    const result = await run(
      `INSERT INTO favorites (user_id, barber_id, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [req.user.id, barberId]
    );

    return res.status(201).json({
      success: true,
      id: result.lastID,
      user_id: req.user.id,
      barber_id: barberId,
      message: "Favorite added successfully.",
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:barberId", validateRequest(schemas.favouriteDelete), async (req, res, next) => {
  try {
    if (!requireCustomer(req, res)) return;
    const { barberId } = req.params;
    const result = await run(
      `DELETE FROM favorites
       WHERE user_id = ? AND barber_id = ?`,
      [req.user.id, barberId]
    );

    res.json({
      message: "Favorite removed successfully.",
      removed: result.changes > 0,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
