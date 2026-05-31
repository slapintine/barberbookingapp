import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  checkout,
  checkMtnAuth,
  getMtnHealth,
  getMtnPaymentStatus,
  getWalletSummary,
  handleAirtelWebhook,
  handleMtnWebhook,
  initiateMtnPayment,
  requestPayout,
  testMtnPaymentInitiation,
  verify,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/checkout", protect, requireRole("customer"), checkout);
router.post("/verify", protect, requireRole("customer"), verify);
router.get("/wallet", protect, requireRole("barber"), getWalletSummary);
router.post("/payouts", protect, requireRole("barber"), requestPayout);
router.post("/withdrawals", protect, requireRole("barber"), requestPayout);
router.post("/bookings/:id/verify", protect, requireRole("customer"), verify);
router.get("/mtn/health", getMtnHealth);
router.post("/mtn/initiate", protect, requireRole("customer"), initiateMtnPayment);
router.get("/mtn/status/:reference", protect, getMtnPaymentStatus);
router.get("/mtn/check-auth", protect, requireRole("admin"), checkMtnAuth);
router.post("/mtn/test-payment", protect, requireRole("admin"), testMtnPaymentInitiation);
router.post("/mtn/callback", handleMtnWebhook);
router.post("/airtel/callback", handleAirtelWebhook);
router.post("/webhooks/mtn", handleMtnWebhook);
router.post("/webhooks/airtel", handleAirtelWebhook);
router.post("/webhooks/mobile-money", handleMtnWebhook);

export default router;
