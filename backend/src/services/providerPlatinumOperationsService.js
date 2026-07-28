import crypto from "node:crypto";
import { all, get, run, transaction } from "../db/query.js";
import { PROVIDER_ENTITLEMENTS } from "./entitlementService.js";
import { resolveProviderMembershipContext, getProviderRolePermissions } from "./providerMembershipService.js";

export const STAFF_ROLES = Object.freeze({
  OWNER: "owner",
  MANAGER: "manager",
  SCHEDULER: "scheduler",
  PROFESSIONAL: "service_professional",
  ANALYST: "view_only_analyst",
});

export const PLATINUM_REPORT_TYPES = Object.freeze(["bookings", "revenue", "branches", "staff", "services", "cancellations"]);
const ACTIVE_BOOKING_STATUSES = new Set(["payment_pending", "pending", "confirmed", "arrived", "ready", "service_started"]);
const TERMINAL_BOOKING_STATUSES = new Set(["completed", "cancelled", "canceled", "rejected", "no_show"]);
const EXPORT_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const EXPORT_LIMIT_MAX = 3;
const MAX_EXPORT_DAYS = 366;
const exportRateBuckets = new Map();

function httpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function clean(value = "", limit = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function normalizeDate(value = "") {
  const text = clean(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeTime(value = "") {
  const text = clean(value, 8).slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function minutesFromTime(value = "") {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function bookingDate(booking = {}) {
  return String(booking.booking_date || booking.date || "").slice(0, 10);
}

function bookingTime(booking = {}) {
  return normalizeTime(booking.booking_time || booking.time || "");
}

function bookingDuration(booking = {}) {
  return Math.max(15, Number(booking.service_duration_minutes || booking.duration_minutes || 30));
}

function bookingStatus(booking = {}) {
  return String(booking.status || "").trim().toLowerCase();
}

function bookingPrice(booking = {}) {
  const pricingType = String(booking.pricing_type || booking.price_type || "").toLowerCase();
  if (pricingType === "quote" || Number(booking.requires_quote || 0) === 1) return null;
  const amount = Number(booking.price ?? booking.total_price ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function rangesOverlap(startA, endA, startB, endB, transitionMinutes = 0) {
  return startA < endB + transitionMinutes && endA + transitionMinutes > startB;
}

function auditPayload(value = {}) {
  return JSON.stringify(value).slice(0, 4000);
}

function hashInvitationToken(token = "") {
  return crypto.createHash("sha256").update(String(token || "").trim()).digest("hex");
}

function daysBetween(start, end) {
  const from = new Date(`${start}T00:00:00+03:00`).getTime();
  const to = new Date(`${end}T00:00:00+03:00`).getTime();
  return Math.floor((to - from) / 86400000) + 1;
}

function enforceExportRateLimit(userId, businessId) {
  const key = `${businessId}:${userId}`;
  const now = Date.now();
  const bucket = (exportRateBuckets.get(key) || []).filter((timestamp) => now - timestamp < EXPORT_LIMIT_WINDOW_MS);
  if (bucket.length >= EXPORT_LIMIT_MAX) {
    throw httpError(429, "Too many exports requested. Please wait before exporting again.", "EXPORT_RATE_LIMITED");
  }
  bucket.push(now);
  exportRateBuckets.set(key, bucket);
}

export function normalizeStaffRole(value = "") {
  const role = clean(value, 80).toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (role === "receptionist") return STAFF_ROLES.SCHEDULER;
  if (role === "professional" || role === "staff") return STAFF_ROLES.PROFESSIONAL;
  return Object.values(STAFF_ROLES).includes(role) ? role : STAFF_ROLES.PROFESSIONAL;
}

export function rolePermissions(roleValue = STAFF_ROLES.PROFESSIONAL) {
  const role = normalizeStaffRole(roleValue);
  return getProviderRolePermissions(role, { exportReports: [STAFF_ROLES.OWNER, STAFF_ROLES.ANALYST].includes(role) });
}

export function protectCsvCell(value = "") {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCsv(rows = [], columns = []) {
  const header = columns.map((column) => protectCsvCell(column.label || column.key)).join(",");
  const body = rows.map((row) => columns.map((column) => protectCsvCell(row[column.key] ?? "")).join(",")).join("\n");
  return `${header}${body ? `\n${body}` : ""}\n`;
}

export function validateStaffPayload(payload = {}) {
  const displayName = clean(payload.displayName || payload.display_name || payload.name, 120);
  const role = normalizeStaffRole(payload.role);
  const email = clean(payload.email, 254).toLowerCase();
  if (!displayName) throw httpError(400, "Staff display name is required.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Use a valid staff email address.");
  if (role === STAFF_ROLES.OWNER && payload.allowOwner !== true) throw httpError(400, "Owner role changes require a separate ownership transfer.");
  return {
    displayName,
    role,
    email,
    phone: clean(payload.phone, 40),
    title: clean(payload.title || payload.roleLabel || role.replace(/_/g, " "), 100),
    bio: clean(payload.bio, 1000),
    image: clean(payload.image, 2000),
  };
}

export function validateBranchPayload(payload = {}) {
  const name = clean(payload.name || payload.branchName || payload.branch_name, 120);
  if (!name) throw httpError(400, "Branch name is required.");
  return {
    name,
    address: clean(payload.address, 240),
    area: clean(payload.area, 120),
    city: clean(payload.city || payload.district, 120),
    latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
    longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
    contactPhone: clean(payload.contactPhone || payload.contact_phone, 40),
    instructions: clean(payload.instructions || payload.bookingInstructions || payload.booking_instructions, 600),
    isPrimary: payload.isPrimary === true || payload.is_primary === true || Number(payload.is_primary || 0) === 1,
  };
}

export function buildBranchAnalytics({ branches = [], bookings = [], range = null } = {}) {
  const branchMap = new Map(branches.map((branch) => [Number(branch.id), {
    branchId: Number(branch.id),
    name: branch.name || branch.branch_name || "Branch",
    totalBookings: 0,
    completedBookings: 0,
    pendingRequests: 0,
    cancelledBookings: 0,
    noShows: 0,
    knownRevenue: 0,
    quoteBookings: 0,
    popularServices: new Map(),
    smallSampleWarning: false,
  }]));
  bookings.forEach((booking) => {
    const date = bookingDate(booking);
    if (range?.start && date && date < range.start) return;
    if (range?.end && date && date > range.end) return;
    const branchId = Number(booking.provider_location_id || booking.branch_id || 0);
    if (!branchMap.has(branchId)) return;
    const row = branchMap.get(branchId);
    const status = bookingStatus(booking);
    row.totalBookings += 1;
    if (status === "completed") row.completedBookings += 1;
    if (["pending", "payment_pending"].includes(status)) row.pendingRequests += 1;
    if (["cancelled", "canceled", "rejected"].includes(status)) row.cancelledBookings += 1;
    if (status === "no_show") row.noShows += 1;
    const price = bookingPrice(booking);
    if (price === null) row.quoteBookings += 1;
    else if (["confirmed", "completed"].includes(status)) row.knownRevenue += price;
    const service = clean(booking.service_name || "Unknown service", 120);
    row.popularServices.set(service, (row.popularServices.get(service) || 0) + 1);
  });
  return [...branchMap.values()].map((row) => ({
    ...row,
    smallSampleWarning: row.totalBookings > 0 && row.totalBookings < 10,
    popularServices: [...row.popularServices.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }));
}

export function buildStaffAnalytics({ staff = [], bookings = [], range = null } = {}) {
  const staffMap = new Map(staff.map((member) => [Number(member.id), {
    staffId: Number(member.id),
    displayName: member.display_name || member.name || "Staff member",
    role: normalizeStaffRole(member.role),
    assignedBookings: 0,
    completedBookings: 0,
    knownBookingValue: 0,
    quoteBookings: 0,
    servicesPerformed: new Map(),
    smallSampleWarning: false,
  }]));
  bookings.forEach((booking) => {
    const date = bookingDate(booking);
    if (range?.start && date && date < range.start) return;
    if (range?.end && date && date > range.end) return;
    const staffId = Number(booking.assigned_staff_id || booking.team_member_id || 0);
    if (!staffMap.has(staffId)) return;
    const row = staffMap.get(staffId);
    row.assignedBookings += 1;
    if (bookingStatus(booking) === "completed") row.completedBookings += 1;
    const price = bookingPrice(booking);
    if (price === null) row.quoteBookings += 1;
    else if (bookingStatus(booking) === "completed") row.knownBookingValue += price;
    const service = clean(booking.service_name || "Unknown service", 120);
    row.servicesPerformed.set(service, (row.servicesPerformed.get(service) || 0) + 1);
  });
  return [...staffMap.values()].map((row) => ({
    ...row,
    smallSampleWarning: row.assignedBookings > 0 && row.assignedBookings < 10,
    servicesPerformed: [...row.servicesPerformed.entries()].map(([service, count]) => ({ service, count })),
    note: "Provider reviews are not attributed to individual staff unless staff-specific review data exists.",
  }));
}

export function findQualifiedAvailableStaff({ staff = [], assignments = [], locationAssignments = [], schedules = [], bookings = [], serviceId = 0, branchId = 0, date = "", time = "", durationMinutes = 30, transitionMinutes = 0 } = {}) {
  const serviceKey = normalizeId(serviceId);
  const branchKey = normalizeId(branchId);
  const start = minutesFromTime(time);
  if (!serviceKey || !branchKey || !normalizeDate(date) || start === null) return [];
  const end = start + Math.max(15, Number(durationMinutes || 30));
  const weekday = new Date(`${date}T00:00:00+03:00`).getDay();
  return staff
    .filter((member) => Number(member.is_active ?? member.active ?? 1) === 1)
    .filter((member) => assignments.some((item) => Number(item.staff_id) === Number(member.id) && Number(item.service_id) === serviceKey && Number(item.is_active ?? 1) === 1))
    .filter((member) => locationAssignments.some((item) => Number(item.staff_id) === Number(member.id) && Number(item.location_id) === branchKey && Number(item.is_active ?? 1) === 1))
    .map((member) => {
      const day = schedules.find((item) => Number(item.staff_id) === Number(member.id) && Number(item.day_of_week) === weekday);
      const open = !day || Number(day.is_available ?? day.is_open ?? 1) === 1;
      const workStart = minutesFromTime(day?.start_time || "08:00");
      const workEnd = minutesFromTime(day?.end_time || "18:00");
      const conflicts = bookings.filter((booking) => {
        if (Number(booking.assigned_staff_id || booking.team_member_id || 0) !== Number(member.id)) return false;
        if (bookingDate(booking) !== date || TERMINAL_BOOKING_STATUSES.has(bookingStatus(booking))) return false;
        const otherStart = minutesFromTime(bookingTime(booking));
        if (otherStart === null) return false;
        return rangesOverlap(start, end, otherStart, otherStart + bookingDuration(booking), transitionMinutes);
      });
      return {
        staffId: Number(member.id),
        displayName: member.display_name || member.name,
        role: normalizeStaffRole(member.role),
        available: open && workStart !== null && workEnd !== null && start >= workStart && end <= workEnd && conflicts.length === 0,
        conflicts: conflicts.map((booking) => ({ bookingId: booking.id, time: bookingTime(booking), serviceName: booking.service_name })),
        evidence: [
          "Assigned to the requested service",
          "Assigned to the selected branch",
          open ? "Working hours exist for that day" : "Not available that day",
          conflicts.length ? "Existing booking conflicts found" : "No overlapping assigned booking found",
        ],
      };
    });
}

export function buildOperationalInsights({ staff = [], branches = [], serviceAssignments = [], locationAssignments = [], schedules = [], bookings = [] } = {}) {
  const insights = [];
  const activeStaff = staff.filter((member) => Number(member.is_active ?? 1) === 1);
  branches.filter((branch) => Number(branch.is_active ?? 1) === 1).forEach((branch) => {
    const assigned = locationAssignments.filter((item) => Number(item.location_id) === Number(branch.id) && Number(item.is_active ?? 1) === 1);
    if (!assigned.length) {
      insights.push({ code: "branch_without_staff", severity: "high", title: "Branch has no assigned staff", body: `${branch.name || "A branch"} cannot take staff-assigned bookings until at least one active staff member is assigned.`, confirmationRequired: true });
    }
  });
  activeStaff.forEach((member) => {
    if (!serviceAssignments.some((item) => Number(item.staff_id) === Number(member.id) && Number(item.is_active ?? 1) === 1)) {
      insights.push({ code: "staff_without_services", severity: "medium", title: "Staff member has no service assignments", body: `${member.display_name || member.name} needs explicit service assignments before bookings can be assigned.`, confirmationRequired: true });
    }
    if (!schedules.some((item) => Number(item.staff_id) === Number(member.id) && Number(item.is_available ?? 1) === 1)) {
      insights.push({ code: "staff_without_schedule", severity: "medium", title: "Staff member has no saved schedule", body: `${member.display_name || member.name} has no staff-specific availability yet.`, confirmationRequired: true });
    }
  });
  const activeBookings = bookings.filter((booking) => ACTIVE_BOOKING_STATUSES.has(bookingStatus(booking)));
  activeBookings.filter((booking) => !Number(booking.assigned_staff_id || booking.team_member_id || 0)).slice(0, 5).forEach((booking) => {
    insights.push({ code: "unassigned_booking", severity: "medium", title: "Booking needs staff assignment", body: `${booking.service_name || "A booking"} on ${bookingDate(booking)} ${bookingTime(booking)} is not assigned to staff.`, bookingId: booking.id, confirmationRequired: true });
  });
  return insights.slice(0, 12);
}

async function getOwnedBusinessWithPlatinum(userId, entitlement = PROVIDER_ENTITLEMENTS.STAFF_MANAGEMENT, permission = "") {
  return resolveProviderMembershipContext(userId, { entitlement, permission });
}

async function loadOperationsData(businessId) {
  const [staff, branches, serviceAssignments, locationAssignments, schedules, bookings, invitations, exports] = await Promise.all([
    all(`SELECT * FROM barber_team_members WHERE barber_id = ? ORDER BY is_active DESC, name ASC`, [businessId]),
    all(`SELECT * FROM provider_locations WHERE barber_id = ? ORDER BY is_primary DESC, name ASC`, [businessId]).catch(() => []),
    all(`SELECT * FROM staff_service_assignments WHERE barber_id = ? ORDER BY staff_id ASC`, [businessId]).catch(() => []),
    all(`SELECT * FROM staff_location_assignments WHERE barber_id = ? ORDER BY staff_id ASC`, [businessId]).catch(() => []),
    all(`SELECT * FROM staff_schedules WHERE barber_id = ? ORDER BY staff_id ASC, day_of_week ASC`, [businessId]).catch(() => []),
    all(`SELECT * FROM bookings WHERE barber_id = ? ORDER BY booking_date DESC, booking_time DESC, id DESC LIMIT 1000`, [businessId]),
    all(`SELECT id, staff_email, role, status, expires_at, created_at, revoked_at FROM provider_staff_invitations WHERE barber_id = ? ORDER BY created_at DESC LIMIT 100`, [businessId]).catch(() => []),
    all(`SELECT id, export_type, status, row_count, created_at FROM provider_export_audit WHERE barber_id = ? ORDER BY created_at DESC LIMIT 25`, [businessId]).catch(() => []),
  ]);
  return { staff, branches, serviceAssignments, locationAssignments, schedules, bookings, invitations, exports };
}

async function ensurePrimaryBranch(business, client = { get, run }) {
  let primary = await client.get(`SELECT * FROM provider_locations WHERE barber_id = ? AND is_primary = 1 LIMIT 1`, [business.id]).catch(() => null);
  if (primary) return primary;
  const existing = await client.get(`SELECT * FROM provider_locations WHERE barber_id = ? ORDER BY id ASC LIMIT 1`, [business.id]).catch(() => null);
  if (existing) {
    await client.run(`UPDATE provider_locations SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [existing.id]);
    return { ...existing, is_primary: 1 };
  }
  const result = await client.run(
    `INSERT INTO provider_locations
     (barber_id, name, address, area, city, latitude, longitude, is_primary, is_active, booking_instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      business.id,
      business.business_name ? `${business.business_name} main location` : "Main location",
      business.location || "",
      business.location || "",
      "",
      business.latitude || null,
      business.longitude || null,
      "Primary location copied from the provider stand.",
    ]
  );
  return { id: result.lastID, barber_id: business.id, name: business.business_name || "Main location", is_primary: 1, is_active: 1 };
}

export async function getProviderPlatinumDashboard(userId) {
  const { business, snapshot, role, permissions, membership, scope, isOwner } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.ADVANCED_REPORTS, "viewReports");
  await ensurePrimaryBranch(business);
  const data = await loadOperationsData(business.id);
  return {
    businessId: business.id,
    plan: snapshot.tier,
    actor: { role, permissions, isOwner, membershipId: membership?.id || null, scope },
    entitlements: snapshot.entitlements,
    limits: snapshot.limits,
    staff: data.staff.map((member) => ({ ...member, permissions: rolePermissions(member.role) })),
    branches: data.branches,
    branchAnalytics: buildBranchAnalytics({ branches: data.branches, bookings: data.bookings }),
    staffAnalytics: buildStaffAnalytics({ staff: data.staff, bookings: data.bookings }),
    insights: buildOperationalInsights(data),
    invitations: data.invitations,
    exports: data.exports,
    limitations: [
      "CSV exports are authenticated direct downloads only.",
      "Travel time between branches is not estimated unless transition time is configured.",
      "Provider-level reviews are not attributed to individual staff.",
    ],
  };
}

export async function createStaffProfile(userId, payload = {}) {
  const { business, snapshot } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS, "manageStaff");
  const staff = validateStaffPayload(payload);
  const current = await get(`SELECT COUNT(*) AS count FROM barber_team_members WHERE barber_id = ? AND COALESCE(is_active, 1) = 1`, [business.id]);
  if (Number(current?.count || 0) >= Number(snapshot.limits.staffMembers || 0)) throw httpError(403, "Provider Platinum staff limit reached.", "STAFF_LIMIT_REACHED");
  const duplicate = staff.email
    ? await get(`SELECT id FROM barber_team_members WHERE barber_id = ? AND LOWER(COALESCE(email, '')) = ? AND COALESCE(is_active, 1) = 1`, [business.id, staff.email]).catch(() => null)
    : null;
  if (duplicate) throw httpError(409, "That staff email is already active for this provider.", "DUPLICATE_STAFF");
  const result = await run(
    `INSERT INTO barber_team_members
     (barber_id, name, display_name, email, phone, role, title, bio, image, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [business.id, staff.displayName, staff.displayName, staff.email, staff.phone, staff.role, staff.title, staff.bio, staff.image]
  );
  return { staff: { id: result.lastID, barber_id: business.id, ...staff, is_active: 1 } };
}

export async function deactivateStaffProfile(userId, staffId) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS, "manageStaff");
  const id = normalizeId(staffId);
  const staff = await get(`SELECT * FROM barber_team_members WHERE id = ? AND barber_id = ?`, [id, business.id]);
  if (!staff) throw httpError(404, "Staff member not found.");
  if (normalizeStaffRole(staff.role) === STAFF_ROLES.OWNER) throw httpError(400, "Owner staff profile cannot be deactivated without ownership transfer.");
  await run(`UPDATE barber_team_members SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND barber_id = ?`, [id, business.id]);
  return { staffId: id, status: "inactive", historicalBookingsPreserved: true };
}

export async function createBranch(userId, payload = {}) {
  const { business, snapshot } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.BRANCH_MANAGEMENT, "manageBranches");
  const branch = validateBranchPayload(payload);
  const current = await get(`SELECT COUNT(*) AS count FROM provider_locations WHERE barber_id = ? AND COALESCE(is_active, 1) = 1`, [business.id]).catch(() => ({ count: 0 }));
  if (Number(current?.count || 0) >= Number(snapshot.limits.branches || 0)) throw httpError(403, "Provider Platinum branch limit reached.", "BRANCH_LIMIT_REACHED");
  return transaction(async (client) => {
    if (branch.isPrimary) await client.run(`UPDATE provider_locations SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE barber_id = ?`, [business.id]).catch(() => {});
    const result = await client.run(
      `INSERT INTO provider_locations
       (barber_id, name, address, area, city, latitude, longitude, contact_phone, booking_instructions, is_primary, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [business.id, branch.name, branch.address, branch.area, branch.city, branch.latitude, branch.longitude, branch.contactPhone, branch.instructions, branch.isPrimary ? 1 : 0]
    );
    if (branch.isPrimary) await client.run(`UPDATE bookings SET provider_location_id = provider_location_id WHERE barber_id = ?`, [business.id]).catch(() => {});
    return { branch: { id: result.lastID, barber_id: business.id, ...branch, is_active: 1 } };
  });
}

export async function assignStaffService(userId, { staffId, serviceId } = {}) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_SERVICE_ASSIGNMENT, "manageStaff");
  const sid = normalizeId(staffId);
  const serviceKey = normalizeId(serviceId);
  const staff = await get(`SELECT * FROM barber_team_members WHERE id = ? AND barber_id = ? AND COALESCE(is_active, 1) = 1`, [sid, business.id]);
  if (!staff) throw httpError(404, "Active staff member not found.");
  const service = await get(`SELECT * FROM barber_services WHERE id = ? AND barber_id = ? AND COALESCE(is_available, 1) = 1`, [serviceKey, business.id]);
  if (!service) throw httpError(404, "Active provider service not found.");
  await run(
    `INSERT INTO staff_service_assignments (barber_id, staff_id, service_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(barber_id, staff_id, service_id) DO UPDATE SET is_active = 1, updated_at = CURRENT_TIMESTAMP`,
    [business.id, sid, serviceKey]
  );
  return { staffId: sid, serviceId: serviceKey, status: "active" };
}

export async function assignStaffBranch(userId, { staffId, branchId } = {}) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_ASSIGNMENT, "manageStaff");
  const sid = normalizeId(staffId);
  const locationId = normalizeId(branchId);
  const staff = await get(`SELECT * FROM barber_team_members WHERE id = ? AND barber_id = ? AND COALESCE(is_active, 1) = 1`, [sid, business.id]);
  if (!staff) throw httpError(404, "Active staff member not found.");
  const branch = await get(`SELECT * FROM provider_locations WHERE id = ? AND barber_id = ? AND COALESCE(is_active, 1) = 1`, [locationId, business.id]);
  if (!branch) throw httpError(404, "Active branch not found.");
  await run(
    `INSERT INTO staff_location_assignments (barber_id, staff_id, location_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(barber_id, staff_id, location_id) DO UPDATE SET is_active = 1, updated_at = CURRENT_TIMESTAMP`,
    [business.id, sid, locationId]
  );
  return { staffId: sid, branchId: locationId, status: "active" };
}

export async function setStaffSchedule(userId, payload = {}) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_SCHEDULES, "manageSchedules");
  const staffId = normalizeId(payload.staffId || payload.staff_id);
  const day = Number(payload.dayOfWeek ?? payload.day_of_week);
  const start = normalizeTime(payload.startTime || payload.start_time);
  const end = normalizeTime(payload.endTime || payload.end_time);
  if (!Number.isInteger(day) || day < 0 || day > 6 || !start || !end || start >= end) throw httpError(400, "Choose a valid staff schedule window.");
  const staff = await get(`SELECT id FROM barber_team_members WHERE id = ? AND barber_id = ? AND COALESCE(is_active, 1) = 1`, [staffId, business.id]);
  if (!staff) throw httpError(404, "Active staff member not found.");
  await run(
    `INSERT INTO staff_schedules (barber_id, staff_id, day_of_week, is_available, start_time, end_time, break_start, break_end, transition_minutes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(barber_id, staff_id, day_of_week) DO UPDATE SET is_available = excluded.is_available, start_time = excluded.start_time, end_time = excluded.end_time, break_start = excluded.break_start, break_end = excluded.break_end, transition_minutes = excluded.transition_minutes, updated_at = CURRENT_TIMESTAMP`,
    [
      business.id,
      staffId,
      day,
      payload.isAvailable === false || Number(payload.is_available || 1) === 0 ? 0 : 1,
      start,
      end,
      normalizeTime(payload.breakStart || payload.break_start) || null,
      normalizeTime(payload.breakEnd || payload.break_end) || null,
      Math.max(0, Math.min(180, Number(payload.transitionMinutes ?? payload.transition_minutes ?? 0))),
    ]
  );
  return { staffId, dayOfWeek: day, startTime: start, endTime: end, confirmationRequired: false };
}

export async function assignBookingToStaff(userId, payload = {}) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_ASSIGNMENT, "assignBookings");
  const bookingId = normalizeId(payload.bookingId || payload.booking_id);
  const staffId = normalizeId(payload.staffId || payload.staff_id);
  const branchId = normalizeId(payload.branchId || payload.branch_id);
  const booking = await get(`SELECT * FROM bookings WHERE id = ? AND barber_id = ?`, [bookingId, business.id]);
  if (!booking) throw httpError(404, "Booking not found.");
  if (TERMINAL_BOOKING_STATUSES.has(bookingStatus(booking))) throw httpError(400, "Terminal bookings cannot be reassigned.");
  const data = await loadOperationsData(business.id);
  const candidates = findQualifiedAvailableStaff({
    staff: data.staff,
    assignments: data.serviceAssignments,
    locationAssignments: data.locationAssignments,
    schedules: data.schedules,
    bookings: data.bookings.filter((row) => Number(row.id) !== bookingId),
    serviceId: payload.serviceId || booking.service_id || booking.serviceId,
    branchId: branchId || booking.provider_location_id,
    date: bookingDate(booking),
    time: bookingTime(booking),
    durationMinutes: bookingDuration(booking),
    transitionMinutes: Number(payload.transitionMinutes || payload.transition_minutes || 0),
  });
  const selected = candidates.find((item) => item.staffId === staffId);
  if (!selected) throw httpError(400, "Staff member is not qualified for this service and branch.");
  if (!selected.available) throw httpError(409, "Staff member is not available for this booking time.", "STAFF_NOT_AVAILABLE");
  if (payload.confirm !== true) {
    return { confirmationRequired: true, candidate: selected, bookingId, branchId: branchId || Number(booking.provider_location_id || 0) };
  }
  await transaction(async (client) => {
    await client.run(`UPDATE bookings SET team_member_id = ?, assigned_staff_id = ?, provider_location_id = COALESCE(?, provider_location_id), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND barber_id = ?`, [staffId, staffId, branchId || null, bookingId, business.id]);
    await client.run(
      `INSERT INTO booking_assignment_audit (booking_id, barber_id, staff_id, location_id, actor_user_id, action, previous_staff_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, 'assign_staff', ?, ?, CURRENT_TIMESTAMP)`,
      [bookingId, business.id, staffId, branchId || null, userId, booking.team_member_id || null, auditPayload({ confirmed: true })]
    ).catch(() => {});
  });
  return { confirmationRequired: false, bookingId, staffId, branchId: branchId || Number(booking.provider_location_id || 0), status: "assigned" };
}

