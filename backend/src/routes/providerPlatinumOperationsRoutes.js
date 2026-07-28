import express from "express";
import {
  deleteProviderPlatinumStaff,
  getProviderPlatinumDashboardController,
  getProviderPlatinumEntitlements,
  getProviderPlatinumReport,
  deleteProviderPlatinumInvitation,
  postProviderPlatinumAssistant,
  postProviderPlatinumBookingAssignment,
  postProviderPlatinumBranch,
  postProviderPlatinumExport,
  postProviderPlatinumInvitationAccept,
  postProviderPlatinumInvitation,
  postProviderPlatinumStaff,
  postProviderPlatinumStaffBranch,
  postProviderPlatinumStaffService,
  putProviderPlatinumStaffSchedule,
} from "../controllers/providerPlatinumOperationsController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";

const router = express.Router();

router.use(protect);

router.get("/entitlements", getProviderPlatinumEntitlements);
router.get("/dashboard", getProviderPlatinumDashboardController);
router.post("/staff", validateRequest(schemas.providerPlatinumStaffCreate), postProviderPlatinumStaff);
router.delete("/staff/:id", validateRequest(schemas.providerPlatinumStaffDelete), deleteProviderPlatinumStaff);
router.post("/branches", validateRequest(schemas.providerPlatinumBranchCreate), postProviderPlatinumBranch);
router.post("/staff-services", validateRequest(schemas.providerPlatinumStaffServiceAssign), postProviderPlatinumStaffService);
router.post("/staff-branches", validateRequest(schemas.providerPlatinumStaffBranchAssign), postProviderPlatinumStaffBranch);
router.put("/staff-schedules", validateRequest(schemas.providerPlatinumStaffScheduleUpsert), putProviderPlatinumStaffSchedule);
router.post("/booking-assignments", validateRequest(schemas.providerPlatinumBookingAssignment), postProviderPlatinumBookingAssignment);
router.post("/invitations", validateRequest(schemas.providerPlatinumInvitationCreate), postProviderPlatinumInvitation);
router.post("/invitations/accept", validateRequest(schemas.providerPlatinumInvitationAccept), postProviderPlatinumInvitationAccept);
router.delete("/invitations/:id", validateRequest(schemas.providerPlatinumInvitationDelete), deleteProviderPlatinumInvitation);
router.get("/reports", validateRequest(schemas.providerPlatinumReportQuery), getProviderPlatinumReport);
router.post("/exports", validateRequest(schemas.providerPlatinumExportCreate), postProviderPlatinumExport);
router.post("/assistant", validateRequest(schemas.providerPlatinumAssistant), postProviderPlatinumAssistant);

export default router;
