import { all, get } from "../db/query.js";
import { PROVIDER_ENTITLEMENTS, getProviderEntitlementSnapshot } from "./entitlementService.js";

export const PROVIDER_STAFF_ROLES = Object.freeze({
  OWNER: "owner",
  MANAGER: "manager",
  SCHEDULER: "scheduler",
  PROFESSIONAL: "service_professional",
  ANALYST: "view_only_analyst",
});

const PLATINUM_ENTITLEMENTS = new Set([
  PROVIDER_ENTITLEMENTS.STAFF_MANAGEMENT,
  PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS,
  PROVIDER_ENTITLEMENTS.STAFF_SCHEDULES,
  PROVIDER_ENTITLEMENTS.STAFF_ASSIGNMENT,
  PROVIDER_ENTITLEMENTS.STAFF_SERVICE_ASSIGNMENT,
  PROVIDER_ENTITLEMENTS.MULTIPLE_LOCATIONS,
  PROVIDER_ENTITLEMENTS.BRANCH_MANAGEMENT,
  PROVIDER_ENTITLEMENTS.BRANCH_SCHEDULES,
  PROVIDER_ENTITLEMENTS.BRANCH_ANALYTICS,
  PROVIDER_ENTITLEMENTS.ADVANCED_REPORTS,
  PROVIDER_ENTITLEMENTS.ADVANCED_EXPORTS,
  PROVIDER_ENTITLEMENTS.ADVANCED_ASSISTANT,
  PROVIDER_ENTITLEMENTS.CROSS_STAFF_OPTIMIZATION,
  PROVIDER_ENTITLEMENTS.CROSS_BRANCH_INSIGHTS,
  PROVIDER_ENTITLEMENTS.HIGHER_OPERATIONAL_LIMITS,
]);

const ACTIVE_BUSINESS_CLAUSE = "deleted_at IS NULL";

function httpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizeId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export function normalizeProviderStaffRole(value = "") {
  const role = String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (role === "receptionist") return PROVIDER_STAFF_ROLES.SCHEDULER;
  if (role === "professional" || role === "staff") return PROVIDER_STAFF_ROLES.PROFESSIONAL;
  return Object.values(PROVIDER_STAFF_ROLES).includes(role) ? role : PROVIDER_STAFF_ROLES.PROFESSIONAL;
}

export function getProviderRolePermissions(roleValue = PROVIDER_STAFF_ROLES.PROFESSIONAL, extras = {}) {
  const role = normalizeProviderStaffRole(roleValue);
  const owner = role === PROVIDER_STAFF_ROLES.OWNER;
  const manager = role === PROVIDER_STAFF_ROLES.MANAGER;
  const scheduler = role === PROVIDER_STAFF_ROLES.SCHEDULER;
  const professional = role === PROVIDER_STAFF_ROLES.PROFESSIONAL;
  const analyst = role === PROVIDER_STAFF_ROLES.ANALYST;
  return {
    role,
    manageSubscription: owner,
    manageStaff: owner || manager,
    manageRoles: owner,
    manageBranches: owner || manager,
    manageSchedules: owner || manager || scheduler,
    manageBookings: owner || manager || scheduler,
    assignBookings: owner || manager || scheduler,
    viewAllBookings: owner || manager || scheduler || analyst,
    viewAssignedBookings: owner || manager || scheduler || professional || analyst,
    viewAnalytics: owner || manager || analyst,
    viewReports: owner || manager || analyst,
    exportReports: owner || Boolean(extras.exportReports),
    useAdvancedAssistant: owner || manager || scheduler || analyst,
    updateOwnBookingStatus: owner || manager || scheduler || professional,
  };
}

function permissionForEntitlement(entitlementKey) {
  switch (entitlementKey) {
    case PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS:
    case PROVIDER_ENTITLEMENTS.STAFF_MANAGEMENT:
      return "manageStaff";
    case PROVIDER_ENTITLEMENTS.BRANCH_MANAGEMENT:
    case PROVIDER_ENTITLEMENTS.MULTIPLE_LOCATIONS:
      return "manageBranches";
    case PROVIDER_ENTITLEMENTS.STAFF_SCHEDULES:
    case PROVIDER_ENTITLEMENTS.BRANCH_SCHEDULES:
      return "manageSchedules";
    case PROVIDER_ENTITLEMENTS.STAFF_ASSIGNMENT:
    case PROVIDER_ENTITLEMENTS.STAFF_SERVICE_ASSIGNMENT:
      return "assignBookings";
    case PROVIDER_ENTITLEMENTS.BRANCH_ANALYTICS:
    case PROVIDER_ENTITLEMENTS.CROSS_BRANCH_INSIGHTS:
    case PROVIDER_ENTITLEMENTS.CROSS_STAFF_OPTIMIZATION:
      return "viewAnalytics";
    case PROVIDER_ENTITLEMENTS.ADVANCED_REPORTS:
      return "viewReports";
    case PROVIDER_ENTITLEMENTS.ADVANCED_EXPORTS:
      return "exportReports";
    case PROVIDER_ENTITLEMENTS.ADVANCED_ASSISTANT:
      return "useAdvancedAssistant";
    default:
      return "viewAllBookings";
  }
}

