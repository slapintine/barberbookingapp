import express from "express";
import { all, get, run } from "../db/query.js";

const router = express.Router();

router.get("/:username", async (req, res, next) => {
  try {
    const { username } = req.params;
    const rows = await all(
      `SELECT id, username, barber_id, created_at
       FROM favorites
       WHERE username = ?
       ORDER BY created_at DESC`,
      [username]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { username, barber_id } = req.body;

    if (!username || !barber_id) {
      return res.status(400).json({ error: "username and barber_id are required." });
    }

    const existing = await get(
      `SELECT id
       FROM favorites
       WHERE username = ? AND barber_id = ?`,
      [username, barber_id]
    );

    if (existing) {
      return res.status(200).json({
        message: "Already in favorites.",
        id: existing.id,
        username,
        barber_id,
      });
    }

    const result = await run(
      `INSERT INTO favorites (username, barber_id, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [username, barber_id]
    );

    return res.status(201).json({
      id: result.lastID,
      username,
      barber_id,
      message: "Favorite added successfully.",
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:username/:barberId", async (req, res, next) => {
  try {
    const { username, barberId } = req.params;
    const result = await run(
      `DELETE FROM favorites
       WHERE username = ? AND barber_id = ?`,
      [username, barberId]
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
