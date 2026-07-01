import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { requireProductMarketplaceEnabled } from "../middleware/productMarketplaceMiddleware.js";
import {
  browseProducts,
  createProduct,
  deleteProduct,
  getMyProduct,
  getPublicProduct,
  listStandProducts,
  listMyProducts,
  updateProduct,
  updateProductStock,
} from "../controllers/productController.js";

const router = express.Router();

router.use(requireProductMarketplaceEnabled);
router.get("/", browseProducts);
router.get("/stand/:standId", listStandProducts);
router.get("/mine", protect, requireRole("barber"), listMyProducts);
router.get("/mine/:id", protect, requireRole("barber"), getMyProduct);
router.post("/", protect, requireRole("barber"), createProduct);
router.patch("/:id/stock", protect, requireRole("barber"), updateProductStock);
router.patch("/:id", protect, requireRole("barber"), updateProduct);
router.delete("/:id", protect, requireRole("barber"), deleteProduct);
router.get("/:id", getPublicProduct);

export default router;
