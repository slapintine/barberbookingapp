import {
  createProviderPromotion,
  createProviderResponseDraft,
  getProviderPremiumDashboard,
} from "../services/providerPremiumFeatureService.js";
import { getProviderEntitlementSnapshot } from "../services/entitlementService.js";

export async function getProviderPremiumEntitlements(req, res, next) {
  try {
    const snapshot = await getProviderEntitlementSnapshot(req.user.id);
    res.json({ success: true, ...snapshot });
  } catch (error) {
    next(error);
  }
}

export async function getProviderPremiumDashboardController(req, res, next) {
  try {
    const result = await getProviderPremiumDashboard(req.user.id, { range: req.query?.range });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPromotion(req, res, next) {
  try {
    const result = await createProviderPromotion(req.user.id, req.body || {});
    res.status(result.confirmationRequired ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderResponseDraft(req, res, next) {
  try {
    const result = await createProviderResponseDraft(req.user.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
