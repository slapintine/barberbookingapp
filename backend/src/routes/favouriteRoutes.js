import express from "express";
import { all, get, run } from "../db/query.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", async (req, res, next) => {
  try {
    const rows = await all(
      `SELECT id, user_id, barber_id, created_at
       FROM favorites
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const barberId = Number(req.body.barber_id ?? req.body.barberId);

    if (!barberId) {
      return res.status(400).json({ error: "barber_id is required." });
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

    const result = await run(
      `INSERT INTO favorites (user_id, barber_id, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [req.user.id, barberId]
    );

    return res.status(201).json({
      id: result.lastID,
      user_id: req.user.id,
      barber_id: barberId,
      message: "Favorite added successfully.",
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:barberId", async (req, res, next) => {
  try {
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
