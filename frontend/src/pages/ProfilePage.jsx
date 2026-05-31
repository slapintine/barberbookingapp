import { useEffect, useRef, useState } from "react";
import { FiArrowDownLeft, FiArrowLeft, FiArrowUpRight, FiBriefcase, FiCamera, FiCheckCircle, FiCreditCard, FiEdit2, FiHeart, FiLogOut, FiMoon, FiShield, FiSmartphone, FiSun, FiUser, FiX } from "react-icons/fi";
import { sendEmailVerification, sendPhoneOtp, verifyOtp } from "../api/authApi.js";
import TopUpWalletModal from "../components/wallet/TopUpWalletModal.jsx";
import { getPaymentMethodLabel } from "../utils/paymentLabels.js";
import { formatPlanName, formatSubscriptionPrice, PROVIDER_PLANS } from "../utils/subscriptionPlans.js";
import { formatCustomerPremiumPrice, isCustomerPremiumActive } from "../utils/customerPremium.js";

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
  theme = "dark",
  setTheme,
  currentUser,
  accountType,
  profile,
  setProfile,
  saveProfile,
  profileSaving,
  walletState,
  walletLoading,
  walletMessage,
  bookings = [],
  subscriptionState,
  subscriptionLoading,
  subscriptionMessage,
  pendingSubscriptionPayment,
  onUpgradeSubscription,
  onVerifySubscription,
  customerSubscriptionState,
  customerSubscriptionPlan,
  customerSubscriptionLoading,
  customerSubscriptionMessage,
  pendingCustomerSubscriptionPayment,
  onUpgradeCustomerPremium,
  onVerifyCustomerPremium,
  onOpenUpgradePlan,
  onRequestWithdrawal,
  onWalletUpdated,
  walletTopupReady = false,
  walletTopupMessage = "",
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
  const [savingEmail, setSavingEmail] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("");
  const [verificationPage, setVerificationPage] = useState("email");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailDraft, setEmailDraft] = useState(profile.email || "");
  const [changingEmail, setChangingEmail] = useState(false);
  const [verifiedChannels, setVerifiedChannels] = useState({
    email: Boolean(profile.emailVerified || profile.email_verified),
    phone: Boolean(profile.phoneVerified || profile.phone_verified),
  });
  const [resendCooldowns, setResendCooldowns] = useState({ email: 0, phone: 0 });
  const [withdrawAmount, setWithdrawAmount] = useState("10000");
  const [planDetailsTier, setPlanDetailsTier] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const initialPhone = splitPhoneNumber(profile.phone);
  const [phoneCountryCode, setPhoneCountryCode] = useState(initialPhone.countryCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(initialPhone.localNumber);
  const profilePhotoInputRef = useRef(null);
  const paymentHistoryRef = useRef(null);
  const isLightTheme = theme === "light";
  const nextTheme = isLightTheme ? "dark" : "light";
  const isProviderAccount = ["barber", "provider", "business"].includes(String(accountType || "").toLowerCase());

  useEffect(() => {
    const next = splitPhoneNumber(profile.phone);
    setPhoneCountryCode(next.countryCode);
    setPhoneLocalNumber(next.localNumber);
  }, [profile.phone]);

  useEffect(() => {
    setVerifiedChannels({
      email: Boolean(profile.emailVerified || profile.email_verified),
      phone: Boolean(profile.phoneVerified || profile.phone_verified),
    });
  }, [profile.emailVerified, profile.email_verified, profile.phoneVerified, profile.phone_verified]);

  useEffect(() => {
    setEmailDraft(profile.email || "");
    setEmailCode("");
    setEmailCodeSent(false);
    setChangingEmail(false);
    setResendCooldowns((prev) => ({ ...prev, email: 0 }));
  }, [profile.email]);

  const resetEmailVerificationCodeState = () => {
    setEmailCode("");
    setEmailCodeSent(false);
    setResendCooldowns((prev) => ({ ...prev, email: 0 }));
  };

  const startResendCooldown = (type) => {
    setResendCooldowns((prev) => ({ ...prev, [type]: type === "email" ? 60 : 45 }));
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
      setEmailCode("");
      setEmailCodeSent(false);
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
        setEmailCodeSent(true);
        setVerifyStatus(data?.message || "Verification code sent to your email. Check your inbox or spam folder.");
        startResendCooldown("email");
      } catch (error) {
        resetEmailVerificationCodeState();
        setVerifyError(error.message || "Email sending failed. Please try again later.");
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
      await sendPhoneOtp(profile.phone.trim());
      setVerifyStatus("Phone code sent.");
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
      if (type === "email") setVerifyingEmail(true);
      const data = await verifyOtp({
        channel: type === "email" ? "email" : "sms",
        destination,
        code: code.trim(),
      });
      setVerifyStatus(data?.message || "Verification completed.");
      setVerifiedChannels((prev) => ({ ...prev, [type]: true }));
      if (type === "email") {
        resetEmailVerificationCodeState();
        setProfile((prev) => ({ ...prev, emailVerified: true, email_verified: true }));
      }
    } catch (error) {
      setVerifyError(error.message || "Could not verify code.");
    } finally {
      if (type === "email") setVerifyingEmail(false);
    }
  };

  const saveEmailForVerification = async () => {
    const nextEmail = emailDraft.trim();
    setVerifyError("");
    setVerifyStatus("");
    if (!isValidEmail(nextEmail)) {
      setVerifyError("Please enter a valid email address.");
      return;
    }
    try {
      setSavingEmail(true);
      const previousEmail = String(profile.email || "").trim().toLowerCase();
      const saved = await saveProfile({ ...profile, email: nextEmail }, { localErrorOnly: true });
      const changed = previousEmail !== nextEmail.toLowerCase();
      setVerifiedChannels((prev) => ({ ...prev, email: changed ? false : Boolean(saved?.emailVerified || saved?.email_verified || prev.email) }));
      resetEmailVerificationCodeState();
      setChangingEmail(false);
      setVerifyStatus(changed ? "Email saved. Send a verification code to confirm it." : "Email saved.");
    } catch (error) {
      setVerifyError(error.message || "Could not save email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const walletAvailableBalance = Number(walletState?.wallet?.available_balance || 0);
  const walletPendingBalance = Number(walletState?.wallet?.pending_balance || 0);
  const walletLockedBalance = Number(walletState?.wallet?.locked_balance || 0);
  const walletTotalEarned = Number(walletState?.wallet?.total_earned || 0);
  const walletWithdrawnTotal = Number(walletState?.wallet?.withdrawn_total || 0);
  const walletTransactions = walletState?.transactions || [];
  const withdrawalRows = walletState?.withdrawals || [];
  const customerWalletBalance = Number(walletState?.wallet?.balance || 0);
  const customerWalletTransactions = walletState?.transactions || [];
  const customerTopups = walletState?.topups || [];
  const customerBookingPayments = (bookings || [])
    .filter((item) => {
      const customer = String(item.customerUsername || item.customer_username || item.customer || "");
      return !customer || customer === String(currentUser?.username || "");
    })
    .filter((item) => item.paymentMethod || item.payment_method || item.payment_status || item.status)
    .slice(0, 5);
  const subscriptionFeatures = subscriptionState?.features || {};
  const subscriptionPlans = PROVIDER_PLANS;
  const currentPlan = String(subscriptionState?.tier || "").toUpperCase();
  const currentPlanLabel = formatPlanName(currentPlan, "No active plan");
  const hasActivePlan = ["PLUS", "PREMIUM", "PLATINUM"].includes(currentPlan);
  const customerPremiumActive = isCustomerPremiumActive(customerSubscriptionState);
  const profileCompletionItems = [
    { label: "Add your name", done: Boolean(profile.fullName) },
    { label: "Add phone number", done: Boolean(profile.phone) },
    { label: "Set location", done: Boolean(profile.address) },
    { label: "Choose first service category", done: Boolean(favoriteBarbers.length || bookings.length) },
  ];
  const profileCompletionCount = profileCompletionItems.filter((item) => item.done).length;
  const customerPremiumExpiry = customerSubscriptionState?.expires_at
    ? new Date(customerSubscriptionState.expires_at).toLocaleDateString()
    : "";
  const openPaymentHistory = () => {
    paymentHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const saveProfileEdits = async () => {
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
  };

  if (editing) {
    return (
      <div className="content-v4 app-page-v4 profile-edit-page-v7">
        <div className="barber-profile-topbar-v4 profile-edit-topbar-v7">
          <button type="button" className="profile-back-btn-v4" onClick={() => setEditing(false)}>
            <FiArrowLeft />
          </button>
          <div className="profile-top-title-v4">Profile details</div>
          <button type="button" className="profile-back-btn-v4" onClick={() => setEditing(false)}>
            <FiX />
          </button>
        </div>

        <div className="simple-card-v4 profile-edit-card-v7">
          <div className="profile-hero-v4 profile-edit-hero-v7">
            <button
              type="button"
              className="avatar-v4 avatar-upload-v4"
              onClick={() => profilePhotoInputRef.current?.click()}
              title="Upload profile photo"
              style={{ border: "none", cursor: "pointer" }}
            >
              {profile.profilePhoto ? <img src={profile.profilePhoto} alt="profile" /> : <FiUser />}
              <span className="avatar-upload-badge-v4">
                <FiCamera />
              </span>
            </button>
            <div className="profile-main-copy-v4">
              <div className="profile-title-v4">{profile.fullName || currentUser?.username || "User"}</div>
              <div className="profile-sub-v4">Edit your public account details</div>
            </div>
          </div>

          <input
            ref={profilePhotoInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleProfilePhotoChange}
          />

          <div className="field-stack-v4">
            <label className="label-v4">
              Full name
              <input
                className="field-input-v4 profile-input-v4"
                value={profile.fullName || ""}
                onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))}
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
                >
                  {phoneCountries.map((item) => (
                    <option key={item.code} value={item.code}>{`${item.label} ${item.code}`}</option>
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
                />
              </div>
            </label>
            <label className="label-v4">
              Email
              <input
                className="field-input-v4 profile-input-v4"
                value={profile.email || ""}
                onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label className="label-v4">
              Address
              <input
                className="field-input-v4 profile-input-v4"
                value={profile.address || ""}
                onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))}
              />
            </label>
            <div className="label-v4">
              <span>Profile photo</span>
              <button type="button" className="secondary-btn-v4" onClick={() => profilePhotoInputRef.current?.click()}>
                <FiCamera /> {profile.profilePhoto ? "Change profile photo" : "Upload profile photo"}
              </button>
            </div>
          </div>

          {verifyError ? <div className="auth-error">{verifyError}</div> : null}
          {verifyStatus ? <div className="auth-success">{verifyStatus}</div> : null}

          <div className="inline-actions-v4 profile-edit-actions-v7">
            <button className="mini-action-btn-v4 success" type="button" onClick={saveProfileEdits} disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save updates"}
            </button>
            <button className="mini-action-btn-v4" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-v4 app-page-v4 profile-page-v15">
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
            <div className="profile-sub-v4">{isProviderAccount ? "Service provider account" : "Customer account"}</div>
          </div>
          <button className="fav-btn-v4 small" type="button" onClick={() => setEditing(true)}>
            <FiEdit2 />
          </button>
        </div>
      </div>

      <div className="simple-card-v4 queless-appearance-card">
        <div>
          <div className="panel-title-v4">Appearance</div>
          <div className="profile-sub-v4">
            Current mode: {isLightTheme ? "Light mode" : "Dark mode"}
          </div>
        </div>
        <button
          type="button"
          className="queless-theme-toggle"
          aria-label={`Switch to ${nextTheme} mode`}
          aria-pressed={isLightTheme}
          onClick={() => setTheme?.(nextTheme)}
        >
          <span className="queless-theme-toggle-track">
            <span className="queless-theme-toggle-thumb">{isLightTheme ? <FiSun /> : <FiMoon />}</span>
          </span>
          <strong>{isLightTheme ? "Light" : "Dark"}</strong>
        </button>
      </div>

      {!isProviderAccount ? (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Get ready for your first booking</div>
          <div className="profile-sub-v4">Complete your profile, set your area, browse categories, and save providers you trust. Customer Free stays available; Premium is only for Smart Match.</div>
          <div className="profile-review-list-v4 space-top">
            {profileCompletionItems.map((item) => (
              <div key={item.label} className="profile-review-card-v4">
                <div className="profile-review-head-v4">
                  <strong>{item.label}</strong>
                  <span className="profile-review-rating-v4">{item.done ? "Done" : "Next"}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="profile-sub-v4">{profileCompletionCount} of {profileCompletionItems.length} steps complete.</div>
          <div className="inline-actions-v4 space-top">
            <button type="button" className="mini-action-btn-v4 success" onClick={() => setEditing(true)}>Complete profile</button>
            <button type="button" className="mini-action-btn-v4" onClick={openPaymentHistory}>View payments</button>
          </div>
        </div>
      ) : null}

      {isProviderAccount ? (
        <div className="wallet-shell-v5">
          <div className="wallet-visual-card-v5">
            <div className="wallet-layer-stack-v5" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="wallet-visual-top-v5">
              <div>
                <div className="wallet-eyebrow-v5">Queless Business Wallet</div>
                <div className="wallet-status-chip-v5">Ledger active</div>
              </div>
              <div className="wallet-chip-v5" aria-hidden="true" />
            </div>
            <div className="wallet-balance-label-v5">Available balance</div>
            <div className="wallet-balance-hero-v5">UGX {walletAvailableBalance.toLocaleString()}</div>
            <div className="wallet-card-bottom-v5">
              <span>Track booking earnings, settlements, and payouts</span>
              <strong>**** {String(currentUser?.id || walletState?.wallet?.id || "0000").padStart(4, "0").slice(-4)}</strong>
            </div>
          </div>

          <div className="wallet-action-panel-v5">
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
                <FiArrowUpRight /> Request payout
              </button>
            </div>
          </div>

          {walletMessage ? <div className={walletMessage.toLowerCase().includes("could not") ? "auth-error" : "auth-success"}>{walletMessage}</div> : null}

          <div className="wallet-history-v5">
            <div className="wallet-section-head-v5">
              <div>
                <div className="wallet-section-title-v5">Recent payments</div>
                <div className="wallet-section-sub-v5">Booking earnings and settlement movement</div>
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
                  title="No business wallet activity yet"
                  text="Booking payments, settlements, and payouts will appear here."
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
                      {item.note || "Business wallet transaction"}
                      {item.status ? ` - ${String(item.status).replaceAll("_", " ")}` : ""}
                    </small>
                  </span>
                  <strong className={item.direction === "debit" ? "wallet-debit-v5" : "wallet-credit-v5"}>
                    {item.direction === "debit" ? "-" : "+"}UGX {Number(item.amount || 0).toLocaleString()}
                  </strong>
                </div>
              ))
            )}
          </div>

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
        </div>
      ) : (
        <div className="wallet-shell-v5 customer-pay-shell-v15">
          <div className="customer-pay-card-v15">
            <div className="customer-pay-glow-v15" aria-hidden="true" />
            <div className="customer-pay-card-top-v15">
              <div>
                <div className="customer-pay-brand-v15">Customer Wallet</div>
                <div className="customer-pay-status-v15">
                  <FiCheckCircle />
                  Pay for bookings
                </div>
              </div>
              <div className="customer-pay-chip-v15" aria-hidden="true">
                <span />
              </div>
            </div>
            <div className="customer-pay-main-v15">
              <span>Wallet Balance</span>
              <strong>UGX {customerWalletBalance.toLocaleString()}</strong>
              <small>Use your wallet balance to pay for bookings faster.</small>
            </div>
            <div className="customer-pay-card-bottom-v15">
              <span>
                Use Wallet for Booking
                <strong>{customerWalletBalance > 0 ? "Available when balance is enough" : "Top up to activate"}</strong>
              </span>
              <em>UGX</em>
            </div>
          </div>

          <div className="customer-wallet-actions-v15" aria-label="Customer wallet actions">
            <button type="button" onClick={() => setTopupOpen(true)}>
              <FiCreditCard /> Top Up Wallet
            </button>
            <button type="button" onClick={openPaymentHistory}>
              <FiCheckCircle /> Recent Activity
            </button>
          </div>

          <div className="customer-payment-methods-v15">
            <div className="wallet-section-head-v5">
              <div>
                <div className="wallet-panel-title-v5">Payment Methods</div>
                <div className="wallet-section-sub-v5">Pay at checkout when you book a service.</div>
              </div>
              <FiCreditCard />
            </div>
            <div className="customer-payment-copy-v15">
              Cash is always available. MTN Mobile Money appears only when Queless verifies that production payments are ready.
            </div>
            <div className="customer-method-grid-v15">
              <div className="customer-method-card-v15">
                <span className="customer-method-icon-v15"><FiCreditCard /></span>
                <div>
                  <strong>Cash</strong>
                  <span>Available for all bookings</span>
                </div>
              </div>
              <div className="customer-method-card-v15">
                <span className="customer-method-icon-v15"><FiSmartphone /></span>
                <div>
                  <strong>Mobile Money</strong>
                  <span>Available where supported</span>
                </div>
              </div>
              <div className="customer-method-card-v15">
                <span className="customer-method-icon-v15"><FiCheckCircle /></span>
                <div>
                  <strong>Payment History</strong>
                  <span>View past booking payments</span>
                </div>
              </div>
            </div>
          </div>

          <div className="wallet-history-v5 customer-payment-history-v15" ref={paymentHistoryRef}>
            <div className="wallet-section-head-v5">
              <div>
                <div className="wallet-section-title-v5">Recent booking payments</div>
                <div className="wallet-section-sub-v5">Receipts and payment status from your bookings</div>
              </div>
              <FiCreditCard />
            </div>
            {customerBookingPayments.length === 0 ? (
              <EmptyState
                icon={<FiCreditCard />}
                title="No booking payments yet"
                text="Your cash and mobile money booking payments will appear here."
              />
            ) : customerBookingPayments.map((item) => (
              <div key={item.id || `${item.barberId}-${item.date}-${item.time}`} className="wallet-row-v5">
                <span className="wallet-row-icon-v5 credit">
                  <FiCheckCircle />
                </span>
                <span className="wallet-row-copy-v5">
                  <strong>{getPaymentMethodLabel(item.paymentMethod || item.payment_method)}</strong>
                  <small>
                    {item.service || item.serviceName || "Booking"}
                    {item.payment_status ? ` - ${String(item.payment_status).replaceAll("_", " ")}` : ""}
                  </small>
                </span>
                <strong>UGX {Number(item.price || item.amount || 0).toLocaleString()}</strong>
              </div>
            ))}
          </div>

          <div className="wallet-history-v5">
            <div className="wallet-section-head-v5">
              <div>
                <div className="wallet-section-title-v5">Recent wallet activity</div>
                <div className="wallet-section-sub-v5">Top-ups, booking payments, and refunds</div>
              </div>
              <FiCreditCard />
            </div>
            {walletLoading ? (
              <EmptyState icon={<FiCreditCard />} title="Loading wallet" text="Fetching your wallet activity." />
            ) : customerWalletTransactions.length === 0 && customerTopups.length === 0 ? (
              <EmptyState icon={<FiCreditCard />} title="No wallet activity yet" text="Your top-ups and wallet booking payments will appear here." />
            ) : (
              [...customerWalletTransactions, ...customerTopups.map((item) => ({
                ...item,
                direction: String(item.status || "").toLowerCase() === "successful" && (item.walletCredited === true || Number(item.wallet_credited || 0) === 1) ? "credit" : "pending",
                description: `Wallet top-up - Payment Status: ${String(item.paymentStatus || item.status || "pending").replaceAll("_", " ")} - Wallet Credited: ${item.walletCredited === true || Number(item.wallet_credited || 0) === 1 ? "Yes" : "No"}`,
              }))]
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                .slice(0, 8)
                .map((item) => (
                  <div key={`wallet-${item.id}-${item.reference || ""}`} className="wallet-row-v5">
                    <span className={item.direction === "debit" ? "wallet-row-icon-v5 debit" : "wallet-row-icon-v5 credit"}>
                      {item.direction === "debit" ? <FiArrowUpRight /> : <FiArrowDownLeft />}
                    </span>
                    <span className="wallet-row-copy-v5">
                      <strong>{item.description || item.note || String(item.type || "wallet activity").replaceAll("_", " ")}</strong>
                      <small>{item.reference || item.provider || "Customer wallet"}</small>
                    </span>
                    <strong className={item.direction === "debit" ? "wallet-debit-v5" : item.direction === "credit" ? "wallet-credit-v5" : ""}>
                      {item.direction === "debit" ? "-" : item.direction === "credit" ? "+" : ""}UGX {Number(item.amount || 0).toLocaleString()}
                    </strong>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {isProviderAccount ? (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Subscription</div>
          <div className="profile-sub-v4">
            {hasActivePlan ? `Selected plan: ${currentPlanLabel}` : "Choose a provider plan to activate your business."}
            {subscriptionState?.is_trial
              ? ` - ${currentPlanLabel} trial ends in ${subscriptionState?.trial_days_left || 0} day${Number(subscriptionState?.trial_days_left || 0) === 1 ? "" : "s"}`
              : subscriptionState?.expires_at
              ? ` - Active until ${new Date(subscriptionState.expires_at).toLocaleDateString()}`
              : ""}
          </div>
          {!hasActivePlan ? <div className="profile-sub-v4">Choose a plan to activate your business.</div> : null}
          <div className="profile-review-list-v4">
            {subscriptionPlans.map((plan) => {
              const tier = plan.tier;
              const detail = plan.features.join(", ");
              return (
              <div key={tier} className="profile-review-card-v4">
                <div className="profile-review-head-v4">
                  <strong>{plan.name}</strong>
                  <span className="profile-review-rating-v4">{formatSubscriptionPrice(plan, "monthly")}</span>
                </div>
                <div className="profile-review-text-v4">{plan.summary}. {detail}.</div>
                <div className="inline-actions-v4">
                  <button
                    className="mini-action-btn-v4"
                    onClick={() => setPlanDetailsTier((current) => (current === tier ? "" : tier))}
                  >
                    View details
                  </button>
                  <button
                    className="mini-action-btn-v4 success"
                    onClick={() => onOpenUpgradePlan?.(tier)}
                    disabled={subscriptionLoading}
                  >
                    Choose Plan
                  </button>
                </div>
                {planDetailsTier === tier ? (
                  <div className="profile-review-text-v4">
                    Plan name: {plan.name}. Monthly price: {formatSubscriptionPrice(plan, "monthly")}. Annual price: {formatSubscriptionPrice(plan, "annual")}. Provider plans activate after mobile money payment. {detail}.
                  </div>
                ) : null}
              </div>
            );})}
          </div>
          <div className="profile-sub-v4">
            Visibility: {subscriptionFeatures.visibilityLabel || (subscriptionFeatures.homepageFeatured ? "Homepage featured" : "Regular listing")} - Analytics: {subscriptionFeatures.analyticsLevel || "none"} - Badge: {subscriptionFeatures.verifiedBadge ? "Verified" : subscriptionFeatures.topBarberBadge ? "Top business" : "Basic"}
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
      ) : (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Customer plan</div>
          <div className="profile-sub-v4">
            Customer Premium unlocks Smart Match while normal browsing, manual search, and booking stay free.
          </div>
          <div className="profile-review-list-v4">
            <div className="profile-review-card-v4">
              <div className="profile-review-head-v4">
                <strong>Free</strong>
                <span className="profile-review-rating-v4">Free</span>
              </div>
              <div className="profile-review-text-v4">Manual search, categories, provider profiles, and normal booking.</div>
            </div>
            <div className="profile-review-card-v4">
              <div className="profile-review-head-v4">
                <strong>Customer Premium</strong>
                <span className="profile-review-rating-v4">
                  {customerPremiumActive ? "Active" : formatCustomerPremiumPrice(customerSubscriptionPlan, "monthly")}
                </span>
              </div>
              <div className="profile-review-text-v4">
                Smart Match, ranked recommendations, budget matching, location matching, availability matching, and payment-option matching.
                {customerPremiumActive && customerPremiumExpiry ? ` Active until ${customerPremiumExpiry}.` : ""}
                {!customerPremiumActive && pendingCustomerSubscriptionPayment?.reference ? ` Payment pending: ${pendingCustomerSubscriptionPayment.reference}.` : ""}
              </div>
              <div className="inline-actions-v4">
                {customerPremiumActive ? (
                  <button className="mini-action-btn-v4 success" type="button" disabled>
                    Smart Match unlocked
                  </button>
                ) : (
                  <button
                    className="mini-action-btn-v4 success"
                    type="button"
                    onClick={() => onUpgradeCustomerPremium?.()}
                    disabled={customerSubscriptionLoading}
                  >
                    Upgrade to Premium
                  </button>
                )}
                {pendingCustomerSubscriptionPayment?.reference ? (
                  <button
                    className="mini-action-btn-v4"
                    type="button"
                    onClick={() => onVerifyCustomerPremium?.(pendingCustomerSubscriptionPayment.reference)}
                    disabled={customerSubscriptionLoading}
                  >
                    Verify Premium payment
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {customerSubscriptionMessage ? (
            <div className={customerSubscriptionMessage.toLowerCase().includes("could not") || customerSubscriptionMessage.toLowerCase().includes("failed") ? "auth-error" : "auth-success"}>
              {customerSubscriptionMessage}
            </div>
          ) : null}
        </div>
      )}
      <div className="simple-card-v4 profile-details-inline-v7">
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
                  <option key={item.code} value={item.code}>{`${item.label} ${item.code}`}</option>
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
            <button className="mini-action-btn-v4 success" onClick={saveProfileEdits}>
              {profileSaving ? "Saving..." : "Save updates"}
            </button>
          </div>
        )}
      </div>

      <div className="simple-card-v4 profile-confirm-card-v4">
        <div className="profile-confirm-copy-v4">
          <h3>Account security</h3>
          <p>Manage email verification for booking and account updates.</p>
        </div>

        <div className="security-status-grid-v7">
          <div className={verifiedChannels.email ? "security-status-card-v7 verified" : "security-status-card-v7"}>
            <FiShield />
            <strong>Email</strong>
            <span>{verifiedChannels.email ? "Verified" : profile.email?.trim() ? "Email not verified" : "Missing"}</span>
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
                      ? verifiedChannels.email
                        ? "Your email is verified."
                        : "Email not verified."
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
              <span className="verify-nav-arrow-v4">&rarr;</span>
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
                    {verifiedChannels.email
                      ? "Your email is verified for account recovery and booking updates."
                      : profile.email?.trim()
                      ? "Verify your email to receive booking and account updates."
                      : "Add your email to secure your account and receive booking updates."}
                  </div>
                </div>
                <span className={verifiedChannels.email ? "verify-status-chip-v4 ready verified" : profile.email?.trim() ? "verify-status-chip-v4 ready" : "verify-status-chip-v4 missing"}>
                  {verifiedChannels.email ? "Verified" : profile.email?.trim() ? "Email not verified" : "Missing"}
                </span>
              </div>

              {!profile.email?.trim() ? (
                <div className="verify-email-step-v16">
                  <label className="label-v4">
                    Email address
                    <input
                      className="field-input-v4 profile-input-v4"
                      placeholder="you@example.com"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                    />
                  </label>
                  <button type="button" className="mini-action-btn-v4 success" onClick={saveEmailForVerification} disabled={savingEmail}>
                    {savingEmail ? "Saving email..." : "Save email"}
                  </button>
                </div>
              ) : verifiedChannels.email ? (
                <div className="verify-channel-row-v4 verified-row-v16">
                  <strong><FiCheckCircle /> Email verified</strong>
                  <span>{profile.email.trim()}</span>
                </div>
              ) : (
                <>
                  <div className="verify-channel-row-v4">
                    <strong>Email not verified</strong>
                    <span>{profile.email.trim()}</span>
                    {!changingEmail ? (
                      <button type="button" className="verify-change-link-v16" onClick={() => {
                        setChangingEmail(true);
                        setEmailDraft("");
                        resetEmailVerificationCodeState();
                        setVerifyError("");
                        setVerifyStatus("");
                      }}>
                        Change email
                      </button>
                    ) : null}
                  </div>

                  {changingEmail ? (
                    <div className="verify-email-step-v16">
                      <label className="label-v4">
                        New email address
                        <input
                          className="field-input-v4 profile-input-v4"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                        />
                      </label>
                      <button type="button" className="mini-action-btn-v4 success" onClick={saveEmailForVerification} disabled={savingEmail}>
                        {savingEmail ? "Saving email..." : "Save email"}
                      </button>
                      <button type="button" className="verify-change-link-v16" onClick={() => {
                        setChangingEmail(false);
                        setEmailDraft(profile.email || "");
                        resetEmailVerificationCodeState();
                        setVerifyError("");
                        setVerifyStatus("");
                      }}>
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  {!emailCodeSent && !changingEmail ? (
                    <button type="button" className="mini-action-btn-v4 success" onClick={() => sendVerification("email")} disabled={sendingEmailCode || resendCooldowns.email > 0}>
                      {sendingEmailCode ? "Sending code..." : resendCooldowns.email > 0 ? `Resend in ${resendCooldowns.email}s` : "Send code"}
                    </button>
                  ) : null}

                  {emailCodeSent && !changingEmail ? (
                    <>
                      <label className="label-v4">
                        Verification code
                        <input
                          className="field-input-v4 profile-input-v4"
                          placeholder="Enter 6-digit code"
                          inputMode="numeric"
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        />
                      </label>
                      <div className="cooldown-note-v7">Check your inbox or spam folder.</div>
                      <div className="cooldown-note-v7">
                        {resendCooldowns.email > 0
                          ? `You can resend the code in ${resendCooldowns.email} seconds.`
                          : "You can resend the code now."}
                      </div>
                      <div className="verify-page-actions-v4">
                        <button type="button" className="mini-action-btn-v4 success" onClick={() => confirmVerification("email")} disabled={verifyingEmail}>
                          <FiCheckCircle /> {verifyingEmail ? "Verifying..." : "Verify code"}
                        </button>
                        <button type="button" className="mini-action-btn-v4" onClick={() => sendVerification("email")} disabled={sendingEmailCode || resendCooldowns.email > 0}>
                          {sendingEmailCode ? "Sending..." : "Resend code"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
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
                  &larr; Back to email
                </button>
              </div>
            </div>
          )}

          {verifyError ? <div className="auth-error">{verifyError}</div> : null}
          {verifyStatus ? <div className="auth-success">{verifyStatus}</div> : null}
        </div>
      </div>

      <div className="simple-card-v4">
        <div className="panel-title-v4">Saved businesses</div>
        {favoriteBarbers.length === 0 ? (
          <EmptyState
            icon={<FiHeart />}
            title="No saved businesses yet"
            text="Tap the heart on a business profile to keep it close."
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
          <div className="panel-title-v4">Create a business account</div>
          <div className="profile-sub-v4">Register your service business and choose a paid plan to manage bookings.</div>
          <button className="secondary-btn-v4" onClick={onRegisterBarber}>
            <FiBriefcase /> Create business
          </button>
        </div>
      ) : (
        <div className="simple-card-v4">
          <div className="panel-title-v4">Manage business</div>
          <div className="profile-sub-v4">Your business profile is active. You can edit details or remove the business from this account.</div>
          <div className="inline-actions-v4 space-top">
            <button className="secondary-btn-v4" onClick={onEditBarber}>
              <FiEdit2 /> Edit my business
            </button>
            <button className="secondary-btn-v4 danger-outline" onClick={onDeleteBarberStand}>
              Delete my business
            </button>
          </div>
        </div>
      )}

      <button className="secondary-btn-v4" onClick={logout}>
        <FiLogOut /> Log out
      </button>

      <TopUpWalletModal
        show={topupOpen}
        onClose={() => setTopupOpen(false)}
        ready={walletTopupReady}
        readinessMessage={walletTopupMessage}
        defaultPhone={profile.phone || currentUser?.phone || ""}
        onWalletUpdated={onWalletUpdated}
      />

    </div>
  );
}

