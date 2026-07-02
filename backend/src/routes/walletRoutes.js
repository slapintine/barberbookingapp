import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { walletTopupRateLimiter } from "../middleware/securityMiddleware.js";
import {
  getCustomerWallet,
  getCustomerWalletTopupStatus,
  getCustomerWalletTransactions,
  getMyWallet,
  initiateCustomerWalletTopup,
  requestWithdrawal,
  topUpMyWallet,
  verifyWalletTopUp,
} from "../controllers/walletController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.get("/me", protect, requireRole("barber"), getMyWallet);
router.get("/customer", protect, requireRole("customer"), getCustomerWallet);
router.get("/customer/transactions", protect, requireRole("customer"), getCustomerWalletTransactions);
router.post("/customer/topup/initiate", protect, requireRole("customer"), walletTopupRateLimiter, validateRequest(schemas.walletAmount), initiateCustomerWalletTopup);
router.get("/customer/topup/status/:reference", protect, requireRole("customer"), getCustomerWalletTopupStatus);
router.post("/top-up/initiate", protect, requireRole("customer"), walletTopupRateLimiter, validateRequest(schemas.walletAmount), initiateCustomerWalletTopup);
router.get("/top-up/status/:reference", protect, requireRole("customer"), getCustomerWalletTopupStatus);
router.post("/top-up", protect, requireRole("customer"), walletTopupRateLimiter, validateRequest(schemas.walletAmount), topUpMyWallet);
router.post("/top-up/verify", protect, requireRole("customer"), walletTopupRateLimiter, verifyWalletTopUp);
router.post("/withdraw", protect, requireRole("barber"), validateRequest(schemas.walletAmount), requestWithdrawal);

export default router;
