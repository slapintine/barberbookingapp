import {
  cancelEarlierSlotAlert,
  createEarlierSlotAlert,
  getCustomerPlanSnapshot,
  getSmartRebookingOptions,
  listEarlierSlotAlerts,
} from "../services/customerPremiumFeatureService.js";

function handlePremiumError(error, res, next) {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code || "",
      message: error.message,
    });
  }
  return next(error);
}

export async function getCustomerPremiumEntitlements(req, res, next) {
  try {
    const snapshot = await getCustomerPlanSnapshot(req.user.id);
    return res.json({ success: true, ...snapshot });
  } catch (error) {
    return handlePremiumError(error, res, next);
  }
}

export async function getRebookingOptions(req, res, next) {
  try {
    const options = await getSmartRebookingOptions(req.user.id);
    return res.json({ success: true, options });
  } catch (error) {
    return handlePremiumError(error, res, next);
  }
}

export async function getEarlierSlotAlerts(req, res, next) {
  try {
    const alerts = await listEarlierSlotAlerts(req.user.id);
    return res.json({ success: true, alerts, delivery: "in_app" });
  } catch (error) {
    return handlePremiumError(error, res, next);
  }
}

export async function postEarlierSlotAlert(req, res, next) {
  try {
    const alert = await createEarlierSlotAlert(req.user.id, req.body || {});
    return res.status(201).json({ success: true, alert, delivery: "in_app" });
  } catch (error) {
    return handlePremiumError(error, res, next);
  }
}

export async function deleteEarlierSlotAlert(req, res, next) {
  try {
    const alert = await cancelEarlierSlotAlert(req.user.id, Number(req.params.id));
    return res.json({ success: true, alert });
  } catch (error) {
    return handlePremiumError(error, res, next);
  }
}
