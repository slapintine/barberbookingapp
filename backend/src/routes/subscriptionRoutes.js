import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { paymentRateLimiter } from "../middleware/securityMiddleware.js";
import {
  getMySubscription,
  startSubscriptionUpgrade,
  verifySubscriptionUpgrade,
} from "../controllers/subscriptionController.js";
import { getMySubscriptionSummary } from "../controllers/subscriptionSummaryController.js";

const router = express.Router();

// Unified summary — returns both customer + provider memberships in one call.
// Used by profile header badge hydration on app and website.
router.get("/summary", protect, getMySubscriptionSummary);

// Provider subscription routes
router.get("/me", protect, requireRole("barber", "admin"), getMySubscription);
router.post("/upgrade", protect, requireRole("barber", "admin"), paymentRateLimiter, startSubscriptionUpgrade);
router.post("/verify", protect, requireRole("barber", "admin"), paymentRateLimiter, verifySubscriptionUpgrade);

export default router;
