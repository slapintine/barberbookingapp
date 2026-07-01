import { apiFetch } from "../config/api.js";
import { createComingSoonError, WALLET_PAYMENTS_COMING_SOON_MESSAGE, PAYMENTS_ENABLED } from "../utils/launchFlags.js";

export function getMyWallet() {
  return apiFetch("/api/wallet/me");
}

export function getCustomerWallet() {
  return apiFetch("/api/wallet/customer");
}

export function initiateCustomerWalletTopup({ amount, phoneNumber, method = "mtn_mobile_money", provider = method, idempotencyKey = "" }) {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(WALLET_PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/wallet/top-up/initiate", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ amount, phoneNumber, method, provider, idempotencyKey }),
  });
}

export function getCustomerWalletTopupStatus(reference) {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(WALLET_PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch(`/api/wallet/top-up/status/${encodeURIComponent(reference)}`);
}

export function topUpWallet(amount, method = "mtn_mobile_money", idempotencyKey = "") {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(WALLET_PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/wallet/top-up", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ amount, method, idempotencyKey }),
  });
}

export function verifyWalletTopUp(reference) {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(WALLET_PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/wallet/top-up/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}

export function requestWalletWithdrawal(amount, idempotencyKey = "") {
  if (!PAYMENTS_ENABLED) {
    return Promise.reject(createComingSoonError(WALLET_PAYMENTS_COMING_SOON_MESSAGE, "PAYMENTS_COMING_SOON"));
  }
  return apiFetch("/api/wallet/withdraw", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ amount, idempotencyKey }),
  });
}
