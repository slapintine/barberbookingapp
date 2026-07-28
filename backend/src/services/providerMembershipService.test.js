import test from "node:test";
import assert from "node:assert/strict";
import {
  getProviderRolePermissions,
  normalizeProviderStaffRole,
} from "./providerMembershipService.js";

test("provider staff roles normalize to operational permissions", () => {
  assert.equal(normalizeProviderStaffRole("Receptionist"), "scheduler");
  assert.equal(normalizeProviderStaffRole("view-only analyst"), "view_only_analyst");
  assert.equal(getProviderRolePermissions("owner").manageSubscription, true);
  assert.equal(getProviderRolePermissions("manager").manageStaff, true);
  assert.equal(getProviderRolePermissions("scheduler").assignBookings, true);
  assert.equal(getProviderRolePermissions("service_professional").viewReports, false);
  assert.equal(getProviderRolePermissions("view_only_analyst").viewReports, true);
  assert.equal(getProviderRolePermissions("view_only_analyst").exportReports, false);
  assert.equal(getProviderRolePermissions("view_only_analyst", { exportReports: true }).exportReports, true);
});
