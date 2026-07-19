import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead
} from "../controllers/notificationController.js";
import {
  getTokenStatus,
  registerToken,
  sendTestNotification,
  unregisterToken,
} from "../controllers/firebaseNotificationController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.get("/me", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadNotificationCount);
router.post("/register-token", protect, validateRequest(schemas.notificationRegister), registerToken);
router.post("/unregister-token", protect, validateRequest(schemas.notificationUnregister), unregisterToken);
router.post("/token-status", protect, validateRequest(schemas.notificationUnregister), getTokenStatus);
router.post("/test", protect, sendTestNotification);
router.patch("/read-all", protect, markAllNotificationsRead);
router.patch("/:id/read", protect, markNotificationRead);

export default router;
