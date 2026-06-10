import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { imageUploadRateLimiter, providerRegistrationRateLimiter } from "../middleware/securityMiddleware.js";
import {
  getAllBarbers,
  getMyBarberProfile,
  registerBarber,
  getMyBarberSchedule,
  updateMyBarberSchedule,
  updateMyBarberProfile,
  deleteMyBarberProfile,
  publishMyBarberStand,
} from "../controllers/barberController.js";

const router = express.Router();

router.get("/", getAllBarbers);
router.get("/me", protect, getMyBarberProfile);
router.post("/register", protect, providerRegistrationRateLimiter, imageUploadRateLimiter, registerBarber);
router.patch("/me", protect, imageUploadRateLimiter, updateMyBarberProfile);
router.post("/me/publish", protect, publishMyBarberStand);
router.delete("/me", protect, deleteMyBarberProfile);
router.get("/me/schedule", protect, getMyBarberSchedule);
router.put("/me/schedule", protect, updateMyBarberSchedule);

export default router;
