import { useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiSave, FiShield, FiUser } from "react-icons/fi";

function isStrongPassword(value) {
  const text = String(value || "");
  return text.length >= 8 && /[A-Za-z]/.test(text) && /\d/.test(text);
}

export default function SettingsPage({
  currentUser,
  accountType,
  profile,
  onUpdateAccount,
  accountLoading,
  accountMessage,
  sessionExpiresAt,
}) {
  const [username, setUsername] = useState(currentUser?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async () => {
    setLocalError("");
    if (!username.trim()) {
      setLocalError("Username is required.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setLocalError("New passwords do not match.");
      return;
    }
    if (newPassword && !isStrongPassword(newPassword)) {
      setLocalError("New password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if ((username.trim() !== currentUser?.username || newPassword) && !currentPassword) {
      setLocalError("Enter your current password to update account security.");
      return;
    }

    const ok = await onUpdateAccount({
      username: username.trim(),
      currentPassword,
      newPassword,
    });

    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="content-v4 standard-page-v4">
      <div className="settings-hero-v6">
        <div className="settings-hero-icon-v6"><FiShield /></div>
        <div>
          <div className="panel-title-v4">Settings</div>
          <div className="profile-sub-v4">
            {accountType === "barber" ? "Service provider account controls" : "Customer account controls"}
          </div>
        </div>
      </div>

      <div className="simple-card-v4 settings-card-v6">
        <div className="settings-section-head-v6">
          <FiUser />
          <div>
            <strong>Account identity</strong>
              <span>{profile?.fullName || currentUser?.username || "Queless user"}</span>
          </div>
        </div>

        {sessionExpiresAt ? (
          <div className="field-hint-v7">
            Session expires {new Date(sessionExpiresAt).toLocaleString()}.
          </div>
        ) : null}

        <label className="label-v4">
          Username
          <input
            className="field-input-v4 profile-input-v4"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
      </div>

      <div className="simple-card-v4 settings-card-v6">
        <div className="settings-section-head-v6">
          <FiLock />
          <div>
            <strong>Change password</strong>
            <span>Use your current password before saving sensitive changes.</span>
          </div>
        </div>

        <div className="field-stack-v4">
          <label className="label-v4">
            Current password
            <div className="password-field-wrap-v4">
              <input
                className="field-input-v4 profile-input-v4 password-input-v4"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <button
                type="button"
                className="field-action-btn-v4 profile-action-btn-v4"
                onClick={() => setShowCurrentPassword((value) => !value)}
                aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
              >
                {showCurrentPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
          <label className="label-v4">
            New password
            <div className="password-field-wrap-v4">
              <input
                className="field-input-v4 profile-input-v4 password-input-v4"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <button
                type="button"
                className="field-action-btn-v4 profile-action-btn-v4"
                onClick={() => setShowNewPassword((value) => !value)}
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              >
                {showNewPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            <span className={newPassword && isStrongPassword(newPassword) ? "field-hint-v7 good" : "field-hint-v7"}>
              Use 8-64 characters with at least one letter and one number.
            </span>
          </label>
          <label className="label-v4">
            Confirm new password
            <div className="password-field-wrap-v4">
              <input
                className="field-input-v4 profile-input-v4 password-input-v4"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button
                type="button"
                className="field-action-btn-v4 profile-action-btn-v4"
                onClick={() => setShowConfirmPassword((value) => !value)}
                aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
              >
                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </label>
        </div>
      </div>

      {localError ? <div className="auth-error">{localError}</div> : null}
      {accountMessage ? <div className={accountMessage.toLowerCase().includes("could not") || accountMessage.toLowerCase().includes("incorrect") ? "auth-error" : "auth-success"}>{accountMessage}</div> : null}

      <button type="button" className="primary-btn-v4 settings-save-v6" onClick={handleSubmit} disabled={accountLoading}>
        <FiSave /> {accountLoading ? "Saving..." : "Save settings"}
      </button>
    </div>
  );
}
