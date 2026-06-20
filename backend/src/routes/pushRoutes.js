import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getPushPublicKey,
  savePushSubscription,
  removePushSubscription,
} from "../controllers/pushController.js";

const router = express.Router();

router.get("/public-key", getPushPublicKey);
router.post("/subscribe", protect, savePushSubscription);
router.post("/unsubscribe", protect, removePushSubscription);

export default router;
