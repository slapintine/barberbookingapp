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

const router = express.Router();

router.get("/me", protect, getMyWallet);
router.get("/customer", protect, requireRole("customer"), getCustomerWallet);
router.get("/customer/transactions", protect, requireRole("customer"), getCustomerWalletTransactions);
router.post("/customer/topup/initiate", protect, requireRole("customer"), walletTopupRateLimiter, initiateCustomerWalletTopup);
router.get("/customer/topup/status/:reference", protect, requireRole("customer"), getCustomerWalletTopupStatus);
router.post("/top-up/initiate", protect, requireRole("customer"), walletTopupRateLimiter, initiateCustomerWalletTopup);
router.get("/top-up/status/:reference", protect, requireRole("customer"), getCustomerWalletTopupStatus);
router.post("/top-up", protect, walletTopupRateLimiter, topUpMyWallet);
router.post("/top-up/verify", protect, walletTopupRateLimiter, verifyWalletTopUp);
router.post("/withdraw", protect, requestWithdrawal);

export default router;
