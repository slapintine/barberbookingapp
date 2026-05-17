import { apiFetch } from "../config/api.js";

export function registerUser({ username, password, role = "customer" }) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, role }),
  });
}

export function loginUser({ username, password }) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function updateAccount({ username, currentPassword, newPassword }) {
  return apiFetch("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ username, currentPassword, newPassword }),
  });
}

export function requestPasswordReset(identifier) {
  return apiFetch("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify(
      String(identifier || "").includes("@")
        ? { email: identifier }
        : { username: identifier }
    ),
  });
}

export function confirmPasswordReset({ identifier, code, newPassword }) {
  return apiFetch("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({
      ...(String(identifier || "").includes("@")
        ? { email: identifier }
        : { username: identifier }),
      code,
      newPassword,
    }),
  });
}

export function sendEmailVerification(email) {
  return apiFetch("/api/auth/send-email-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function sendPhoneOtp(phone) {
  return apiFetch("/api/auth/send-phone-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp({ channel, destination, code, purpose = "account_verification" }) {
  return apiFetch("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ channel, destination, code, purpose }),
  });
}
