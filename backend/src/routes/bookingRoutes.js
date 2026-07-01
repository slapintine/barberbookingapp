import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  createBooking,
  confirmCashPayment,
  getBarberDayAvailability,
  getMyBookings,
  payBookingWithWallet,
  rescheduleBooking,
  verifyBookingPayment,
  updateBookingStatus
} from "../controllers/bookingController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.post("/", protect, requireRole("customer"), validateRequest(schemas.bookingCreate), createBooking);
router.get("/availability", protect, getBarberDayAvailability);
router.get("/me", protect, getMyBookings);
router.patch("/:id/payment/cash", protect, requireRole("barber"), confirmCashPayment);
router.post("/:id/pay-with-wallet", protect, requireRole("customer"), payBookingWithWallet);
router.post("/:id/payment/verify", protect, requireRole("customer"), verifyBookingPayment);
router.patch("/:id/reschedule", protect, rescheduleBooking);
router.patch("/:id/status", protect, validateRequest(schemas.bookingStatus), updateBookingStatus);

export default router;
