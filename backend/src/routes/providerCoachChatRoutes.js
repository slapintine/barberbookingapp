import express from "express";
import { postProviderCoachChat } from "../controllers/providerCoachChatController.js";
import { protect } from "../middleware/authMiddleware.js";
import { aiCoachRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.post("/chat", protect, aiCoachRateLimiter, postProviderCoachChat);

export default router;
