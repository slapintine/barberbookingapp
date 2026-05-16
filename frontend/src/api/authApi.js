import { apiFetch } from "../config/api.js";

export function registerUser({ username, email, password, role = "customer" }) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password, role }),
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

export function requestPasswordReset(email) {
  return apiFetch("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmPasswordReset({ email, code, newPassword }) {
  return apiFetch("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword }),
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
