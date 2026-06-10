import { get } from "../db/query.js";
import { getLatestProviderSubscription, isActiveProviderPlatinum } from "../services/providerSubscriptionAccess.js";

export async function requireBusinessOwner(req, res, next) {
  try {
    const businessId = Number(req.params.businessId || req.params.barberId || req.body.businessId || req.body.barberId);
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({ success: false, message: "Valid business id is required." });
    }

    const business = await get(`SELECT * FROM barbers WHERE id = ? AND deleted_at IS NULL`, [businessId]);
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found." });
    }

    if (Number(business.owner_user_id) !== Number(req.user?.id)) {
      return res.status(403).json({ success: false, message: "You can only access this feature for your own business." });
    }

    req.business = business;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireProviderPlatinum(req, res, next) {
  try {
    const business = req.business;
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found." });
    }

    const latestSubscription = await getLatestProviderSubscription(business.id);
    if (!isActiveProviderPlatinum(business, latestSubscription)) {
      return res.status(403).json({
        success: false,
        code: "PLATINUM_REQUIRED",
        message: "Upgrade to Platinum for unlimited Provider Coach.",
      });
    }

    req.providerSubscription = latestSubscription;
    next();
  } catch (error) {
    next(error);
  }
}
