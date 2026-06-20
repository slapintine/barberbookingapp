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
import { searchRateLimiter, smartMatchRateLimiter, supportRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.get("/categories", getCategories);
router.get("/providers", searchRateLimiter, getProviders);
router.get("/service-listings", searchRateLimiter, getServiceListings);
router.post("/smart-match", protect, requireRole("customer"), requireCustomerPremium, smartMatchRateLimiter, smartMatch);
router.post("/smart-match/search", protect, requireRole("customer"), requireCustomerPremium, smartMatchRateLimiter, smartMatch);
router.get("/quote-requests/me", protect, getMyQuoteRequests);
router.post("/quote-requests", protect, requireRole("customer"), supportRateLimiter, createQuoteRequest);
router.get("/support-requests/me", protect, getMySupportRequests);
router.post("/support-requests", protect, supportRateLimiter, createSupportRequest);

export default router;
