import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMyNotifications,
  markNotificationRead
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/me", protect, getMyNotifications);
router.patch("/:id/read", protect, markNotificationRead);

export default router;