import express from "express";
import { getAiCoachInsights, getMyCoachInsights, getProviderCoachQuestionList, postProviderCoachAdvice } from "../controllers/aiCoachController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireBusinessOwner } from "../middleware/businessAccessMiddleware.js";
import { aiCoachRateLimiter } from "../middleware/securityMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Owner-based routes (no businessId param needed — uses JWT user)
router.get("/insights", protect, getMyCoachInsights);
router.get("/questions", protect, getProviderCoachQuestionList);
router.post("/advice", protect, aiCoachRateLimiter, postProviderCoachAdvice);

// businessId-param routes (legacy, kept for compatibility)
router.get("/questions/:businessId", protect, requireRole("barber"), getProviderCoachQuestionList);
router.post("/advice/:businessId", protect, requireRole("barber"), aiCoachRateLimiter, postProviderCoachAdvice);
router.get("/insights/:businessId", protect, requireRole("barber"), requireBusinessOwner, getAiCoachInsights);

export default router;
