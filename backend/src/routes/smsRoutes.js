import express from "express";
import { getAdminSmsMessages, receiveIncomingSms, sendSmsFromAdmin } from "../controllers/smsController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { smsSendRateLimiter, smsWebhookRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.post("/incoming", smsWebhookRateLimiter, receiveIncomingSms);
router.post("/send", smsSendRateLimiter, protect, requireRole("admin"), sendSmsFromAdmin);
router.get("/admin/messages", protect, requireRole("admin"), getAdminSmsMessages);

export default router;
