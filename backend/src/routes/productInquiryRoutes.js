import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { requireProductMarketplaceEnabled } from "../middleware/productMarketplaceMiddleware.js";
import {
  createProductInquiry,
  listProductInquiries,
  updateProductInquiryStatus,
} from "../controllers/productOrderController.js";

const router = express.Router();

router.use(requireProductMarketplaceEnabled);
router.use(protect);
router.get("/mine", listProductInquiries);
router.post("/", requireRole("customer"), createProductInquiry);
router.patch("/:id/status", updateProductInquiryStatus);

export default router;
