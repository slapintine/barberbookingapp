import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { createReview, deleteReview, getMyReviews, getReviewsForBarber, updateReview } from "../controllers/reviewController.js";

const router = express.Router();

router.post("/", protect, createReview);
router.get("/me", protect, getMyReviews);
router.patch("/:reviewId", protect, updateReview);
router.delete("/:reviewId", protect, deleteReview);
router.get("/barber/:barberId", getReviewsForBarber);

export default router;