export async function createStaffInvitation(userId, payload = {}) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS, "manageStaff");
  const staff = validateStaffPayload({ ...payload, displayName: payload.displayName || payload.name || payload.email });
  if (!staff.email) throw httpError(400, "Staff email is required for invitations.");
  const activeMember = await get(`SELECT id FROM barber_team_members WHERE barber_id = ? AND LOWER(COALESCE(email, '')) = ? AND COALESCE(is_active, 1) = 1`, [business.id, staff.email]).catch(() => null);
  if (activeMember) throw httpError(409, "That staff member already has active access.", "DUPLICATE_STAFF");
  const existing = await get(
    `SELECT id FROM provider_staff_invitations
     WHERE barber_id = ? AND LOWER(staff_email) = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`,
    [business.id, staff.email]
  ).catch(() => null);
  if (existing) throw httpError(409, "A pending invitation already exists for that staff email.", "DUPLICATE_INVITATION");
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const metadata = auditPayload({
    displayName: staff.displayName,
    branchIds: Array.isArray(payload.branchIds || payload.branch_ids) ? payload.branchIds || payload.branch_ids : [],
    serviceIds: Array.isArray(payload.serviceIds || payload.service_ids) ? payload.serviceIds || payload.service_ids : [],
  });
  const result = await run(
    `INSERT INTO provider_staff_invitations (barber_id, staff_email, role, token_hash, status, expires_at, created_by_user_id, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [business.id, staff.email, staff.role, tokenHash, expiresAt, userId, metadata]
  );
  return {
    invitation: {
      id: result.lastID,
      staffEmail: staff.email,
      role: staff.role,
      status: "pending",
      expiresAt,
      delivery: "Email delivery is not claimed. Share through the supported invitation flow when mail is enabled.",
      localAcceptanceToken: process.env.NODE_ENV === "production" ? undefined : token,
    },
  };
}

export async function acceptStaffInvitation(userId, { token = "", action = "accept" } = {}) {
  const rawToken = clean(token, 200);
  if (!rawToken) throw httpError(400, "Invitation token is required.");
  const row = await get(
    `SELECT psi.*, b.business_name, p.email AS user_email
     FROM provider_staff_invitations psi
     INNER JOIN barbers b ON b.id = psi.barber_id
     INNER JOIN profiles p ON p.user_id = ?
     WHERE psi.token_hash = ?
     LIMIT 1`,
    [userId, hashInvitationToken(rawToken)]
  );
  if (!row) throw httpError(404, "Invitation not found.");
  const status = String(row.status || "").toLowerCase();
  if (status !== "pending") throw httpError(409, "This invitation is no longer active.", "INVITATION_NOT_ACTIVE");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await run(`UPDATE provider_staff_invitations SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]).catch(() => {});
    throw httpError(410, "This invitation has expired.", "INVITATION_EXPIRED");
  }
  if (String(row.user_email || "").trim().toLowerCase() !== String(row.staff_email || "").trim().toLowerCase()) {
    throw httpError(403, "Sign in with the invited email address to accept this invitation.", "INVITATION_EMAIL_MISMATCH");
  }
  if (String(action || "accept").toLowerCase() === "decline") {
    await run(`UPDATE provider_staff_invitations SET status = 'declined', declined_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
    return { invitation: { id: row.id, status: "declined", businessName: row.business_name } };
  }

  const metadata = (() => {
    try { return JSON.parse(row.metadata_json || "{}"); } catch { return {}; }
  })();
  const branchIds = Array.isArray(metadata.branchIds) ? metadata.branchIds.map(normalizeId).filter(Boolean) : [];
  const serviceIds = Array.isArray(metadata.serviceIds) ? metadata.serviceIds.map(normalizeId).filter(Boolean) : [];
  const displayName = clean(metadata.displayName || row.staff_email.split("@")[0], 120);
  const result = await transaction(async (client) => {
    const existing = await client.get(
      `SELECT id FROM barber_team_members WHERE barber_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1`,
      [row.barber_id, userId]
    );
    if (existing) throw httpError(409, "You already have active access to this provider business.", "DUPLICATE_STAFF");
    const staffResult = await client.run(
      `INSERT INTO barber_team_members (barber_id, user_id, name, display_name, email, role, title, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [row.barber_id, userId, displayName, displayName, row.staff_email, normalizeStaffRole(row.role), normalizeStaffRole(row.role).replace(/_/g, " ")]
    );
    const staffId = staffResult.lastID;
    for (const branchId of branchIds) {
      const branch = await client.get(`SELECT id FROM provider_locations WHERE id = ? AND barber_id = ? AND COALESCE(is_active, 1) = 1`, [branchId, row.barber_id]);
      if (branch) {
        await client.run(
          `INSERT INTO staff_location_assignments (barber_id, staff_id, location_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(barber_id, staff_id, location_id) DO UPDATE SET is_active = 1, updated_at = CURRENT_TIMESTAMP`,
          [row.barber_id, staffId, branchId]
        );
      }
    }
    for (const serviceId of serviceIds) {
      const service = await client.get(`SELECT id FROM barber_services WHERE id = ? AND barber_id = ? AND COALESCE(is_available, 1) = 1`, [serviceId, row.barber_id]);
      if (service) {
        await client.run(
          `INSERT INTO staff_service_assignments (barber_id, staff_id, service_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(barber_id, staff_id, service_id) DO UPDATE SET is_active = 1, updated_at = CURRENT_TIMESTAMP`,
          [row.barber_id, staffId, serviceId]
        );
      }
    }
    await client.run(
      `UPDATE provider_staff_invitations
       SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?, accepted_staff_id = ?, token_hash = 'used:' || id, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [userId, staffId, row.id]
    );
    return { staffId };
  });
  return {
    invitation: {
      id: row.id,
      status: "accepted",
      businessName: row.business_name,
      staffId: result.staffId,
      role: normalizeStaffRole(row.role),
    },
  };
}

export async function revokeStaffInvitation(userId, invitationId) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.STAFF_ACCOUNTS, "manageStaff");
  const id = normalizeId(invitationId);
  const invitation = await get(`SELECT * FROM provider_staff_invitations WHERE id = ? AND barber_id = ?`, [id, business.id]);
  if (!invitation) throw httpError(404, "Invitation not found.");
  if (String(invitation.status || "").toLowerCase() !== "pending") throw httpError(409, "Only pending invitations can be revoked.");
  await run(`UPDATE provider_staff_invitations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND barber_id = ?`, [id, business.id]);
  return { invitation: { id, status: "revoked" } };
}

export async function buildAdvancedReport(userId, { type = "bookings", from = "", to = "", branchId = 0, staffId = 0 } = {}) {
  const { business, snapshot } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.ADVANCED_REPORTS, "viewReports");
  const reportType = clean(type, 40).toLowerCase();
  if (!PLATINUM_REPORT_TYPES.includes(reportType)) throw httpError(400, "Choose a supported report type.");
  const start = normalizeDate(from);
  const end = normalizeDate(to);
  if (!start || !end || end < start) throw httpError(400, "Choose a valid report date range.");
  if (daysBetween(start, end) > MAX_EXPORT_DAYS) throw httpError(400, "Reports are limited to one year at a time.", "REPORT_RANGE_TOO_LARGE");
  const data = await loadOperationsData(business.id);
  const rows = data.bookings
    .filter((booking) => bookingDate(booking) >= start && bookingDate(booking) <= end)
    .filter((booking) => !branchId || Number(booking.provider_location_id || 0) === Number(branchId))
    .filter((booking) => !staffId || Number(booking.assigned_staff_id || booking.team_member_id || 0) === Number(staffId))
    .slice(0, snapshot.limits.reportExportRows);
  return {
    type: reportType,
    range: { start, end },
    rowCount: rows.length,
    truncated: rows.length >= snapshot.limits.reportExportRows,
    summary: {
      branchAnalytics: buildBranchAnalytics({ branches: data.branches, bookings: rows, range: { start, end } }),
      staffAnalytics: buildStaffAnalytics({ staff: data.staff, bookings: rows, range: { start, end } }),
    },
    rows: rows.map((booking) => ({
      bookingId: booking.id,
      date: bookingDate(booking),
      time: bookingTime(booking),
      serviceName: booking.service_name,
      status: bookingStatus(booking),
      knownPrice: bookingPrice(booking),
      priceState: bookingPrice(booking) === null ? "Quote or unknown" : "Known",
      branchId: booking.provider_location_id || "",
      staffId: booking.assigned_staff_id || booking.team_member_id || "",
    })),
  };
}

export async function createCsvExport(userId, payload = {}) {
  const { business } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.ADVANCED_EXPORTS, "exportReports");
  enforceExportRateLimit(userId, business.id);
  const report = await buildAdvancedReport(userId, payload);
  const columns = [
    { key: "bookingId", label: "Booking ID" },
    { key: "date", label: "Date" },
    { key: "time", label: "Time" },
    { key: "serviceName", label: "Service" },
    { key: "status", label: "Status" },
    { key: "knownPrice", label: "Known Price UGX" },
    { key: "priceState", label: "Price State" },
    { key: "branchId", label: "Branch ID" },
    { key: "staffId", label: "Staff ID" },
  ];
  const csv = buildCsv(report.rows, columns);
  await run(
    `INSERT INTO provider_export_audit (barber_id, actor_user_id, export_type, filters_json, row_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP)`,
    [business.id, userId, report.type, auditPayload(report.range), report.rowCount]
  ).catch(() => {});
  return { ...report, contentType: "text/csv; charset=utf-8", filename: `queless-${report.type}-${report.range.start}-${report.range.end}.csv`, csv };
}

export async function draftAdvancedProviderOperation(userId, { message = "" } = {}) {
  const { business, permissions } = await getOwnedBusinessWithPlatinum(userId, PROVIDER_ENTITLEMENTS.ADVANCED_ASSISTANT, "useAdvancedAssistant");
  const data = await loadOperationsData(business.id);
  const text = clean(message, 500).toLowerCase();
  const insights = buildOperationalInsights(data);
  let intent = "unsupported";
  if (/staff|available|who can|schedule/.test(text)) intent = "staff_availability";
  if (/branch|location/.test(text)) intent = "branch_insights";
  if (/export|report|csv/.test(text)) intent = "report_export";
  if (/assign/.test(text)) intent = "assignment_review";
  return {
    intent,
    confirmationRequired: intent === "assignment_review" || intent === "report_export",
    writesData: false,
    permissions,
    answer: intent === "unsupported"
      ? "I can help with staff schedules, branch gaps, assignment review, and report preparation when enough details are provided."
      : "I found the relevant operations context. Review the suggestions before making any staff, branch, assignment, or export change.",
    insights,
    dataLimits: [
      "Uses saved staff, branch, service assignment, schedule, and booking records only.",
      "Does not invent staff skills, branch availability, or travel time.",
    ],
  };
}
