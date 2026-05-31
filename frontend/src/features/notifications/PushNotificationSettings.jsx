import { useEffect, useMemo, useState } from "react";
import { FiBell, FiBellOff, FiCheckCircle, FiSend } from "react-icons/fi";
import {
  enableFirebaseNotifications,
  getNotificationSupportState,
  sendFirebaseTestNotification,
} from "../../pushNotifications.js";

const STATE_COPY = {
  granted: {
    label: "Notifications enabled",
    text: "Booking, payment, wallet, and announcement updates can arrive instantly on this device.",
  },
  denied: {
    label: "Notifications blocked",
    text: "Browser notifications are blocked. Enable them in your browser site settings to receive alerts.",
  },
  unsupported: {
    label: "Notifications not supported",
    text: "This browser or device does not support web push notifications.",
  },
  missing_config: {
    label: "Firebase setup needed",
    text: "Firebase web push keys are not configured for this frontend build yet.",
  },
  service_worker: {
    label: "Notifications unavailable",
    text: "The browser could not start the notification service worker for this app.",
  },
  default: {
    label: "Enable notifications",
    text: "Enable notifications to receive booking updates instantly.",
  },
};

export default function PushNotificationSettings({ currentUser, onToast }) {
  const [state, setState] = useState(() => getNotificationSupportState());
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setState(getNotificationSupportState());
  }, [currentUser?.id, currentUser?.username]);

  const copy = useMemo(() => STATE_COPY[state] || STATE_COPY.default, [state]);
  const canEnable = currentUser?.id && ["default", "granted"].includes(state);
  const enabled = state === "granted";

  const enableNotifications = async () => {
    if (!currentUser?.id) {
      setMessage("Sign in before enabling notifications.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const result = await enableFirebaseNotifications();
      const nextState = getNotificationSupportState();
      setState(nextState);
      if (result.success) {
        setMessage(result.result?.firebaseReady === false
          ? "Device saved. Firebase Admin is not configured on the backend yet."
          : "Notifications enabled on this device.");
        onToast?.("Notifications enabled", "This device is registered for Queless alerts.", "system");
      } else {
        setMessage(STATE_COPY[result.reason]?.text || "Notifications could not be enabled.");
      }
    } catch (error) {
      setMessage(error.message || "Could not enable notifications.");
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage("");
    try {
      const result = await sendFirebaseTestNotification();
      setMessage(result.message || "Test notification sent.");
    } catch (error) {
      setMessage(error.message || "Could not send test notification.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="simple-card-v4 settings-card-v6 push-settings-v1">
      <div className="settings-section-head-v6">
        {enabled ? <FiCheckCircle /> : state === "denied" ? <FiBellOff /> : <FiBell />}
        <div>
          <strong>{copy.label}</strong>
          <span>{copy.text}</span>
        </div>
      </div>

      <div className="inline-actions-v4 push-settings-actions-v1">
        <button
          type="button"
          className={enabled ? "mini-action-btn-v4 success" : "secondary-btn-v4"}
          onClick={enableNotifications}
          disabled={!canEnable || loading}
        >
          <FiBell /> {loading ? "Processing..." : enabled ? "Refresh device token" : "Enable notifications"}
        </button>
        <button
          type="button"
          className="mini-action-btn-v4"
          onClick={sendTest}
          disabled={!enabled || testing}
        >
          <FiSend /> {testing ? "Sending..." : "Send test notification"}
        </button>
      </div>

      {message ? (
        <div className={message.toLowerCase().includes("could not") || message.toLowerCase().includes("blocked") ? "auth-error" : "auth-success"}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
