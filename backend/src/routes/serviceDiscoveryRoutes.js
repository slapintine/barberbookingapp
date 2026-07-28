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
} from "../controllers/serviceDiscoveryController.js";
import { parseSmartMatch, smartMatch } from "../controllers/smartMatchController.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { requireCustomerPremium } from "../middleware/customerPremiumMiddleware.js";
import { searchRateLimiter, smartMatchRateLimiter, supportRateLimiter } from "../middleware/securityMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.get("/categories", getCategories);
router.get("/providers", searchRateLimiter, getProviders);
router.get("/service-listings", searchRateLimiter, getServiceListings);
router.post("/smart-match/parse", protect, requireRole("customer"), smartMatchRateLimiter, parseSmartMatch);
router.post("/smart-match", protect, requireRole("customer"), requireCustomerPremium, smartMatchRateLimiter, smartMatch);
router.post("/smart-match/search", protect, requireRole("customer"), requireCustomerPremium, smartMatchRateLimiter, smartMatch);
router.get("/quote-requests/me", protect, getMyQuoteRequests);
router.post("/quote-requests", protect, requireRole("customer"), supportRateLimiter, validateRequest(schemas.quoteRequest), createQuoteRequest);
router.get("/support-requests/me", protect, getMySupportRequests);
router.post("/support-requests", protect, supportRateLimiter, validateRequest(schemas.supportRequest), createSupportRequest);

export default router;
