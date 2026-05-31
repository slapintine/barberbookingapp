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
router.patch("/customers/:userId/subscription", updateAdminCustomerSubscription);
router.patch("/businesses/:businessId/subscription", updateAdminProviderSubscription);
router.get("/payments", getAdminPayments);
router.get("/payments/:paymentId", getAdminPayment);
router.get("/sms", getAdminSmsMessages);
router.get("/system-health", getAdminSystemHealth);
router.post("/notifications/announcement", sendAnnouncement);
router.get("/deployment-readiness", getAdminDeploymentReadiness);
router.get("/provider-publication-readiness", getAdminProviderPublicationReadiness);
router.post("/deployment-readiness/cleanup-demo-businesses", cleanupAdminDemoBusinesses);
router.post("/deployment-readiness/remediate", remediateAdminDeploymentReadiness);
router.post("/test-feature-access", runAdminFeatureAccessTest);
router.post("/access-test", runAdminAccessTest);
router.get("/audit-log", getAdminAuditLog);
router.get("/reviews", getAdminReviews);
router.get("/support-requests", getAdminSupportRequests);
router.patch("/support-requests/:id", updateAdminSupportRequest);
router.patch("/businesses/:id", updateAdminBusiness);

export default router;
