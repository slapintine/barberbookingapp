import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  checkout,
  getWalletSummary,
  handleAirtelWebhook,
  handleMtnWebhook,
  requestPayout,
  verify,
} from "../controllers/paymentController.js";
import { handlePesapalIpn } from "../controllers/walletController.js";

const router = express.Router();

router.post("/checkout", protect, requireRole("customer"), checkout);
router.post("/verify", protect, requireRole("customer"), verify);
router.get("/wallet", protect, requireRole("barber"), getWalletSummary);
router.post("/payouts", protect, requireRole("barber"), requestPayout);
router.post("/withdrawals", protect, requireRole("barber"), requestPayout);
router.post("/bookings/:id/verify", protect, requireRole("customer"), verify);
router.post("/webhooks/mtn", handleMtnWebhook);
router.post("/webhooks/airtel", handleAirtelWebhook);
router.post("/webhooks/mobile-money", handleMtnWebhook);
router.get("/webhooks/pesapal", handlePesapalIpn);
router.post("/webhooks/pesapal", handlePesapalIpn);

export default router;
