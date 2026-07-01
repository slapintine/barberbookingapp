import { apiFetch } from "../config/api.js";
import { createComingSoonError, SMS_COMING_SOON_MESSAGE, SMS_ENABLED } from "../utils/launchFlags.js";

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

export function getMe() {
  // Silent boot validation: a 401 here must not trigger a global logout banner.
  return apiFetch("/api/auth/me", { suppressAuthBroadcast: true });
}

export function logoutUser(refreshToken) {
  return apiFetch("/api/auth/logout", {
    method: "POST",
    skipAuthRefresh: true,
    body: JSON.stringify({ refreshToken }),
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
  if (!SMS_ENABLED) {
    return Promise.reject(createComingSoonError(SMS_COMING_SOON_MESSAGE, "SMS_COMING_SOON"));
  }
  return apiFetch("/api/auth/send-phone-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp({ channel, destination, code, purpose = "account_verification" }) {
  if (String(channel || "").toLowerCase() === "sms" && !SMS_ENABLED) {
    return Promise.reject(createComingSoonError(SMS_COMING_SOON_MESSAGE, "SMS_COMING_SOON"));
  }
  return apiFetch("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ channel, destination, code, purpose }),
  });
}
