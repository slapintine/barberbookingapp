import { useMemo, useState } from "react";
import { FiBell, FiBellOff, FiCheckCircle } from "react-icons/fi";
import {
  enableFirebaseNotifications,
  getNotificationSupportState,
} from "../../pushNotifications.js";

// User-facing copy only — no technical configuration details (push keys, VAPID,
// service-worker internals). Those belong in logs/admin diagnostics, not here.
// In-app alerts (the notification bell) keep working regardless of this state.
const IN_APP_NOTE = "You'll still see alerts in the notification bell.";

const STATE_COPY = {
  granted: {
    label: "Notifications enabled",
    text: "Booking, payment, wallet, and account alerts are active on this device.",
  },
  denied: {
    label: "Notifications blocked",
    text: `Notifications are blocked in your browser settings. Re-enable them there to get device alerts. ${IN_APP_NOTE}`,
  },
  unsupported: {
    label: "Notifications not supported",
    text: `Push notifications aren't supported on this browser. ${IN_APP_NOTE}`,
  },
  missing_config: {
    label: "Notifications temporarily unavailable",
    text: `Device notifications are temporarily unavailable. Please try again later. ${IN_APP_NOTE}`,
  },
  service_worker: {
    label: "Notifications temporarily unavailable",
    text: `Device notifications couldn't start in this browser right now. Please try again later. ${IN_APP_NOTE}`,
  },
  default: {
    label: "Enable notifications",
    text: "Get booking, payment, wallet, and account alerts on this device.",
  },
};

function getFriendlyNotificationMessage(error) {
  const message = String(error?.message || error || "");
  // Config/key/service-worker problems → generic, friendly "temporarily unavailable".
  if (/applicationServerKey|PushManager|subscribe|vapid|serviceworker|sw\b/i.test(message)) {
    return "Device notifications are temporarily unavailable. Please try again later.";
  }
  if (/permission|blocked|denied/i.test(message)) {
    return "Notifications are blocked in your browser settings. You can re-enable them there.";
  }
  return "Notifications couldn't be enabled right now. Please try again later.";
}

export default function PushNotificationSettings({ currentUser, onToast }) {
  const [state, setState] = useState(() => getNotificationSupportState());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
    ? "Notifications are saved for this device. Alerts may appear once push delivery is fully available."
          : "Notifications enabled on this device.");
        onToast?.("Notifications enabled", "This device is registered for Queless alerts.", "system");
      } else {
        setMessage(STATE_COPY[result.reason]?.text || "Notifications could not be enabled.");
      }
    } catch (error) {
      setMessage(getFriendlyNotificationMessage(error));
    } finally {
      setLoading(false);
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
          <FiBell /> {loading ? "Processing..." : enabled ? "Update notifications" : "Enable notifications"}
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
