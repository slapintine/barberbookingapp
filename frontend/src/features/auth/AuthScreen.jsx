import { useEffect, useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiMail, FiUser } from "react-icons/fi";
import logo from "../../assets/queless-logo-full.png";
import { sanitizeErrorMessage } from "../../utils/errorMessages.js";

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

const APP_BASE_PATH = normalizeBasePath(import.meta.env.VITE_BASE_PATH || import.meta.env.BASE_URL);

function appPath(path) {
  const normalized = String(path || "/").startsWith("/") ? String(path || "/") : `/${path}`;
  return APP_BASE_PATH ? `${APP_BASE_PATH}${normalized === "/" ? "/" : normalized}` : normalized;
}

function AuthTabs({ isLogin, isSignup, setAuthMode, clearAuthMessages }) {
  const setAuthPath = (nextMode) => {
    if (typeof window === "undefined") return;
    const nextPath = appPath(nextMode === "signup" ? "/signup" : "/login");
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  };

  const switchMode = (event, nextMode) => {
    event.preventDefault();
    event.stopPropagation();
    setAuthPath(nextMode);
    setAuthMode(nextMode);
    clearAuthMessages();
  };

  return (
    <div className="lineup-auth-tabs" role="tablist" aria-label="Authentication mode">
      <button
        type="button"
        role="tab"
        aria-selected={isLogin}
        className={isLogin ? "active" : ""}
        onPointerDown={(event) => switchMode(event, "login")}
        onClick={(event) => switchMode(event, "login")}
      >
        Log In
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={isSignup}
        className={isSignup ? "active" : ""}
        onPointerDown={(event) => switchMode(event, "signup")}
        onClick={(event) => switchMode(event, "signup")}
      >
        Sign Up
      </button>
    </div>
  );
}

export default function AuthScreen(props) {
  const {
    authMode,
    setAuthMode,
    authError,
    authSuccess,
    authLoading,
    usernameRef,
    emailRef,
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

  const setAuthPath = (nextMode) => {
    if (typeof window === "undefined") return;
    const nextPath = appPath(nextMode === "signup" ? "/signup" : "/login");
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  };

  const switchAuthMode = (event, nextMode) => {
    event.preventDefault();
    event.stopPropagation();
    setAuthPath(nextMode);
    setAuthMode(nextMode);
    clearAuthMessages();
  };

  useEffect(() => {
    if (resetCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setResetCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetCooldown]);

  const title = isReset
    ? "Enter reset code"
    : isForgot
    ? "Forgot password"
    : isLogin
    ? "Welcome back"
    : "Find trusted services";

  const subtitle = isReset
    ? "Enter the code from your email and choose a new password."
    : isForgot
    ? "Enter the email linked to your Queless account. We'll send a verification code to reset your password."
    : isLogin
    ? "Sign in to book, discover nearby providers, and manage your service requests."
    : "Create your Queless account to discover trusted providers wherever you are.";

  const startResetTimer = () => {
    setResetCooldown(45);
  };

  const handleAuthInput = () => {
    if (authError || authSuccess) clearAuthMessages();
  };

  return (
    <main className="lineup-auth-page" data-auth-mode={authMode}>
      <div className="lineup-auth-ambient" aria-hidden="true" />
      <div className="lineup-auth-shell">
        <div className="lineup-auth-hero">
          <div className="lineup-auth-brand">
            <img src={logo} alt="Queless" className="lineup-auth-logo" />
          </div>

          <div className="lineup-auth-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>

        <section className="lineup-auth-card" aria-label={`${title} form`}>
          {!isForgot && !isReset && (
            <AuthTabs
              isLogin={isLogin}
              isSignup={isSignup}
              setAuthMode={setAuthMode}
              clearAuthMessages={clearAuthMessages}
            />
          )}

        {isForgot && (
          <p className="lineup-auth-note">
            Enter the email linked to your Queless account. We'll send a verification code to reset your password.
          </p>
        )}

        {isReset && (
          <p className="lineup-auth-note">
            Enter the verification code sent to your email and choose a new password.
          </p>
        )}

        <div className="lineup-auth-form">
          {(isLogin || isSignup) && (
            <label className="lineup-auth-field">
              <FiUser />
              <span className="lineup-auth-label">{isLogin ? "Username or email" : "Username"}</span>
              <input
                ref={usernameRef}
                autoComplete="username"
                placeholder={isLogin ? "Enter your username or email" : "Choose a username"}
                onInput={handleAuthInput}
              />
            </label>
          )}

          {(isSignup || isForgot || isReset) && (
            <label className="lineup-auth-field">
              <FiMail />
              <span className="lineup-auth-label">Email address</span>
              <input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="Email address"
                onInput={handleAuthInput}
              />
            </label>
          )}

          {!isForgot && (
            <label className="lineup-auth-field">
              <FiLock />
              <span className="lineup-auth-label">{isReset ? "Verification code" : "Password"}</span>
              <input
                ref={passwordRef}
                type={isReset ? "text" : showPassword ? "text" : "password"}
                autoComplete={isLogin ? "current-password" : isReset ? "one-time-code" : "new-password"}
                placeholder={isReset ? "Verification code" : isLogin ? "Enter your password" : "Create a password"}
                onInput={handleAuthInput}
              />

              {!isReset && (
                <button
                  type="button"
                  className="lineup-auth-eye"
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
                <span className="lineup-auth-label">{isReset ? "New password" : "Confirm password"}</span>
                <input
                  ref={confirmPasswordRef}
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={isReset ? "New password" : "Confirm Password"}
                  onInput={handleAuthInput}
                />

                <button
                  type="button"
                  className="lineup-auth-eye"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
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

        {authError && <div className="lineup-auth-error">{sanitizeErrorMessage(authError)}</div>}
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
                  : "Send reset code"}
              </span>
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
            onClick={isReset ? handlePasswordReset : isLogin ? () => handleLogin({ rememberMe }) : handleRegister}
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

        {isLogin && (
          <p className="lineup-auth-switch">
            Don't have an account?{" "}
            <button
              type="button"
              onPointerDown={(event) => switchAuthMode(event, "signup")}
              onClick={(event) => switchAuthMode(event, "signup")}
            >
              Sign up
            </button>
          </p>
        )}

        {isSignup && (
          <p className="lineup-auth-switch">
            Already have an account?{" "}
            <button
              type="button"
              onPointerDown={(event) => switchAuthMode(event, "login")}
              onClick={(event) => switchAuthMode(event, "login")}
            >
              Log in
            </button>
          </p>
        )}
        </section>
      </div>
    </main>
  );
}
