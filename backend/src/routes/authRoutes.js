import express from "express";
import { confirmPasswordReset, getMe, loginUser, logoutSession, refreshSession, registerUser, requestPasswordReset, sendEmailVerification, updateAccount, verifyOtp } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authRateLimiter, otpRateLimiter } from "../middleware/securityMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.post("/register", authRateLimiter, validateRequest(schemas.register), registerUser);
router.post("/login", authRateLimiter, validateRequest(schemas.login), loginUser);
router.post("/refresh", refreshSession);
router.post("/logout", logoutSession);
router.post("/password-reset/request", otpRateLimiter, validateRequest(schemas.passwordResetRequest), requestPasswordReset);
router.post("/password-reset/confirm", otpRateLimiter, validateRequest(schemas.passwordResetConfirm), confirmPasswordReset);
router.post("/send-email-verification", protect, otpRateLimiter, sendEmailVerification);
router.post("/verify-otp", protect, otpRateLimiter, verifyOtp);
router.get("/me", protect, getMe);
router.patch("/me", protect, validateRequest(schemas.accountUpdate), updateAccount);

export default router;
