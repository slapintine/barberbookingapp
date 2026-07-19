import { useEffect, useMemo, useState } from "react";
import { FiBell, FiBellOff, FiCheckCircle, FiExternalLink, FiRefreshCw, FiSmartphone } from "react-icons/fi";
import { getNotificationTokenStatusRequest } from "../../api/notificationsApi.js";
import { getAuthToken } from "../../config/api.js";
import {
  disableFirebaseNotifications,
  enableFirebaseNotifications,
  getNativeNotificationPermissionState,
  getNotificationSupportState,
  getStoredPushToken,
  openPhoneNotificationSettings,
} from "../../pushNotifications.js";

const IN_APP_NOTE = "Your updates are still available under the notification bell.";

const STATE_COPY = {
  checking: {
    title: "Checking this device",
    description: "One moment while Queless checks your phone notification status.",
  },
  enabled: {
    title: "Phone notifications are on",
    description: "We'll let you know about bookings and important updates.",
  },
  off: {
    title: "Phone notifications are off",
    description: IN_APP_NOTE,
  },
  denied: {
    title: "Notifications are turned off",
    description: "Enable notifications in your phone settings to receive booking updates.",
  },
  unsupported: {
    title: "This browser can't receive phone notifications",
    description: IN_APP_NOTE,
  },
  unavailable: {
    title: "Phone notifications aren't available right now",
    description: IN_APP_NOTE,
  },
  failed: {
    title: "We couldn't finish setting this up",
    description: "Check your connection and try again.",
  },
  unauthenticated: {
    title: "Sign in to turn on notifications",
    description: "We'll connect notifications to your account after you sign in.",
  },
};

function mapSupportState(value) {
  if (value === "denied") return "denied";
  if (value === "unsupported") return "unsupported";
  if (["setup_missing", "delivery_unavailable", "service_worker"].includes(value)) return "unavailable";
  return "off";
}

function getFriendlyError(error) {
  const message = String(error?.message || error || "");
  if (/permission|blocked|denied/i.test(message)) {
    return "Notifications are turned off for Queless. You can enable them in your phone settings.";
  }
  return "We couldn't update phone notifications. Please try again.";
}

export default function PushNotificationSettings({ currentUser, onToast }) {
  const [status, setStatus] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const signedIn = Boolean(currentUser?.id || currentUser?.username || currentUser?.email || getAuthToken());
  const enabled = status === "enabled";
  const denied = status === "denied";
  const canTryEnable = signedIn && !busy && !["unsupported", "unavailable"].includes(status);
  const copy = STATE_COPY[status] || STATE_COPY.off;

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      if (!signedIn) {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }

      const support = getNotificationSupportState();
      const nativePermission = await getNativeNotificationPermissionState().catch(() => null);
      if (nativePermission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const storedToken = getStoredPushToken();
      if (!storedToken) {
        if (!cancelled) setStatus(mapSupportState(support));
        return;
      }

      if (support === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      try {
        const result = await getNotificationTokenStatusRequest(storedToken);
        if (!cancelled) setStatus(result?.registered ? "enabled" : mapSupportState(support));
      } catch {
        if (!cancelled) setStatus("enabled");
      }
    }

    refreshStatus();
    return () => {
      cancelled = true;
    };
  }, [signedIn, currentUser?.id, currentUser?.username, currentUser?.email, refreshKey]);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const icon = useMemo(() => {
    if (enabled) return <FiCheckCircle />;
    if (denied || status === "off") return <FiBellOff />;
    return <FiBell />;
  }, [denied, enabled, status]);

  const turnOn = async () => {
    if (!signedIn) {
      setStatus("unauthenticated");
      setMessage("Sign in before turning on phone notifications.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await enableFirebaseNotifications();
      if (!result?.success) {
        setStatus(mapSupportState(result?.reason || getNotificationSupportState()));
        setMessage(result?.reason === "denied"
          ? "Notifications are turned off for Queless. You can enable them in your phone settings."
          : "We couldn't turn on phone notifications. Please try again.");
        return;
      }

      const token = result.token || getStoredPushToken();
      if (token) {
        const serverStatus = await getNotificationTokenStatusRequest(token).catch(() => null);
        if (serverStatus && !serverStatus.registered) {
          setStatus("failed");
          setMessage("We couldn't finish setting this up. Please try again.");
          return;
        }
      }

      setStatus("enabled");
      setMessage("You're all set - we'll keep you updated.");
      onToast?.("Phone notifications are on", "You're all set - we'll keep you updated.", "system");
    } catch (error) {
      setStatus("failed");
      setMessage(getFriendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage("");
    try {
      await disableFirebaseNotifications();
      setStatus("off");
      setMessage("Phone notifications are off. Your in-app updates are still here.");
      onToast?.("Phone notifications are off", "Your in-app updates are still here.", "system");
    } catch (error) {
      setStatus("failed");
      setMessage(getFriendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const openSettings = async () => {
    try {
      const result = await openPhoneNotificationSettings();
      if (!result?.success) {
        setMessage("Open your phone settings and enable notifications for Queless.");
      }
      window.setTimeout(() => setRefreshKey((value) => value + 1), 800);
    } catch {
      setMessage("Open your phone settings and enable notifications for Queless.");
    }
  };

  return (
    <section className="simple-card-v4 settings-card-v6 push-settings-v1" aria-labelledby="phone-notifications-title">
      <div className="settings-section-head-v6">
        {icon}
        <div>
          <strong id="phone-notifications-title">{copy.title}</strong>
          <span>{copy.description}</span>
        </div>
      </div>

      <div className="push-master-row-v1">
        <div>
          <strong>Phone notifications</strong>
          <span>{enabled ? "On" : "Off"}</span>
        </div>
        <button
          type="button"
          className={enabled ? "queless-switch-v1 on" : "queless-switch-v1"}
          aria-label={enabled ? "Turn phone notifications off" : "Turn phone notifications on"}
          aria-pressed={enabled}
          disabled={busy || status === "checking" || status === "unsupported" || status === "unavailable" || !signedIn}
          onClick={enabled ? turnOff : turnOn}
        >
          <span />
        </button>
      </div>

      <div className="push-settings-list-v1" aria-label="Notification delivery">
        <div>
          <FiSmartphone />
          <span>Phone alerts for booking updates</span>
        </div>
        <div>
          <FiBell />
          <span>In-app bell updates stay available</span>
        </div>
      </div>

      <div className="inline-actions-v4 push-settings-actions-v1">
        {enabled ? (
          <button type="button" className="secondary-btn-v4" onClick={turnOff} disabled={busy}>
            <FiBellOff /> {busy ? "Updating..." : "Turn off phone notifications"}
          </button>
        ) : (
          <button type="button" className="secondary-btn-v4" onClick={turnOn} disabled={!canTryEnable}>
            <FiRefreshCw /> {busy ? "Turning on..." : status === "failed" ? "Try again" : "Turn on notifications"}
          </button>
        )}
        <button type="button" className="mini-action-btn-v4" onClick={openSettings}>
          <FiExternalLink /> Open phone settings
        </button>
      </div>

      {message ? (
        <div className={status === "enabled" || status === "off" ? "auth-success" : "auth-error"}>
          {message}
        </div>
      ) : null}
    </section>
  );
}
