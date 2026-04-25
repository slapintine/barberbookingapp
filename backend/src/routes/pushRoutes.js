import express from "express";
import {
  getPushPublicKey,
  savePushSubscription,
  removePushSubscription,
} from "../controllers/pushController.js";

const router = express.Router();

router.get("/public-key", getPushPublicKey);
router.post("/subscribe", savePushSubscription);
router.post("/unsubscribe", removePushSubscription);

export default router;