import {
  assignBookingToStaff,
  assignStaffBranch,
  assignStaffService,
  buildAdvancedReport,
  createBranch,
  createCsvExport,
  createStaffInvitation,
  acceptStaffInvitation,
  createStaffProfile,
  deactivateStaffProfile,
  draftAdvancedProviderOperation,
  getProviderPlatinumDashboard,
  revokeStaffInvitation,
  setStaffSchedule,
} from "../services/providerPlatinumOperationsService.js";
import { getProviderEntitlementSnapshot } from "../services/entitlementService.js";

export async function getProviderPlatinumEntitlements(req, res, next) {
  try {
    const snapshot = await getProviderEntitlementSnapshot(req.user.id);
    res.json({ success: true, ...snapshot });
  } catch (error) {
    next(error);
  }
}

export async function getProviderPlatinumDashboardController(req, res, next) {
  try {
    const dashboard = await getProviderPlatinumDashboard(req.user.id);
    res.json({ success: true, ...dashboard });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumStaff(req, res, next) {
  try {
    const result = await createStaffProfile(req.user.id, req.body || {});
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function deleteProviderPlatinumStaff(req, res, next) {
  try {
    const result = await deactivateStaffProfile(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumBranch(req, res, next) {
  try {
    const result = await createBranch(req.user.id, req.body || {});
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumStaffService(req, res, next) {
  try {
    const result = await assignStaffService(req.user.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumStaffBranch(req, res, next) {
  try {
    const result = await assignStaffBranch(req.user.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function putProviderPlatinumStaffSchedule(req, res, next) {
  try {
    const result = await setStaffSchedule(req.user.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumBookingAssignment(req, res, next) {
  try {
    const result = await assignBookingToStaff(req.user.id, req.body || {});
    res.status(result.confirmationRequired ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumInvitation(req, res, next) {
  try {
    const result = await createStaffInvitation(req.user.id, req.body || {});
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumInvitationAccept(req, res, next) {
  try {
    const result = await acceptStaffInvitation(req.user.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function deleteProviderPlatinumInvitation(req, res, next) {
  try {
    const result = await revokeStaffInvitation(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getProviderPlatinumReport(req, res, next) {
  try {
    const report = await buildAdvancedReport(req.user.id, req.query || {});
    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumExport(req, res, next) {
  try {
    const result = await createCsvExport(req.user.id, req.body || {});
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  } catch (error) {
    next(error);
  }
}

export async function postProviderPlatinumAssistant(req, res, next) {
  try {
    const result = await draftAdvancedProviderOperation(req.user.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
