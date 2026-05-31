import express from "express";
import { getAiCoachInsights } from "../controllers/aiCoachController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireBusinessOwner, requireProviderPlatinum } from "../middleware/businessAccessMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/insights/:businessId", protect, requireRole("barber"), requireBusinessOwner, requireProviderPlatinum, getAiCoachInsights);

export default router;
