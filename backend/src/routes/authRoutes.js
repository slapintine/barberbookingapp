import express from "express";
import { confirmPasswordReset, getMe, loginUser, registerUser, requestPasswordReset, sendEmailVerification, sendPhoneOtp, updateAccount, verifyOtp } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/confirm", confirmPasswordReset);
router.post("/send-email-verification", protect, sendEmailVerification);
router.post("/send-phone-otp", protect, sendPhoneOtp);
router.post("/verify-otp", protect, verifyOtp);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateAccount);

export default router;
