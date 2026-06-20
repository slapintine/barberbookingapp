import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { createReview, deleteReview, getManagedReviewsForBarber, getMyReviews, getReviewsForBarber, setReviewPublicBlock, updateReview } from "../controllers/reviewController.js";
import { reviewRateLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.post("/", protect, reviewRateLimiter, createReview);
router.get("/me", protect, getMyReviews);
router.get("/barber/:barberId/manage", protect, requireRole("barber", "admin"), getManagedReviewsForBarber);
router.patch("/:reviewId/public-block", protect, requireRole("barber", "admin"), reviewRateLimiter, setReviewPublicBlock);
router.patch("/:reviewId", protect, reviewRateLimiter, updateReview);
router.delete("/:reviewId", protect, reviewRateLimiter, deleteReview);
router.get("/barber/:barberId", getReviewsForBarber);

export default router;
