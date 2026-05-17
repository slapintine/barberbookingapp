import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createQuoteRequest,
  getCategories,
  getMyQuoteRequests,
  getProviders,
  getServiceListings,
} from "../controllers/marketplaceController.js";

const router = express.Router();

router.get("/categories", getCategories);
router.get("/providers", getProviders);
router.get("/service-listings", getServiceListings);
router.get("/quote-requests/me", protect, getMyQuoteRequests);
router.post("/quote-requests", protect, createQuoteRequest);

export default router;
