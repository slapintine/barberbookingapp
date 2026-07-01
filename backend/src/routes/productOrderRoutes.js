import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { requireProductMarketplaceEnabled } from "../middleware/productMarketplaceMiddleware.js";
import {
  createProductOrder,
  getProductOrder,
  listCustomerOrders,
  listSellerOrders,
  updateProductOrderStatus,
} from "../controllers/productOrderController.js";

const router = express.Router();

router.use(requireProductMarketplaceEnabled);
router.use(protect);
router.get("/seller", requireRole("barber"), listSellerOrders);
router.get("/customer", listCustomerOrders);
router.post("/", requireRole("customer"), createProductOrder);
router.get("/:id", getProductOrder);
router.patch("/:id/status", updateProductOrderStatus);

export default router;
