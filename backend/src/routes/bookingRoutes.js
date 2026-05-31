import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  createBooking,
  confirmCashPayment,
  getBarberDayAvailability,
  getMyBookings,
  payBookingWithWallet,
  verifyBookingPayment,
  updateBookingStatus
} from "../controllers/bookingController.js";

const router = express.Router();

router.post("/", protect, requireRole("customer"), createBooking);
router.get("/availability", protect, getBarberDayAvailability);
router.get("/me", protect, getMyBookings);
router.patch("/:id/payment/cash", protect, confirmCashPayment);
router.post("/:id/pay-with-wallet", protect, requireRole("customer"), payBookingWithWallet);
router.post("/:id/payment/verify", protect, requireRole("customer"), verifyBookingPayment);
router.patch("/:id/status", protect, updateBookingStatus);

export default router;
