import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getMyProfile, upsertMyProfile } from "../controllers/profileController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.put("/me", protect, validateRequest(schemas.profileUpdate), upsertMyProfile);

export default router;