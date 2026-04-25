import { apiFetch } from "../config/api.js";

export function getMyWallet() {
  return apiFetch("/api/wallet/me");
}

export function topUpWallet(amount, method = "card", idempotencyKey = "") {
  return apiFetch("/api/wallet/top-up", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ amount, method, idempotencyKey }),
  });
}

export function verifyWalletTopUp(reference) {
  return apiFetch("/api/wallet/top-up/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}

export function requestWalletWithdrawal(amount, idempotencyKey = "") {
  return apiFetch("/api/wallet/withdraw", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ amount, idempotencyKey }),
  });
}
