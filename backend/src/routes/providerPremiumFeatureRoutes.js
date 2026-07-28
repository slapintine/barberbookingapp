import express from "express";
import {
  getProviderPremiumDashboardController,
  getProviderPremiumEntitlements,
  postProviderPromotion,
  postProviderResponseDraft,
} from "../controllers/providerPremiumFeatureController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.get("/entitlements", protect, requireRole("barber"), getProviderPremiumEntitlements);
router.get("/dashboard", protect, requireRole("barber"), getProviderPremiumDashboardController);
router.post("/promotions", protect, requireRole("barber"), validateRequest(schemas.providerPromotionCreate), postProviderPromotion);
router.post("/response-draft", protect, requireRole("barber"), validateRequest(schemas.providerResponseDraft), postProviderResponseDraft);

export default router;
