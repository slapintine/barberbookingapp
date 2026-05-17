import express from "express";
import { getAdminOverview, updateAdminBusiness } from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, requireRole("admin"));

router.get("/overview", getAdminOverview);
router.patch("/businesses/:id", updateAdminBusiness);

export default router;