async function loadStaffScopes(staffId) {
  const [branches, services] = await Promise.all([
    all(`SELECT location_id FROM staff_location_assignments WHERE staff_id = ? AND COALESCE(is_active, 1) = 1`, [staffId]).catch(() => []),
    all(`SELECT service_id FROM staff_service_assignments WHERE staff_id = ? AND COALESCE(is_active, 1) = 1`, [staffId]).catch(() => []),
  ]);
  return {
    branchIds: branches.map((row) => Number(row.location_id)).filter(Boolean),
    serviceIds: services.map((row) => Number(row.service_id)).filter(Boolean),
  };
}

export async function resolveProviderMembershipContext(userId, options = {}) {
  const actorId = normalizeId(userId);
  if (!actorId) throw httpError(401, "Please log in to manage provider operations.");

  const requestedBusinessId = normalizeId(options.businessId);
  const ownerBusiness = requestedBusinessId
    ? await get(`SELECT * FROM barbers WHERE id = ? AND owner_user_id = ? AND ${ACTIVE_BUSINESS_CLAUSE}`, [requestedBusinessId, actorId])
    : await get(
        `SELECT * FROM barbers
         WHERE owner_user_id = ? AND ${ACTIVE_BUSINESS_CLAUSE}
         ORDER BY COALESCE(is_published, 0) DESC, id DESC
         LIMIT 1`,
        [actorId]
      );

  let business = ownerBusiness;
  let membership = null;
  let role = PROVIDER_STAFF_ROLES.OWNER;
  let permissions = getProviderRolePermissions(role);
  let scope = { branchIds: [], serviceIds: [] };

  if (!business) {
    membership = requestedBusinessId
      ? await get(
          `SELECT tm.*, b.owner_user_id, b.business_name
           FROM barber_team_members tm
           INNER JOIN barbers b ON b.id = tm.barber_id
           WHERE tm.user_id = ? AND tm.barber_id = ? AND COALESCE(tm.is_active, 1) = 1 AND b.${ACTIVE_BUSINESS_CLAUSE}
           LIMIT 1`,
          [actorId, requestedBusinessId]
        )
      : await get(
          `SELECT tm.*, b.owner_user_id, b.business_name
           FROM barber_team_members tm
           INNER JOIN barbers b ON b.id = tm.barber_id
           WHERE tm.user_id = ? AND COALESCE(tm.is_active, 1) = 1 AND b.${ACTIVE_BUSINESS_CLAUSE}
           ORDER BY tm.updated_at DESC, tm.id DESC
           LIMIT 1`,
          [actorId]
        );
    if (!membership) throw httpError(403, "You do not have access to this provider business.", "PROVIDER_ACCESS_DENIED");
    business = await get(`SELECT * FROM barbers WHERE id = ? AND ${ACTIVE_BUSINESS_CLAUSE}`, [membership.barber_id]);
    role = normalizeProviderStaffRole(membership.role);
    permissions = getProviderRolePermissions(role);
    scope = await loadStaffScopes(membership.id);
  }

  const snapshot = await getProviderEntitlementSnapshot(business.owner_user_id || actorId);
  const entitlementKey = options.entitlement;
  if (entitlementKey && !snapshot.entitlements?.[entitlementKey]) {
    const error = httpError(
      403,
      PLATINUM_ENTITLEMENTS.has(entitlementKey) ? "Provider Platinum is required for this feature." : "Provider Premium is required for this feature.",
      PLATINUM_ENTITLEMENTS.has(entitlementKey) ? "PROVIDER_PLATINUM_REQUIRED" : "PROVIDER_PREMIUM_REQUIRED"
    );
    error.entitlement = entitlementKey;
    throw error;
  }

  const requiredPermission = options.permission || (entitlementKey ? permissionForEntitlement(entitlementKey) : "");
  if (requiredPermission && !permissions[requiredPermission]) {
    throw httpError(403, "Your staff role does not allow this provider operation.", "PROVIDER_ROLE_DENIED");
  }

  return {
    actorUserId: actorId,
    business,
    snapshot,
    membership: membership ? { ...membership, permissions, scope } : null,
    role,
    permissions,
    scope,
    isOwner: !membership,
  };
}
