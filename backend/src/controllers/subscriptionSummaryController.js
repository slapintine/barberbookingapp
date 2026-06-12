import { buildSubscriptionSummary } from "../services/subscriptionSummaryService.js";
import { getSubscriptionPlans } from "../services/paymentService.js";

export async function getMySubscriptionSummary(req, res, next) {
  try {
    const summary = await buildSubscriptionSummary(req.user.id);
    res.json({
      success: true,
      ...summary,
      providerPlans: getSubscriptionPlans(),
    });
  } catch (error) {
    next(error);
  }
}
