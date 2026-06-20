import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { messageRateLimiter } from "../middleware/securityMiddleware.js";
import {
  getConversation,
  getConversationById,
  getConversations,
  markConversationRead,
  sendMessage,
  sendMessageToConversation,
  startConversation,
} from "../controllers/messageController.js";

const router = express.Router();

router.get("/conversations", protect, getConversations);
router.post("/start", protect, messageRateLimiter, startConversation);
router.get("/conversations/:conversationId", protect, getConversationById);
router.post("/conversations/:conversationId", protect, messageRateLimiter, sendMessageToConversation);
router.patch("/conversations/:conversationId/read", protect, markConversationRead);
router.post("/", protect, messageRateLimiter, sendMessage);
router.get("/", protect, getConversation);

export default router;
