import { useEffect, useRef, useState } from "react";
import { FiArrowDownLeft, FiArrowLeft, FiArrowUpRight, FiBriefcase, FiCamera, FiCheckCircle, FiCreditCard, FiEdit2, FiHeart, FiLogOut, FiShield, FiSmartphone, FiUser, FiX } from "react-icons/fi";
import { sendEmailVerification, sendPhoneOtp, verifyOtp } from "../api/authApi.js";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state-v7 compact">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export default function ProfilePage({
  currentUser,
  accountType,
  profile,
  setProfile,
  saveProfile,
  profileSaving,
  walletState,
  walletLoading,
  walletMessage,
  subscriptionState,
  subscriptionLoading,
  subscriptionMessage,
  pendingSubscriptionPayment,
  onUpgradeSubscription,
  onVerifySubscription,
  onTopUpWallet,
  onRequestWithdrawal,
  favoriteBarbers,
  myBarberProfile,
  onOpenBarber,
  onRegisterBarber,
  onEditBarber,
  onDeleteBarberStand,
  logout,
  phoneCountries,
  splitPhoneNumber,
  sanitizeDigits,
  buildPhoneNumber,
  isValidPhoneNumber,
  fileToDataUrl,
}) {
  const [editing, setEditing] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [sendingPhoneCode, setSendingPhoneCode] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("");
  const [verificationPage, setVerificationPage] = useState("email");
  const [verifiedChannels, setVerifiedChannels] = useState({
    email: Boolean(profile.emailVerified || profile.email_verified),
    phone: Boolean(profile.phoneVerified || profile.phone_verified),
  });
  const [resendCooldowns, setResendCooldowns] = useState({ email: 0, phone: 0 });
  const [topUpAmount, setTopUpAmount] = useState("10000");
  const [withdrawAmount, setWithdrawAmount] = useState("10000");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpMethod, setTopUpMethod] = useState("visa");
  const initialPhone = splitPhoneNumber(profile.phone);
  const [phoneCountryCode, setPhoneCountryCode] = useState(initialPhone.countryCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(initialPhone.localNumber);
  const profilePhotoInputRef = useRef(null);

  useEffect(() => {
    const next = splitPhoneNumber(profile.phone);
    setPhoneCountryCode(next.countryCode);
    setPhoneLocalNumber(next.localNumber);
  }, [profile.phone]);

  const startResendCooldown = (type) => {
    setResendCooldowns((prev) => ({ ...prev, [type]: 45 }));
    const timer = setInterval(() => {
      setResendCooldowns((prev) => {
        const nextValue = Math.max(0, Number(prev[type] || 0) - 1);
        if (nextValue <= 0) clearInterval(timer);
        return { ...prev, [type]: nextValue };
      });
    }, 1000);
  };

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await fileToDataUrl(file);
      setProfile((prev) => ({ ...prev, profilePhoto: result }));
      setVerifyStatus("Profile photo selected. Save updates to keep it.");
      setVerifyError("");
    } catch (error) {
      setVerifyError(error.message || "Could not load image.");
    } finally {
      event.target.value = "";
    }
  };

  const sendVerification = async (type) => {
    setVerifyError("");
    setVerifyStatus("");

    if (type === "email") {
      if (!profile.email?.trim()) {
        setVerifyError("Please save your email in Profile first.");
        return;
      }
      if (!isValidEmail(profile.email)) {
        setVerifyError("Enter a valid email address before requesting a code.");
        return;
      }
      if (resendCooldowns.email > 0) return;

      try {
        setSendingEmailCode(true);
        const data = await sendEmailVerification(profile.email.trim());
        setVerifyStatus(data?.devCode ? `Email code sent. Dev code: ${data.devCode}` : "Email code sent.");
        startResendCooldown("email");
      } catch (error) {
        setVerifyError(error.message || "Could not send email code.");
      } finally {
        setSendingEmailCode(false);
      }
      return;
    }

    if (!profile.phone?.trim()) {
      setVerifyError("Please save your phone number in Profile first.");
      return;
    }

    if (!isValidPhoneNumber(phoneCountryCode, phoneLocalNumber)) {
      setVerifyError(`Enter a valid phone number for ${phoneCountryCode} before requesting a code.`);
      return;
    }
    if (resendCooldowns.phone > 0) return;

    try {
      setSendingPhoneCode(true);
      const data = await sendPhoneOtp(profile.phone.trim());
      setVerifyStatus(data?.devCode ? `Phone code sent. Dev code: ${data.devCode}` : "Phone code sent.");
      startResendCooldown("phone");
    } catch (error) {
      setVerifyError(error.message || "Could not send phone code.");
    } finally {
      setSendingPhoneCode(false);
    }
  };

  const confirmVerification = async (type) => {
    setVerifyError("");
    setVerifyStatus("");

    const destination = type === "email" ? profile.email?.trim() : profile.phone?.trim();
    const code = type === "email" ? emailCode : phoneCode;
    if (!destination || !code.trim()) {
      setVerifyError("Enter the verification code first.");
      return;
    }

    try {
      const data = await verifyOtp({
        channel: type === "email" ? "email" : "sms",
        destination,
        code: code.trim(),
      });
      setVerifyStatus(data?.message || "Verification completed.");
      setVerifiedChannels((prev) => ({ ...prev, [type]: true }));
    } catch (error) {
      setVerifyError(error.message || "Could not verify code.");
    }
  };

  const walletAvailableBalance = Number(walletState?.wallet?.available_balance || 0);
  const walletPendingBalance = Number(walletState?.wallet?.pending_balance || 0);
  const walletLockedBalance = Number(walletState?.wallet?.locked_balance || 0);
  const walletTotalEarned = Number(walletState?.wallet?.total_earned || 0);
  const walletWithdrawnTotal = Number(walletState?.wallet?.withdrawn_total || 0);
  const walletTransactions = walletState?.transactions || [];
  const withdrawalRows = walletState?.withdrawals || [];
  const subscriptionFeatures = subscriptionState?.features || {};

  return (
    <div className="content-v4 standard-page-v4">
      <div className="simple-card-v4">
        <div className="profile-hero-v4">
          <button
            type="button"
            className="avatar-v4 avatar-upload-v4"
            onClick={() => editing && profilePhotoInputRef.current?.click()}
            title={editing ? "Upload profile photo" : "Profile photo"}
            style={{ border: "none", cursor: editing ? "pointer" : "default" }}
          >
            {profile.profilePhoto ? <img src={profile.profilePhoto} alt="profile" /> : <FiUser />}
            {editing ? (
              <span className="avatar-upload-badge-v4">
                <FiCamera />
              </span>
            ) : null}
          </button>
          <input
            ref={profilePhotoInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleProfilePhotoChange}
          />
          <div className="profile-main-copy-v4">
            <div className="profile-title-v4">{profile.fullName || currentUser?.username || "User"}</div>
            <div className="profile-sub-v4">{accountType === "barber" ? "Barber account" : "Customer account"}</div>
          </div>
          <button className="fav-btn-v4 small" type="button" onClick={() => setEditing((s) => !s)}>
            <FiEdit2 />
          </button>
        </div>
      </div>

      <div className="wallet-shell-v5">
        <div className="wallet-visual-card-v5">
          <div className="wallet-layer-stack-v5" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="wallet-visual-top-v5">
            <div>
            <div className="wallet-eyebrow-v5">Lineup Wallet</div>
              <div className="wallet-status-chip-v5">Active</div>
            </div>
            <div className="wallet-chip-v5" aria-hidden="true" />
          </div>
          <div className="wallet-balance-label-v5">{accountType === "barber" ? "Available balance" : "Ledger status"}</div>
          <div className="wallet-balance-hero-v5">UGX {walletAvailableBalance.toLocaleString()}</div>
          <div className="wallet-card-bottom-v5">
            <span>{accountType === "barber" ? "Pending, available and locked earnings" : "Booking payments are processed directly by the platform"}</span>
            <strong>**** {String(currentUser?.id || walletState?.wallet?.id || "0000").padStart(4, "0").slice(-4)}</strong>
          </div>
        </div>

        <div className="wallet-action-panel-v5">
          {accountType === "barber" ? (
            <>
              <div className="wallet-panel-title-v5">Ledger balances</div>
              <div className="wallet-action-grid-v5">
                <div className="wallet-field-v5">
                  <strong>Pending</strong>
                  <div>UGX {walletPendingBalance.toLocaleString()}</div>
                </div>
                <div className="wallet-field-v5">
                  <strong>Locked</strong>
                  <div>UGX {walletLockedBalance.toLocaleString()}</div>
                </div>
              </div>
              <div className="wallet-action-grid-v5">
                <div className="wallet-field-v5">
                  <strong>Total earned</strong>
                  <div>UGX {walletTotalEarned.toLocaleString()}</div>
                </div>
                <div className="wallet-field-v5">
                  <strong>Withdrawn</strong>
                  <div>UGX {walletWithdrawnTotal.toLocaleString()}</div>
                </div>
              </div>
              <div className="wallet-action-grid-v5">
                <label className="label-v4 wallet-field-v5">
                  Withdraw
                  <input
                    className="field-input-v4 profile-input-v4"
                    type="number"
                    min="1000"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                </label>
                <button
                  className="wallet-action-btn-v5 debit"
                  onClick={() => {
                    setVerifyError("");
                    if (Number(withdrawAmount || 0) < 1000) {
                      setVerifyError("Withdrawal amount must be at least UGX 1,000.");
                      return;
                    }
                    onRequestWithdrawal(withdrawAmount);
                  }}
                  disabled={walletLoading}
                >
                  <FiArrowUpRight /> Request
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="wallet-panel-title-v5">Booking payments</div>
              <div className="profile-sub-v4">Customers pay for bookings directly with MTN or Airtel Mobile Money. The platform confirms payment first, then settles barber earnings internally.</div>
            </>
          )}
        </div>

        {walletMessage ? <div className={walletMessage.toLowerCase().includes("could not") ? "auth-error" : "auth-success"}>{walletMessage}</div> : null}

        <div className="wallet-history-v5">
          <div className="wallet-section-head-v5">
            <div>
              <div className="wallet-section-title-v5">Recent activity</div>
              <div className="wallet-section-sub-v5">Latest wallet movement</div>
            </div>
            <FiCreditCard />
          </div>
          {walletTransactions.length === 0 ? (
            walletLoading ? (
              <div className="skeleton-list-v7" aria-label="Loading wallet activity">
                <span />
                <span />
                <span />
              </div>
            ) : (
              <EmptyState
                icon={<FiCreditCard />}
                title="No wallet activity yet"
                text="Top ups, payments, and withdrawals will appear here."
              />
            )
          ) : (
            walletTransactions.slice(0, 6).map((item) => (
              <div key={item.id} className="wallet-row-v5">
                <span className={item.direction === "debit" ? "wallet-row-icon-v5 debit" : "wallet-row-icon-v5 credit"}>
                  {item.direction === "debit" ? <FiArrowUpRight /> : <FiArrowDownLeft />}
                </span>
                <span className="wallet-row-copy-v5">
                  <strong>{String(item.type || "").replaceAll("_", " ")}</strong>
                  <small>
                    {item.note || "Wallet transaction"}
                    {item.status ? ` · ${String(item.status).replaceAll("_", " ")}` : ""}
                  </small>
                </span>
                <strong className={item.direction === "debit" ? "wallet-debit-v5" : "wallet-credit-v5"}>
                  {item.direction === "debit" ? "-" : "+"}UGX {Number(item.amount || 0).toLocaleString()}
                </strong>
              </div>
            ))
          )}
        </div>

        {accountType === "barber" ? (
          <div className="wallet-history-v5">
            <div className="wallet-section-title-v5">Withdrawals</div>
            {withdrawalRows.length === 0 ? (
              <EmptyState
                icon={<FiArrowUpRight />}
                title="No withdrawal requests"
                text="Requested payouts will be tracked here."
              />
            ) : withdrawalRows.slice(0, 4).map((item) => (
              <div key={item.id} className="wallet-row-v5">
                <span className="wallet-row-copy-v5">
                  <strong>{item.status}</strong>
                  <small>{item.note || "Withdrawal request"}</small>
                </span>
                <strong>UGX {Number(item.amount || 0).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {accountType === "barber" ? (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Subscription</div>
          <div className="profile-sub-v4">
            Current plan: {subscriptionState?.tier || "FREE"}
            {subscriptionState?.expires_at ? ` · Renews until ${new Date(subscriptionState.expires_at).toLocaleDateString()}` : ""}
          </div>
          <div className="profile-review-list-v4">
            {[
              ["FREE", 0, "Basic listing", "No analytics, low ranking"],
              ["STANDARD", 20000, "Higher ranking", "Visibility boost and basic analytics"],
              ["PREMIUM", 50000, "Homepage feature", "Top barber badge, promotions, advanced analytics"],
            ].map(([tier, price, headline, detail]) => (
              <div key={tier} className="profile-review-card-v4">
                <div className="profile-review-head-v4">
                  <strong>{tier}</strong>
                  <span className="profile-review-rating-v4">{price ? `UGX ${price.toLocaleString()}/mo` : "Current base"}</span>
                </div>
                <div className="profile-review-text-v4">{headline}. {detail}.</div>
                {tier !== "FREE" ? (
                  <div className="inline-actions-v4">
                    <button
                      className="mini-action-btn-v4 success"
                      onClick={() => onUpgradeSubscription?.(tier, "mtn_mobile_money")}
                      disabled={subscriptionLoading}
                    >
                      {subscriptionLoading ? "Starting..." : `Upgrade with MTN`}
                    </button>
                    <button
                      className="mini-action-btn-v4"
                      onClick={() => onUpgradeSubscription?.(tier, "airtel_money")}
                      disabled={subscriptionLoading}
                    >
                      Airtel
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="profile-sub-v4">
            Visibility: {subscriptionFeatures.homepageFeatured ? "Homepage featured" : "Regular listing"} ·
            Analytics: {subscriptionFeatures.analyticsLevel || "none"} ·
            Badge: {subscriptionFeatures.topBarberBadge ? "Top barber" : "Standard"}
          </div>
          {pendingSubscriptionPayment?.reference ? (
            <div className="inline-actions-v4 space-top">
              <button className="mini-action-btn-v4 success" onClick={() => onVerifySubscription?.(pendingSubscriptionPayment.reference)} disabled={subscriptionLoading}>
                Verify {pendingSubscriptionPayment.tier} payment
              </button>
            </div>
          ) : null}
          {subscriptionMessage ? <div className={subscriptionMessage.toLowerCase().includes("could not") ? "auth-error" : "auth-success"}>{subscriptionMessage}</div> : null}
        </div>
      ) : null}

      {showTopUpModal ? null : null}

      <div className="simple-card-v4">
        <div className="panel-title-v4">Profile details</div>
        <div className="field-stack-v4">
          <label className="label-v4">
            Full name
            <input
              className="field-input-v4 profile-input-v4"
              value={profile.fullName || ""}
              onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))}
              disabled={!editing}
            />
          </label>
          <label className="label-v4">
            Username
            <input
              className="field-input-v4 profile-input-v4"
              value={currentUser?.username || profile.username || ""}
              disabled
            />
          </label>
          <label className="label-v4">
            Phone
            <div className="phone-field-row-v4">
              <select
                className="country-code-select-v4"
                value={phoneCountryCode}
                onChange={(e) => {
                  const nextCode = e.target.value;
                  setPhoneCountryCode(nextCode);
                  setProfile((prev) => ({ ...prev, phone: buildPhoneNumber(nextCode, phoneLocalNumber) }));
                }}
                disabled={!editing}
              >
                {phoneCountries.map((item) => (
                  <option key={item.code} value={item.code}>{`${item.flag} ${item.code}`}</option>
                ))}
              </select>
              <input
                className="field-input-v4 profile-input-v4 phone-input-v4"
                value={phoneLocalNumber}
                placeholder="700123456"
                onChange={(e) => {
                  const local = sanitizeDigits(e.target.value).slice(0, 12);
                  setPhoneLocalNumber(local);
                  setProfile((prev) => ({ ...prev, phone: buildPhoneNumber(phoneCountryCode, local) }));
                }}
                disabled={!editing}
              />
            </div>
          </label>
          <label className="label-v4">
            Email
            <input
              className="field-input-v4 profile-input-v4"
              value={profile.email || ""}
              onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
              disabled={!editing}
            />
          </label>
          <label className="label-v4">
            Address
            <input
              className="field-input-v4 profile-input-v4"
              value={profile.address || ""}
              onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))}
              disabled={!editing}
            />
          </label>
          {editing ? (
            <div className="label-v4">
              <span>Profile photo</span>
              <button type="button" className="secondary-btn-v4" onClick={() => profilePhotoInputRef.current?.click()}>
                <FiCamera /> {profile.profilePhoto ? "Change profile photo" : "Upload profile photo"}
              </button>
            </div>
          ) : null}
        </div>
        {editing && (
          <div className="inline-actions-v4">
            <button className="mini-action-btn-v4 success" onClick={async () => {
              setVerifyError("");
              if (phoneLocalNumber && !isValidPhoneNumber(phoneCountryCode, phoneLocalNumber)) {
                setVerifyError(`Enter a valid phone number for ${phoneCountryCode}.`);
                return;
              }
              if (profile.email && !isValidEmail(profile.email)) {
                setVerifyError("Enter a valid email address.");
                return;
              }
              try {
                await saveProfile({ ...profile, phone: buildPhoneNumber(phoneCountryCode, phoneLocalNumber) });
                setEditing(false);
                setVerifyStatus("Profile updated successfully.");
              } catch (error) {
                setVerifyError(error.message || "Could not save profile.");
              }
            }}>
              {profileSaving ? "Saving..." : "Save updates"}
            </button>
          </div>
        )}
      </div>

      <div className="simple-card-v4 profile-confirm-card-v4">
        <div className="profile-confirm-copy-v4">
          <h3>Account security</h3>
          <p>Keep email and phone verification current for recovery, alerts, and booking trust.</p>
        </div>

        <div className="security-status-grid-v7">
          <div className={verifiedChannels.email ? "security-status-card-v7 verified" : "security-status-card-v7"}>
            <FiShield />
            <strong>Email</strong>
            <span>{verifiedChannels.email ? "Verified" : profile.email?.trim() ? "Ready to verify" : "Missing"}</span>
          </div>
          <div className={verifiedChannels.phone ? "security-status-card-v7 verified" : "security-status-card-v7"}>
            <FiSmartphone />
            <strong>Phone</strong>
            <span>{verifiedChannels.phone ? "Verified" : profile.phone?.trim() ? "Ready to verify" : "Missing"}</span>
          </div>
        </div>

        <div className="verify-pager-shell-v4">
          <div className="verify-pager-head-v4">
            <button
              type="button"
              className="verify-nav-btn-v4"
              onClick={() => setVerificationPage("email")}
              disabled={verificationPage === "email"}
            >
              <FiArrowLeft />
            </button>

            <div className="verify-pager-summary-v4">
              <div className="verify-pager-title-v4">
                {verificationPage === "email" ? "Email verification" : "Phone verification"}
              </div>
              <div className="verify-pager-sub-v4">
                {verificationPage === "email"
                  ? (profile.email?.trim()
                      ? "Your email is ready for verification."
                      : "Add and save your email first.")
                  : (profile.phone?.trim()
                      ? "Your phone number is ready for verification."
                      : "Add and save your phone number first.")}
              </div>
            </div>

            <button
              type="button"
              className="verify-nav-btn-v4"
              onClick={() => setVerificationPage("phone")}
              disabled={verificationPage === "phone"}
            >
              <span className="verify-nav-arrow-v4">→</span>
            </button>
          </div>

          <div className="verify-step-dots-v4">
            <button
              type="button"
              className={verificationPage == "email" ? "verify-step-dot-v4 active" : "verify-step-dot-v4"}
              onClick={() => setVerificationPage("email")}
              aria-label="Go to email verification"
            />
            <button
              type="button"
              className={verificationPage == "phone" ? "verify-step-dot-v4 active" : "verify-step-dot-v4"}
              onClick={() => setVerificationPage("phone")}
              aria-label="Go to phone verification"
            />
          </div>

          {verificationPage === "email" ? (
            <div className="verify-page-card-v4">
              <div className="verify-page-top-v4">
                <div>
                  <div className="verify-page-label-v4">Email verification</div>
                  <div className="verify-page-helper-v4">
                    We will send a code to your saved email so you can confirm account ownership.
                  </div>
                </div>
                <span className={verifiedChannels.email ? "verify-status-chip-v4 ready verified" : profile.email?.trim() ? "verify-status-chip-v4 ready" : "verify-status-chip-v4 missing"}>
                  {verifiedChannels.email ? "Verified" : profile.email?.trim() ? "Ready" : "Missing"}
                </span>
              </div>

              <div className="verify-channel-row-v4">
                <strong>Saved email</strong>
                <span>{profile.email?.trim() || "No email saved yet"}</span>
              </div>

              <button type="button" className="secondary-btn-v4 verify-send-btn-v4" onClick={() => sendVerification("email")} disabled={sendingEmailCode || resendCooldowns.email > 0}>
                {sendingEmailCode ? "Sending..." : resendCooldowns.email > 0 ? `Resend in ${resendCooldowns.email}s` : "Send code"}
              </button>
              <div className="cooldown-note-v7">Email codes can be requested every 45 seconds.</div>

              <label className="label-v4">
                Verification code
                <input
                  className="field-input-v4 profile-input-v4"
                  placeholder="Enter email code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                />
              </label>

              <div className="verify-page-actions-v4">
                <button type="button" className="mini-action-btn-v4 success" onClick={() => confirmVerification("email")}>
                  <FiCheckCircle /> Verify email
                </button>
                <button type="button" className="mini-action-btn-v4" onClick={() => setVerificationPage("phone")}>
                  Continue to phone →
                </button>
              </div>
            </div>
          ) : (
            <div className="verify-page-card-v4">
              <div className="verify-page-top-v4">
                <div>
                  <div className="verify-page-label-v4">Phone verification</div>
                  <div className="verify-page-helper-v4">
                    Use SMS verification for sign-in recovery and important account alerts.
                  </div>
                </div>
                <span className={verifiedChannels.phone ? "verify-status-chip-v4 ready verified" : profile.phone?.trim() ? "verify-status-chip-v4 ready" : "verify-status-chip-v4 missing"}>
                  {verifiedChannels.phone ? "Verified" : profile.phone?.trim() ? "Ready" : "Missing"}
                </span>
              </div>

              <div className="verify-channel-row-v4">
                <strong>Saved phone</strong>
                <span>{profile.phone?.trim() || "No phone number saved yet"}</span>
              </div>

              <button type="button" className="secondary-btn-v4 verify-send-btn-v4" onClick={() => sendVerification("phone")} disabled={sendingPhoneCode || resendCooldowns.phone > 0}>
                {sendingPhoneCode ? "Sending..." : resendCooldowns.phone > 0 ? `Resend in ${resendCooldowns.phone}s` : "Send code"}
              </button>
              <div className="cooldown-note-v7">SMS codes can be requested every 45 seconds.</div>

              <label className="label-v4">
                Verification code
                <input
                  className="field-input-v4 profile-input-v4"
                  placeholder="Enter phone code"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                />
              </label>

              <div className="verify-page-actions-v4">
                <button type="button" className="mini-action-btn-v4 success" onClick={() => confirmVerification("phone")}>
                  <FiCheckCircle /> Verify phone
                </button>
                <button type="button" className="mini-action-btn-v4" onClick={() => setVerificationPage("email")}>
                  ← Back to email
                </button>
              </div>
            </div>
          )}

          {verifyError ? <div className="auth-error">{verifyError}</div> : null}
          {verifyStatus ? <div className="auth-success">{verifyStatus}</div> : null}
        </div>
      </div>

      <div className="simple-card-v4">
        <div className="panel-title-v4">Saved barbers</div>
        {favoriteBarbers.length === 0 ? (
          <EmptyState
            icon={<FiHeart />}
            title="No saved barbers yet"
            text="Tap the heart on a barber profile to keep them close."
          />
        ) : (
          <div className="profile-review-list-v4">
            {favoriteBarbers.map((barber) => (
              <button
                key={barber.id}
                className="profile-review-card-v4 unstyled-card-btn-v4"
                type="button"
                onClick={() => onOpenBarber(barber)}
              >
                <div className="profile-review-head-v4">
                  <strong>{barber.business_name}</strong>
                  <span className="profile-review-rating-v4"><FiHeart /></span>
                </div>
                <div className="profile-review-text-v4">{barber.location}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!myBarberProfile ? (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Become a Barber</div>
          <div className="profile-sub-v4">Register your barber business and start managing appointments from your own dashboard.</div>
          <button className="secondary-btn-v4" onClick={onRegisterBarber}>
            <FiBriefcase /> Register as barber
          </button>
        </div>
      ) : (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Manage barber stand</div>
          <div className="profile-sub-v4">Your barber profile is active. You can edit your stand details or remove the stand from this account.</div>
          <div className="inline-actions-v4 space-top">
            <button className="secondary-btn-v4" onClick={onEditBarber}>
              <FiEdit2 /> Edit my barber stand
            </button>
            <button className="secondary-btn-v4 danger-outline" onClick={onDeleteBarberStand}>
              Delete my barber stand
            </button>
          </div>
        </div>
      )}

      <button className="secondary-btn-v4" onClick={logout}>
        <FiLogOut /> Log out
      </button>
    </div>
  );
}




