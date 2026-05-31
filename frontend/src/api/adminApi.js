import { apiFetch } from "../config/api.js";

export function getAdminOverview() {
  return apiFetch("/api/admin/overview");
}

export function getAdminSummary() {
  return apiFetch("/api/admin/summary");
}

export function getAdminUsers() {
  return apiFetch("/api/admin/users");
}

export function getAdminBusinesses() {
  return apiFetch("/api/admin/businesses");
}

export function getAdminBookings() {
  return apiFetch("/api/admin/bookings");
}

export function getAdminSubscriptions() {
  return apiFetch("/api/admin/subscriptions");
}

export function getAdminSystemHealth() {
  return apiFetch("/api/admin/system-health");
}

export function getAdminDeploymentReadiness() {
  return apiFetch("/api/admin/deployment-readiness");
}

export function cleanupAdminDemoBusinesses(payload) {
  return apiFetch("/api/admin/deployment-readiness/cleanup-demo-businesses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function remediateAdminDeploymentReadiness(payload) {
  return apiFetch("/api/admin/deployment-readiness/remediate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminBusiness(id, payload) {
  return apiFetch(`/api/admin/businesses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getAdminSubscriptionSummary() {
  return apiFetch("/api/admin/subscriptions/summary");
}

export function getAdminCustomerSubscriptions() {
  return apiFetch("/api/admin/customers/subscriptions");
}

export function getAdminProviderSubscriptions() {
  return apiFetch("/api/admin/providers/subscriptions");
}

export function updateAdminCustomerSubscription(userId, payload) {
  return apiFetch(`/api/admin/customers/${userId}/subscription`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateAdminProviderSubscription(businessId, payload) {
  return apiFetch(`/api/admin/businesses/${businessId}/subscription`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getAdminPayments() {
  return apiFetch("/api/admin/payments");
}

export function getAdminSmsMessages(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return apiFetch(`/api/admin/sms${query ? `?${query}` : ""}`);
}

export function sendAdminSms(payload) {
  return apiFetch("/api/sms/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendAdminAnnouncement(payload) {
  return apiFetch("/api/admin/notifications/announcement", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runAdminAccessTest(payload) {
  return apiFetch("/api/admin/test-feature-access", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAdminAuditLog() {
  return apiFetch("/api/admin/audit-log");
}

export function getAdminReviews() {
  return apiFetch("/api/admin/reviews");
}

export function getAdminSupportRequests() {
  return apiFetch("/api/admin/support-requests");
}

export function updateAdminSupportRequest(id, payload) {
  return apiFetch(`/api/admin/support-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
