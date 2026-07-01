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
    text: `Notifications are not supported on this device or browser. ${IN_APP_NOTE}`,
  },
  delivery_unavailable: {
    label: "Device alerts aren't ready yet",
    text: `Booking updates will still appear in the notification bell. Device alerts can be enabled when push setup is ready.`,
  },
  service_worker: {
    label: "Notifications temporarily unavailable",
    text: `Device notifications couldn't start in this browser right now. Please try again later. ${IN_APP_NOTE}`,
  },
  token_registration: {
    label: "Notifications need another try",
    text: `Browser permission is on, but this device couldn't be registered for alerts. Please retry. ${IN_APP_NOTE}`,
  },
  unauthenticated: {
    label: "Sign in for notifications",
    text: `Sign in again before registering this device for alerts. ${IN_APP_NOTE}`,
  },
  default: {
    label: "Turn on notifications",
    text: "Get booking updates, reminders, and provider messages.",
  },
};

function getFriendlyNotificationMessage(error) {
  const message = String(error?.message || error || "");
  // Config/key/service-worker problems → generic, friendly "temporarily unavailable".
  if (/applicationServerKey|PushManager|subscribe|vapid|serviceworker|sw\b/i.test(message)) {
    return `Device alerts aren't ready yet. ${IN_APP_NOTE}`;
  }
  if (/permission|blocked|denied/i.test(message)) {
    return "Notifications are blocked in your browser settings. You can re-enable them there.";
  }
  return `Device alerts couldn't be enabled. ${IN_APP_NOTE}`;
}

export default function PushNotificationSettings({ currentUser, onToast }) {
  const [state, setState] = useState(() => getNotificationSupportState());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const copy = useMemo(() => STATE_COPY[state] || STATE_COPY.default, [state]);
  const retryable = ["service_worker", "token_registration", "delivery_unavailable"].includes(state);
  const canEnable = currentUser?.id && [
    "default",
    "granted",
    "service_worker",
    "token_registration",
    "delivery_unavailable",
  ].includes(state);
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
      if (result.success) {
        setState("granted");
        setMessage(result.result?.firebaseReady === false
          ? "Notifications are saved for this device. Alerts may appear once push delivery is fully available."
          : "Notifications enabled on this device.");
        onToast?.("Notifications enabled", "This device is registered for Queless alerts.", "system");
      } else {
        setState(result.reason || getNotificationSupportState());
        setMessage(STATE_COPY[result.reason]?.text || "Notifications could not be enabled.");
      }
    } catch (error) {
      const browserState = getNotificationSupportState();
      setState(browserState === "granted" ? "token_registration" : browserState);
      if (import.meta.env.DEV) {
        console.warn("[Queless notifications] Device registration failed; in-app alerts remain active.", {
          status: Number(error?.status || 0),
          serverUnavailable: Boolean(error?.serverUnavailable),
        });
      }
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
          <FiBell /> {loading ? "Processing..." : enabled ? "Update notifications" : retryable ? "Retry notifications" : "Enable notifications"}
        </button>
      </div>

      {message ? (
        <div className={enabled ? "auth-success" : "auth-error"}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
