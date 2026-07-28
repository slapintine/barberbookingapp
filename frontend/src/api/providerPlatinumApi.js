import { apiFetch, buildApiUrl, getAuthToken } from "../config/api.js";

export function getProviderPlatinumDashboard() {
  return apiFetch("/api/provider-platinum/dashboard");
}

export function createProviderPlatinumStaff(payload) {
  return apiFetch("/api/provider-platinum/staff", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createProviderPlatinumBranch(payload) {
  return apiFetch("/api/provider-platinum/branches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function assignProviderPlatinumStaffService(payload) {
  return apiFetch("/api/provider-platinum/staff-services", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function assignProviderPlatinumStaffBranch(payload) {
  return apiFetch("/api/provider-platinum/staff-branches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveProviderPlatinumStaffSchedule(payload) {
  return apiFetch("/api/provider-platinum/staff-schedules", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function assignProviderPlatinumBooking(payload) {
  return apiFetch("/api/provider-platinum/booking-assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createProviderPlatinumInvitation(payload) {
  return apiFetch("/api/provider-platinum/invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function acceptProviderPlatinumInvitation(payload) {
  return apiFetch("/api/provider-platinum/invitations/accept", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokeProviderPlatinumInvitation(id) {
  return apiFetch(`/api/provider-platinum/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getProviderPlatinumReport(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  return apiFetch(`/api/provider-platinum/reports?${query.toString()}`);
}

export function exportProviderPlatinumCsv(payload) {
  return fetch(buildApiUrl("/api/provider-platinum/exports"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const text = await response.text();
    if (!response.ok) throw new Error(text || "Export failed.");
    return {
      csv: text,
      contentType: response.headers.get("content-type") || "text/csv",
      filename: (response.headers.get("content-disposition") || "").match(/filename="?([^";]+)"?/i)?.[1] || "queless-export.csv",
    };
  });
}

export function draftProviderPlatinumAssistant(payload) {
  return apiFetch("/api/provider-platinum/assistant", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
