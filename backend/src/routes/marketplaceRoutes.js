import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createQuoteRequest,
  createSupportRequest,
  getCategories,
  getMyQuoteRequests,
  getMySupportRequests,
  getProviders,
  getServiceListings,
} from "../controllers/marketplaceController.js";
import { smartMatch } from "../controllers/smartMatchController.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { requireCustomerPremium } from "../middleware/customerPremiumMiddleware.js";
import { smartMatchRateLimiter, supportRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.get("/categories", getCategories);
router.get("/providers", getProviders);
router.get("/service-listings", getServiceListings);
router.post("/smart-match", protect, requireRole("customer"), requireCustomerPremium, smartMatchRateLimiter, smartMatch);
router.get("/quote-requests/me", protect, getMyQuoteRequests);
router.post("/quote-requests", protect, supportRateLimiter, createQuoteRequest);
router.get("/support-requests/me", protect, getMySupportRequests);
router.post("/support-requests", protect, supportRateLimiter, createSupportRequest);

export default router;
