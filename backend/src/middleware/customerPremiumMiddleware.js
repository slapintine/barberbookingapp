import { getActiveCustomerPremiumSubscription } from "../services/customerSubscriptionService.js";

export async function requireCustomerPremium(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authorized. No token provided." });
    }

    const subscription = await getActiveCustomerPremiumSubscription(req.user.id);
    if (!subscription) {
      return res.status(403).json({
        success: false,
        code: "CUSTOMER_PREMIUM_REQUIRED",
        message: "Smart Match is a Premium feature. Upgrade or verify your pending Premium payment to unlock it.",
      });
    }

    req.customerSubscription = subscription;
    next();
  } catch (error) {
    next(error);
  }
}
