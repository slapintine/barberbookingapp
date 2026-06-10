import { useState } from "react";
import PaymentFlowModal from "../payments/PaymentFlowModal.jsx";
import { getCustomerWalletTopupStatus, initiateCustomerWalletTopup } from "../../api/walletApi.js";
import "./TopUpWalletModal.css";

const MIN_TOPUP_AMOUNT = 1000;
const MAX_TOPUP_AMOUNT = 5000000;

function getTopupStatusKind(status) {
  const normalized = String(status || "").toLowerCase();
  if (["successful", "success", "completed"].includes(normalized)) return "success";
  if (["failed", "cancelled", "expired"].includes(normalized)) return "failed";
  if (["unknown", "unreachable"].includes(normalized)) return "warning";
  if (["pending", "processing", "initiated"].includes(normalized)) return "pending";
  return "pending";
}

function isConfirmedTopupSuccess(data, topup) {
  const status = String(data?.paymentStatus || topup?.paymentStatus || topup?.status || "").toLowerCase();
  return status === "successful" && (data?.walletCredited === true || topup?.walletCredited === true || Number(topup?.wallet_credited || 0) === 1);
}

export default function TopUpWalletModal({
  show = false,
  onClose,
  ready = false,
  readinessMessage = "",
  airtelReady = false,
  airtelReadinessMessage = "",
  defaultPhone = "",
  onWalletUpdated,
}) {
  const topupKey = show ? "open" : "closed";
  const [pendingTopupEntry, setPendingTopupEntry] = useState({ key: "", value: null });
  const [loadingEntry, setLoadingEntry] = useState({ key: "", value: false });
  const [messageEntry, setMessageEntry] = useState({ key: "", value: "" });
  const pendingTopup = pendingTopupEntry.key === topupKey ? pendingTopupEntry.value : null;
  const loading = loadingEntry.key === topupKey ? loadingEntry.value : false;
  const message = messageEntry.key === topupKey ? messageEntry.value : "";
  const setPendingTopup = (updater) => {
    setPendingTopupEntry((prev) => {
      const current = prev.key === topupKey ? prev.value : null;
      return {
        key: topupKey,
        value: typeof updater === "function" ? updater(current) : updater,
      };
    });
  };
  const setLoading = (value) => setLoadingEntry({ key: topupKey, value });
  const setMessage = (value) => setMessageEntry({ key: topupKey, value });

  const submitTopup = async ({ amount, method, phoneNumber }) => {
    setMessage("");
    if (!["mtn_mobile_money", "airtel_money"].includes(method)) {
      setMessage("Choose MTN Mobile Money or Airtel Money.");
      return false;
    }
    if (method === "mtn_mobile_money" && !ready) {
      setMessage(readinessMessage || "MTN Mobile Money is not available right now.");
      return false;
    }
    if (method === "airtel_money" && !airtelReady) {
      setMessage(airtelReadinessMessage || "Airtel Money is not available right now.");
      return false;
    }

    try {
      setLoading(true);
      setMessage(`Starting secure ${method === "airtel_money" ? "Airtel Money" : "MTN Mobile Money"} request...`);
      const data = await initiateCustomerWalletTopup({
        amount,
        method,
        provider: method,
        phoneNumber,
        idempotencyKey: `wallet-topup-${Date.now()}`,
      });
      const topup = data.topup || null;
      const status = data.paymentStatus || topup?.paymentStatus || topup?.status || "pending";
      const kind = isConfirmedTopupSuccess(data, topup) ? "success" : getTopupStatusKind(status);
      setPendingTopup({
        reference: topup?.reference || data.transactionId || "",
        provider: topup?.provider || method,
        status: kind === "success" ? "successful" : "pending",
        amount,
      });
      setMessage(data.message || "Payment request sent. Please check your phone and enter your mobile money PIN to approve.");
      if (kind === "success") await onWalletUpdated?.();
      return true;
    } catch (error) {
      setMessage(error.message || "Top-up failed or was not completed. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (reference) => {
    if (!reference) return false;
    try {
      setLoading(true);
      const data = await getCustomerWalletTopupStatus(reference);
      const topup = data.topup || pendingTopup;
      const status = data.paymentStatus || topup?.paymentStatus || topup?.status || "pending";
      const kind = isConfirmedTopupSuccess(data, topup) ? "success" : getTopupStatusKind(status);
      setPendingTopup((prev) => ({
        ...prev,
        reference,
        provider: topup?.provider || prev?.provider || "mtn_mobile_money",
        status: kind === "success" ? "successful" : kind,
      }));
      setMessage(
        kind === "success"
          ? "Top-up successful. Your wallet balance has been updated."
          : kind === "failed"
          ? "Top-up failed or was not completed. Please try again."
          : kind === "warning"
          ? "We could not confirm this payment yet. Please check again shortly."
          : "Payment is still pending. Please approve the mobile money prompt on your phone."
      );
      if (kind === "success") {
        await onWalletUpdated?.();
        window.setTimeout(() => onClose?.(), 1400);
      }
      return kind === "success";
    } catch (error) {
      setMessage(error.message || "Could not check top-up status.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaymentFlowModal
      show={show}
      title="Top Up Wallet"
      subtitle="Enter an amount, choose mobile money method, then confirm."
      amountLabel="Wallet top-up amount"
      amount={10000}
      amountEditable
      minAmount={MIN_TOPUP_AMOUNT}
      maxAmount={MAX_TOPUP_AMOUNT}
      defaultPhone={defaultPhone}
      loading={loading}
      message={message}
      pendingPayment={pendingTopup}
      mtnReady={ready}
      mtnReadinessMessage={readinessMessage}
      airtelReady={airtelReady}
      airtelReadinessMessage={airtelReadinessMessage}
      submitLabel="Confirm Top Up"
      onClose={onClose}
      onSubmit={submitTopup}
      onVerify={checkStatus}
    />
  );
}
