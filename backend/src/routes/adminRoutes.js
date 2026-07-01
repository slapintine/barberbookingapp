import express from "express";
import {
  getAdminAuditLog,
  getAdminBookings,
  getAdminBusinesses,
  getAdminCustomerSubscriptions,
  cleanupAdminDemoBusinesses,
  getAdminDeploymentReadiness,
  getAdminOverview,
  getAdminPayment,
  getAdminPayments,
  getAdminProviderSubscriptions,
  getAdminProviderPublicationReadiness,
  getAdminReviews,
  getAdminSupportRequests,
  getAdminSubscriptions,
  getAdminSummary,
  getAdminSystemHealth,
  getAdminUsers,
  getAdminSubscriptionSummary,
  remediateAdminDeploymentReadiness,
  runAdminFeatureAccessTest,
  runAdminAccessTest,
  updateAdminBusiness,
  updateAdminSupportRequest,
  updateAdminCustomerSubscription,
  updateAdminProviderSubscription,
} from "../controllers/adminController.js";
import { getAdminSmsMessages } from "../controllers/smsController.js";
import { sendAnnouncement } from "../controllers/firebaseNotificationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { schemas } from "../validation/schemas.js";
import { getSecurityAuditLogs } from "../controllers/auditLogController.js";

const router = express.Router();

router.use(protect, requireRole("admin"));

router.get("/summary", getAdminSummary);
router.get("/overview", getAdminOverview);
router.get("/users", getAdminUsers);
router.get("/businesses", getAdminBusinesses);
router.get("/bookings", getAdminBookings);
router.get("/subscriptions", getAdminSubscriptions);
router.get("/subscriptions/summary", getAdminSubscriptionSummary);
router.get("/customers/subscriptions", getAdminCustomerSubscriptions);
router.get("/providers/subscriptions", getAdminProviderSubscriptions);
router.patch("/customers/:userId/subscription", validateRequest(schemas.adminCustomerSubscription), updateAdminCustomerSubscription);
router.patch("/businesses/:businessId/subscription", validateRequest(schemas.adminProviderSubscription), updateAdminProviderSubscription);
router.get("/payments", getAdminPayments);
router.get("/payments/:paymentId", getAdminPayment);
router.get("/sms", getAdminSmsMessages);
router.get("/system-health", getAdminSystemHealth);
router.post("/notifications/announcement", validateRequest(schemas.adminAnnouncement), sendAnnouncement);
router.get("/deployment-readiness", getAdminDeploymentReadiness);
router.get("/provider-publication-readiness", getAdminProviderPublicationReadiness);
router.post("/deployment-readiness/cleanup-demo-businesses", cleanupAdminDemoBusinesses);
router.post("/deployment-readiness/remediate", remediateAdminDeploymentReadiness);
router.post("/test-feature-access", runAdminFeatureAccessTest);
router.post("/access-test", runAdminAccessTest);
router.get("/audit-log", getAdminAuditLog);
router.get("/security-audit-logs", validateRequest(schemas.adminAuditLogQuery), getSecurityAuditLogs);
router.get("/reviews", getAdminReviews);
router.get("/support-requests", getAdminSupportRequests);
router.patch("/support-requests/:id", validateRequest(schemas.adminSupportRequestUpdate), updateAdminSupportRequest);
router.patch("/businesses/:id", validateRequest(schemas.adminBusinessUpdate), updateAdminBusiness);

export default router;
