import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getMyWallet, handlePesapalIpn, requestWithdrawal, topUpMyWallet, verifyWalletTopUp } from "../controllers/walletController.js";

const router = express.Router();

router.get("/me", protect, getMyWallet);
router.post("/top-up", protect, topUpMyWallet);
router.post("/top-up/verify", protect, verifyWalletTopUp);
router.get("/pesapal/ipn", handlePesapalIpn);
router.post("/pesapal/ipn", handlePesapalIpn);
router.post("/withdraw", protect, requestWithdrawal);

export default router;
