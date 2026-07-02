import express from "express";
import { postProviderCoachChat } from "../controllers/providerCoachChatController.js";
import { protect } from "../middleware/authMiddleware.js";
import { aiCoachRateLimiter } from "../middleware/securityMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.post("/chat", protect, aiCoachRateLimiter, validateRequest(schemas.coachChat), postProviderCoachChat);

export default router;
