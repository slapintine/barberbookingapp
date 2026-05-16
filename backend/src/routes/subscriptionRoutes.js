import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  getMySubscription,
  startSubscriptionUpgrade,
  verifySubscriptionUpgrade,
} from "../controllers/subscriptionController.js";

const router = express.Router();

router.get("/me", protect, requireRole("barber", "admin"), getMySubscription);
router.post("/upgrade", protect, requireRole("barber", "admin"), startSubscriptionUpgrade);
router.post("/verify", protect, requireRole("barber", "admin"), verifySubscriptionUpgrade);

export default router;
