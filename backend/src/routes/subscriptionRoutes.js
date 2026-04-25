import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  getMySubscription,
  startSubscriptionUpgrade,
  verifySubscriptionUpgrade,
} from "../controllers/subscriptionController.js";

const router = express.Router();

router.get("/me", protect, requireRole("barber"), getMySubscription);
router.post("/upgrade", protect, requireRole("barber"), startSubscriptionUpgrade);
router.post("/verify", protect, requireRole("barber"), verifySubscriptionUpgrade);

export default router;
