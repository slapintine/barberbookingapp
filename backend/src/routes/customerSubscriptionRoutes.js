import express from "express";
import {
  getMyCustomerSubscription,
  startCustomerSubscriptionUpgrade,
  verifyCustomerSubscriptionUpgrade,
} from "../controllers/customerSubscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { paymentRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.get("/me", protect, requireRole("customer"), getMyCustomerSubscription);
router.post("/upgrade", protect, requireRole("customer"), paymentRateLimiter, startCustomerSubscriptionUpgrade);
router.post("/verify", protect, requireRole("customer"), paymentRateLimiter, verifyCustomerSubscriptionUpgrade);

export default router;
