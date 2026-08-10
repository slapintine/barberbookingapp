import express from "express";
import {
  deleteEarlierSlotAlert,
  getCustomerPremiumEntitlements,
  getEarlierSlotAlerts,
  getRebookingOptions,
  postEarlierSlotAlert,
} from "../controllers/customerPremiumFeatureController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.use(protect, requireRole("customer"));

router.get("/entitlements", getCustomerPremiumEntitlements);
router.get("/rebooking-options", getRebookingOptions);
router.get("/slot-alerts", getEarlierSlotAlerts);
router.post("/slot-alerts", validateRequest(schemas.earlierSlotAlertCreate), postEarlierSlotAlert);
router.delete("/slot-alerts/:id", validateRequest(schemas.earlierSlotAlertDelete), deleteEarlierSlotAlert);

export default router;
