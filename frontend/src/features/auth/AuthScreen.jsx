import { useState } from "react";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiUser } from "react-icons/fi";
import logo from "../../assets/logo.png";

export default function AuthScreen(props) {
  const {
    authMode,
    setAuthMode,
    authError,
    authSuccess,
    authLoading,
    usernameRef,
    passwordRef,
    confirmPasswordRef,
    handleLogin,
    handleRegister,
    sendPasswordResetCode,
    handlePasswordReset,
    clearAuthMessages,
  } = props;

  const [resetCooldown, setResetCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const isReset = authMode === "reset";
  const isForgot = authMode === "forgot";
  const isLogin = authMode === "login";
  const isSignup = authMode === "signup";

  const title = isReset
    ? "Enter reset code"
    : isForgot
    ? "Forgot password"
    : isLogin
    ? "Welcome back"
    : "Create account";

  const subtitle = isReset
    ? "Enter the code from your email and choose a new password."
    : isForgot
    ? "Use your username or email to receive a reset code."
    : isLogin
    ? "Sign in to continue"
    : "Create your Line Up account";

  const startResetTimer = () => {
    setResetCooldown(45);

    const timer = setInterval(() => {
      setResetCooldown((value) => {
        if (value <= 1) {
          clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  return (
    <main className="lineup-auth-page">
      <div className="lineup-auth-glow lineup-auth-glow-top" aria-hidden="true" />
      <div className="lineup-auth-glow lineup-auth-glow-bottom" aria-hidden="true" />
      <div className="lineup-auth-shell">
      <section className="lineup-auth-card">
        <div className="lineup-auth-brand">
          <img src={logo} alt="Line Up" className="lineup-auth-logo" />
        </div>

        <div className="lineup-auth-header">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        {!isForgot && !isReset && (
          <div className="lineup-auth-tabs">
            <button
              type="button"
              className={isLogin ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                clearAuthMessages();
              }}
            >
              Log In
            </button>

            <button
              type="button"
              className={isSignup ? "active" : ""}
              onClick={() => {
                setAuthMode("signup");
                clearAuthMessages();
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        {isForgot && (
          <p className="lineup-auth-note">
            Enter your username or email. We will send a verification code before you choose a new password.
          </p>
        )}

        {isReset && (
          <p className="lineup-auth-note">
            Email sent. Enter the verification code and your new password.
          </p>
        )}

        <div className="lineup-auth-form">
          <label className="lineup-auth-field">
            <FiUser />
            <input
              ref={usernameRef}
              placeholder={isReset || isForgot ? "Username or email" : "Username"}
            />
          </label>

          {!isForgot && (
            <label className="lineup-auth-field">
              <FiLock />
              <input
                ref={passwordRef}
                type={isReset ? "text" : showPassword ? "text" : "password"}
                placeholder={isReset ? "Verification code" : "Password"}
              />

              {!isReset && (
                <button
                  type="button"
                  className="lineup-auth-eye"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              )}
            </label>
          )}

          {(isSignup || isReset) && (
            <>
              <label className="lineup-auth-field">
                <FiLock />
                <input
                  ref={confirmPasswordRef}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={isReset ? "New password" : "Confirm Password"}
                />

                <button
                  type="button"
                  className="lineup-auth-eye"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                >
                  {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </label>

              <p className="lineup-auth-hint">
                Passwords must be 8-64 characters and include at least one letter and one number.
              </p>
            </>
          )}
        </div>

        {isLogin && (
          <div className="lineup-auth-row">
            <label className="lineup-auth-check">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe((value) => !value)}
              />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              className="lineup-auth-link"
              onClick={() => {
                setAuthMode("forgot");
                clearAuthMessages();
              }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {authError && <div className="lineup-auth-error">{authError}</div>}
        {authSuccess && <div className="lineup-auth-success">{authSuccess}</div>}

        {isForgot ? (
          <>
            <button
              type="button"
              className="lineup-auth-submit"
              disabled={authLoading || resetCooldown > 0}
              onClick={async () => {
                const sent = await sendPasswordResetCode();
                if (sent) startResetTimer();
              }}
            >
              <span>
                {authLoading
                  ? "Sending..."
                  : resetCooldown > 0
                  ? `Resend in ${resetCooldown}s`
                  : "Send email code"}
              </span>
              {!authLoading && resetCooldown === 0 && <FiArrowRight />}
            </button>

            <p className="lineup-auth-hint center">
              Reset codes can be requested every 45 seconds.
            </p>
          </>
        ) : (
          <button
            type="button"
            className="lineup-auth-submit"
            disabled={authLoading}
            onClick={isReset ? handlePasswordReset : isLogin ? handleLogin : handleRegister}
          >
            <span>
              {authLoading
                ? "Please wait..."
                : isReset
                ? "Reset Password"
                : isLogin
                ? "Log In"
                : "Create Account"}
            </span>
            {!authLoading && <FiArrowRight />}
          </button>
        )}

        {(isForgot || isReset) && (
          <button
            type="button"
            className="lineup-auth-back"
            onClick={() => {
              setAuthMode("login");
              clearAuthMessages();
            }}
          >
            Back to login
          </button>
        )}
      </section>
      </div>
    </main>
  );
}
