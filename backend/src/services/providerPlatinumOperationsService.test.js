import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBranchAnalytics,
  buildCsv,
  buildOperationalInsights,
  buildStaffAnalytics,
  findQualifiedAvailableStaff,
  normalizeStaffRole,
  protectCsvCell,
  rolePermissions,
  validateBranchPayload,
  validateStaffPayload,
} from "./providerPlatinumOperationsService.js";

test("staff roles normalize to server-authoritative permissions", () => {
  assert.equal(normalizeStaffRole("Receptionist"), "scheduler");
  assert.equal(rolePermissions("owner").manageStaff, true);
  assert.equal(rolePermissions("manager").manageBranches, true);
  assert.equal(rolePermissions("scheduler").manageBookings, true);
  assert.equal(rolePermissions("service_professional").viewAnalytics, false);
  assert.equal(rolePermissions("view-only analyst").exportReports, true);
});

test("staff payload blocks owner role changes without transfer flow", () => {
  assert.throws(() => validateStaffPayload({ displayName: "Amina", role: "owner" }), /ownership transfer/i);
  const staff = validateStaffPayload({ displayName: "Amina K", role: "manager", email: "AMINA@EXAMPLE.TEST" });
  assert.equal(staff.displayName, "Amina K");
  assert.equal(staff.role, "manager");
  assert.equal(staff.email, "amina@example.test");
});

test("branch payload preserves current location details without making them product listings", () => {
  const branch = validateBranchPayload({
    branchName: "Wakiso Studio",
    address: "Plot 7",
    area: "Wakiso",
    latitude: "0.42",
    longitude: "32.49",
    isPrimary: true,
  });
  assert.equal(branch.name, "Wakiso Studio");
  assert.equal(branch.isPrimary, true);
  assert.equal(branch.latitude, 0.42);
});

test("availability requires service qualification, branch assignment, hours and no overlaps", () => {
  const candidates = findQualifiedAvailableStaff({
    staff: [
      { id: 1, display_name: "Amina", role: "service_professional", is_active: 1 },
      { id: 2, display_name: "Sam", role: "service_professional", is_active: 1 },
      { id: 3, display_name: "Inactive", role: "service_professional", is_active: 0 },
    ],
    assignments: [
      { staff_id: 1, service_id: 10, is_active: 1 },
      { staff_id: 2, service_id: 10, is_active: 1 },
      { staff_id: 3, service_id: 10, is_active: 1 },
    ],
    locationAssignments: [
      { staff_id: 1, location_id: 5, is_active: 1 },
      { staff_id: 2, location_id: 5, is_active: 1 },
      { staff_id: 3, location_id: 5, is_active: 1 },
    ],
    schedules: [
      { staff_id: 1, day_of_week: 2, is_available: 1, start_time: "09:00", end_time: "17:00" },
      { staff_id: 2, day_of_week: 2, is_available: 1, start_time: "09:00", end_time: "17:00" },
    ],
    bookings: [
      { id: 99, team_member_id: 2, booking_date: "2026-07-28", booking_time: "10:00", service_duration_minutes: 60, status: "confirmed", service_name: "Makeup" },
    ],
    serviceId: 10,
    branchId: 5,
    date: "2026-07-28",
    time: "10:30",
    durationMinutes: 45,
  });
  assert.deepEqual(candidates.map((item) => item.staffId), [1, 2]);
  assert.equal(candidates.find((item) => item.staffId === 1).available, true);
  assert.equal(candidates.find((item) => item.staffId === 2).available, false);
});

test("branch analytics separates quote bookings and small samples", () => {
  const analytics = buildBranchAnalytics({
    branches: [{ id: 5, name: "Wakiso" }],
    bookings: [
      { provider_location_id: 5, booking_date: "2026-07-28", status: "completed", service_name: "Hair", price: 25000 },
      { provider_location_id: 5, booking_date: "2026-07-28", status: "completed", service_name: "Makeup", pricing_type: "quote" },
      { provider_location_id: 5, booking_date: "2026-07-28", status: "no_show", service_name: "Hair", price: 25000 },
    ],
  })[0];
  assert.equal(analytics.totalBookings, 3);
  assert.equal(analytics.knownRevenue, 25000);
  assert.equal(analytics.quoteBookings, 1);
  assert.equal(analytics.smallSampleWarning, true);
});

test("staff analytics does not attribute provider reviews to staff", () => {
  const analytics = buildStaffAnalytics({
    staff: [{ id: 1, display_name: "Amina", role: "service_professional" }],
    bookings: [
      { assigned_staff_id: 1, booking_date: "2026-07-28", status: "completed", service_name: "Hair", price: 25000 },
      { assigned_staff_id: 1, booking_date: "2026-07-28", status: "completed", service_name: "Braids", pricing_type: "quote" },
    ],
  })[0];
  assert.equal(analytics.assignedBookings, 2);
  assert.equal(analytics.knownBookingValue, 25000);
  assert.match(analytics.note, /not attributed/i);
});

test("operational insights are suggestions and require confirmation", () => {
  const insights = buildOperationalInsights({
    staff: [{ id: 1, display_name: "Amina", is_active: 1 }],
    branches: [{ id: 2, name: "Wakiso", is_active: 1 }],
    serviceAssignments: [],
    locationAssignments: [],
    schedules: [],
    bookings: [{ id: 3, booking_date: "2026-07-28", booking_time: "10:00", status: "confirmed", service_name: "Hair" }],
  });
  assert.equal(insights.some((item) => item.code === "branch_without_staff"), true);
  assert.equal(insights.every((item) => item.confirmationRequired), true);
});

test("CSV export protects formula injection and avoids raw unescaped cells", () => {
  assert.equal(protectCsvCell("=IMPORTXML('bad')"), "\"'=IMPORTXML('bad')\"");
  const csv = buildCsv([{ name: "+danger", status: "completed" }], [{ key: "name", label: "Name" }, { key: "status", label: "Status" }]);
  assert.match(csv, /"'\+danger"/);
});
