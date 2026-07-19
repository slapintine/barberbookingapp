import express from "express";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { imageUploadRateLimiter, providerRegistrationRateLimiter } from "../middleware/securityMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";
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

router.get("/", optionalAuth, getAllBarbers);
router.get("/me", protect, getMyBarberProfile);
router.post("/register", protect, providerRegistrationRateLimiter, imageUploadRateLimiter, validateRequest(schemas.standUpsert), registerBarber);
router.patch("/me", protect, imageUploadRateLimiter, validateRequest(schemas.standUpsert), updateMyBarberProfile);
router.post("/me/publish", protect, publishMyBarberStand);
router.delete("/me", protect, deleteMyBarberProfile);
router.get("/me/schedule", protect, getMyBarberSchedule);
router.put("/me/schedule", protect, validateRequest(schemas.scheduleUpdate), updateMyBarberSchedule);

export default router;
