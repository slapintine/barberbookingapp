import express from "express";
import { confirmPasswordReset, getMe, loginUser, logoutSession, refreshSession, registerUser, requestPasswordReset, sendEmailVerification, sendPhoneOtp, updateAccount, verifyOtp } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authRateLimiter, otpRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.post("/register", authRateLimiter, registerUser);
router.post("/login", authRateLimiter, loginUser);
router.post("/refresh", refreshSession);
router.post("/logout", logoutSession);
router.post("/password-reset/request", otpRateLimiter, requestPasswordReset);
router.post("/password-reset/confirm", otpRateLimiter, confirmPasswordReset);
router.post("/send-email-verification", protect, otpRateLimiter, sendEmailVerification);
router.post("/send-phone-otp", protect, otpRateLimiter, sendPhoneOtp);
router.post("/verify-otp", protect, otpRateLimiter, verifyOtp);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateAccount);

export default router;
