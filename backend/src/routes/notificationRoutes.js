import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMyNotifications,
  markNotificationRead
} from "../controllers/notificationController.js";
import {
  registerToken,
  sendTestNotification,
  unregisterToken,
} from "../controllers/firebaseNotificationController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.get("/me", protect, getMyNotifications);
router.post("/register-token", protect, validateRequest(schemas.notificationRegister), registerToken);
router.post("/unregister-token", protect, validateRequest(schemas.notificationUnregister), unregisterToken);
router.post("/test", protect, sendTestNotification);
router.patch("/:id/read", protect, markNotificationRead);

export default router;
