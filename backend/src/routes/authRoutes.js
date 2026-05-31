import express from "express";
import { confirmPasswordReset, getMe, loginUser, registerUser, requestPasswordReset, sendEmailVerification, sendPhoneOtp, updateAccount, verifyOtp } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { otpRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/password-reset/request", otpRateLimiter, requestPasswordReset);
router.post("/password-reset/confirm", otpRateLimiter, confirmPasswordReset);
router.post("/send-email-verification", protect, otpRateLimiter, sendEmailVerification);
router.post("/send-phone-otp", protect, otpRateLimiter, sendPhoneOtp);
router.post("/verify-otp", protect, otpRateLimiter, verifyOtp);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateAccount);

export default router;
