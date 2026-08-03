import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  clearLoginFailures,
  getLoginLock,
  recordLoginFailure,
} from "../services/loginAttemptGuard.js";
import db from "../config/db.js";
import { run, get } from "../db/query.js";
import { otpEmail, passwordResetEmail, sendEmail } from "../services/emailService.js";
import { normalizePhoneNumber, sendOtpSms } from "../services/smsService.js";
import {
  createAuthSession,
  refreshAccessToken,
  revokeAllUserSessions,
  revokeAuthSession,
  rotateAuthSession,
} from "../services/authSessionService.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;
const EMAIL_OTP_COOLDOWN_SECONDS = 60;
const EMAIL_OTP_MAX_SENDS_PER_HOUR = 5;
const PASSWORD_RESET_SAFE_MESSAGE = "If an account exists for that email, we have sent password-reset instructions.";
const PASSWORD_RESET_INVALID_CODE_MESSAGE = "This code is invalid or has expired. Request a new code.";
const PASSWORD_RESET_EMAIL_FAILURE_MESSAGE = "We could not send the reset email. Please try again shortly.";

function sessionRequest(req) {
  return {
    userAgent: req.get("user-agent") || "",
    ipAddress: req.ip || req.socket?.remoteAddress || "",
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeLoginIdentifier(value) {
  return String(value || "").trim();
}

function normalizeIdentifierLookup(value) {
  return normalizeLoginIdentifier(value).toLowerCase();
}

function isValidUsername(value) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(normalizeUsername(value));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isEmailIdentifier(value) {
  return normalizeLoginIdentifier(value).includes("@");
}

function isValidLoginIdentifier(value) {
  const identifier = normalizeLoginIdentifier(value);
  if (!identifier) return false;
  if (isEmailIdentifier(identifier)) return isValidEmail(identifier);
  return isValidUsername(identifier);
}

function validatePasswordLength(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return "";
}

function validatePasswordPolicy(password, label = "Password") {
  const lengthMessage = validatePasswordLength(password);
  if (lengthMessage) return lengthMessage.replace(/^Password/, label);
  const value = String(password || "");
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return `${label} must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters, with a letter and a number.`;
  }
  return "";
}

function findUserByUsernameOrEmail(identifier) {
  const value = normalizeLoginIdentifier(identifier);
  // Match usernames AND emails case-insensitively and whitespace-trimmed so a
  // user who signed up as "Timothy" can still log in typing "timothy" (this was
  // the live bug: the email path was already case-insensitive, the username path
  // was not, so a case/whitespace mismatch looked like a wrong password). An
  // exact-case username still wins when legacy rows differ only by case.
  const normalized = normalizeIdentifierLookup(value);

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT u.id, u.username, u.password_hash, u.role, u.account_status,
              u.email_verified_at, u.disabled_at, u.blocked_at, u.created_at,
              p.email
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE LOWER(TRIM(u.username)) = ? OR LOWER(TRIM(p.email)) = ?
       ORDER BY CASE WHEN u.username = ? THEN 0 ELSE 1 END, u.id ASC
       LIMIT 1`,
      [normalized, normalized, value],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function findUserByUsername(username) {
  const value = String(username || "").trim();
  const normalized = value.toLowerCase();
  // Case-insensitive + trimmed so uniqueness checks and self-lookups can't be
  // bypassed (or missed) by case/whitespace. Exact case is preferred when two
  // legacy rows differ only by case, so a self-lookup resolves deterministically.
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, password_hash, role, account_status, created_at
       FROM users
       WHERE LOWER(TRIM(username)) = ?
       ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [normalized, value],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function findUserByEmail(email) {
  return get(
    `SELECT u.id, u.username, u.password_hash, u.role, u.account_status, u.created_at, p.email
     FROM users u
     INNER JOIN profiles p ON p.user_id = u.id
     WHERE LOWER(p.email) = ?
     LIMIT 1`,
    [normalizeEmail(email)]
  );
}

function authError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message,
  });
}

function getInactiveAccountCode(user = {}) {
  const status = String(user.account_status || "active").trim().toLowerCase();
  if (["inactive", "blocked", "disabled", "suspended"].includes(status) || user.disabled_at || user.blocked_at) {
    return "ACCOUNT_INACTIVE";
  }
  if (["unverified", "pending_verification"].includes(status)) {
    return "ACCOUNT_UNVERIFIED";
  }
  return "";
}

function createUser(username, passwordHash) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, password_hash, role)
       VALUES (?, ?, 'customer')`,
      [username, passwordHash],
      function (err) {
        if (err) {
          reject(err);
          return;
        }

        db.get(
          `SELECT id, username, role, created_at
           FROM users
           WHERE id = ?`,
          [this.lastID],
          (selectErr, row) => {
            if (selectErr) reject(selectErr);
            else resolve(row);
          }
        );
      }
    );
  });
}

function createEmptyProfile(userId, email = "") {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
       VALUES (?, '', '', ?, '', '')`,
      [userId, normalizeEmail(email)],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function makeOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendEmailOtp(destination, code) {
  return sendEmail({
    to: destination,
    ...otpEmail({ code, purpose: "account_verification" }),
  });
}

async function createOtp({ userId = null, channel, destination, purpose = "account_verification" }) {
  const code = makeOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await run(
    `UPDATE otp_codes
     SET used_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?
       AND channel = ?
       AND destination = ?
       AND purpose = ?
       AND verified_at IS NULL
       AND used_at IS NULL`,
    [userId, channel, destination, purpose]
  ).catch(() => {});

  await run(
    `INSERT INTO otp_codes (user_id, channel, destination, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, channel, destination, purpose, codeHash, expiresAt]
  );

  return code;
}

async function getLatestOtp({ channel, destination, purpose }) {
  return get(
    `SELECT *
     FROM otp_codes
     WHERE channel = ? AND destination = ? AND purpose = ? AND verified_at IS NULL AND used_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [channel, destination, purpose]
  );
}

async function getOtpSendCountLastHour({ userId, channel, destination, purpose }) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const row = await get(
    `SELECT COUNT(*) AS count
     FROM otp_codes
     WHERE user_id = ?
       AND channel = ?
       AND destination = ?
       AND purpose = ?
       AND created_at > ?`,
    [userId, channel, destination, purpose, since]
  );
  return Number(row?.count || 0);
}

function timestampMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const raw = String(value);
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
    ? raw
    : `${raw.includes("T") ? raw : raw.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getLatestOtpCreatedAt({ userId, channel, destination, purpose }) {
  const row = await get(
    `SELECT created_at
     FROM otp_codes
     WHERE user_id = ?
       AND channel = ?
       AND destination = ?
       AND purpose = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, channel, destination, purpose]
  );
  return row?.created_at || null;
}

async function verifyOtpCode(row, code) {
  if (!row) throw Object.assign(new Error("Please send a code first."), { statusCode: 404 });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("Code expired. Please request a new one."), { statusCode: 400 });
  }
  if (Number(row.attempts || 0) >= Number(row.max_attempts || 5)) {
    throw Object.assign(new Error("Too many attempts. Try again later."), { statusCode: 429 });
  }

  const matches = await bcrypt.compare(String(code || "").trim(), row.code_hash);
  if (!matches) {
    await run(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
    const nextAttempts = Number(row.attempts || 0) + 1;
    if (nextAttempts >= Number(row.max_attempts || 5)) {
      throw Object.assign(new Error("Too many attempts. Try again later."), { statusCode: 429 });
    }
    throw Object.assign(new Error("Incorrect code. Please try again."), { statusCode: 400 });
  }

  await run(`UPDATE otp_codes SET verified_at = CURRENT_TIMESTAMP, used_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
  return true;
}

export async function registerUser(req, res, next) {
  try {
    const { username, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required."
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message: "Username must be 3-32 characters and use only letters, numbers, dots, dashes, or underscores."
      });
    }

    const passwordLengthMessage = validatePasswordLength(password);
    if (passwordLengthMessage) {
      return res.status(400).json({
        success: false,
        message: passwordLengthMessage
      });
    }

    const normalizedUsername = normalizeUsername(username);
    const existingUser = await findUserByUsername(normalizedUsername);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists."
      });
    }

    const existingEmailUser = await findUserByEmail(email);
    if (existingEmailUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(normalizedUsername, passwordHash);
    await createEmptyProfile(user.id, email);

    const session = await createAuthSession(user, sessionRequest(req));

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      ...session,
    });
  } catch (error) {
    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const identifier = normalizeLoginIdentifier(req.body.identifier || req.body.username || req.body.email || "");
    const password = String(req.body.password || "");

    if (!identifier && !password) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your email or username and password.");
    }

    if (!identifier) {
      return authError(res, 400, "VALIDATION_ERROR", "Enter your email or username.");
    }

    if (!password) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your password.");
    }

    if (!isValidLoginIdentifier(identifier)) {
      return authError(res, 400, "VALIDATION_ERROR", "Enter a valid email or username.");
    }

    // Per-account temporary lockout (layered on top of the per-IP authRateLimiter)
    // so a distributed/IP-rotating attacker still can't brute-force one account.
    // Checked before the password comparison and keyed by the submitted identifier
    // so it behaves identically for real and non-existent accounts (anti-enumeration).
    const loginKey = normalizeIdentifierLookup(identifier);
    const existingLock = getLoginLock(loginKey);
    if (existingLock.locked) {
      res.setHeader("Retry-After", String(existingLock.retryAfterSeconds));
      return authError(res, 429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Please try again in a few minutes.");
    }

    const user = await findUserByUsernameOrEmail(identifier);

    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordMatches) {
      // Same message and code path whether the account is missing or the password
      // is wrong, so the response never reveals which accounts exist.
      const lock = recordLoginFailure(loginKey);
      if (lock.locked) {
        res.setHeader("Retry-After", String(lock.retryAfterSeconds));
        return authError(res, 429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Please try again in a few minutes.");
      }
      return authError(res, 401, "INVALID_CREDENTIALS", "The email, username, or password is incorrect.");
    }

    const inactiveCode = getInactiveAccountCode(user);
    if (inactiveCode) {
      return authError(res, 403, inactiveCode, "This account is not active. Please contact support or verify your account.");
    }

    // Successful login clears the account's failure counter.
    clearLoginFailures(loginKey);
    const session = await createAuthSession(user, sessionRequest(req));

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      ...session,
    });
  } catch (error) {
    error.publicMessage = "Login failed. Please try again.";
    next(error);
  }
}

export async function updateAccount(req, res, next) {
  try {
    const currentUser = await findUserByUsername(req.user.username);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Account not found."
      });
    }

    const nextUsername = String(req.body.username || "").trim();
    const currentPassword = String(req.body.currentPassword || "");
    const nextPassword = String(req.body.newPassword || "");
    const wantsUsernameChange = nextUsername && nextUsername !== currentUser.username;
    const wantsPasswordChange = Boolean(nextPassword);

    if (!wantsUsernameChange && !wantsPasswordChange) {
      return res.status(400).json({
        success: false,
        message: "No account changes submitted."
      });
    }

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required for account changes."
      });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, currentUser.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect."
      });
    }

    if (wantsUsernameChange) {
      if (!isValidUsername(nextUsername)) {
        return res.status(400).json({
          success: false,
          message: "Username must be 3-32 characters and use only letters, numbers, dots, dashes, or underscores."
        });
      }

      const existingUser = await findUserByUsername(nextUsername);
      if (existingUser && existingUser.id !== currentUser.id) {
        return res.status(409).json({
          success: false,
          message: "Username already exists."
        });
      }
    }

    const nextPasswordLengthMessage = validatePasswordLength(nextPassword);
    if (wantsPasswordChange && nextPasswordLengthMessage) {
      return res.status(400).json({
        success: false,
        message: nextPasswordLengthMessage
      });
    }

    const passwordHash = wantsPasswordChange
      ? await bcrypt.hash(nextPassword, 10)
      : currentUser.password_hash;
    const finalUsername = wantsUsernameChange ? nextUsername : currentUser.username;

    const updateResult = await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users
         SET username = ?, password_hash = ?
         WHERE id = ?`,
        [finalUsername, passwordHash, currentUser.id],
        function (err) {
          if (err) reject(err);
          else resolve({ changes: this?.changes ?? 0 });
        }
      );
    });

    // Never report success when the write did not land on the user's row —
    // otherwise the UI shows "Account updated" while the password never changed.
    if (!updateResult.changes) {
      return res.status(500).json({
        success: false,
        message: "We couldn't update your account. Please try again.",
      });
    }

    const user = {
      id: currentUser.id,
      username: finalUsername,
      role: currentUser.role,
      created_at: currentUser.created_at
    };
    const token = refreshAccessToken(user, req.authSessionId);

    return res.status(200).json({
      success: true,
      message: "Account updated.",
      token,
      user
    });
  } catch (error) {
    next(error);
  }
}

export async function sendEmailVerification(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }
    const purpose = String(req.body.purpose || "account_verification").trim();
    const profile = await get(`SELECT email FROM profiles WHERE user_id = ?`, [req.user.id]);
    if (!profile?.email) {
      return res.status(404).json({ success: false, message: "Email not found. Add your email before requesting a code." });
    }
    if (normalizeEmail(profile?.email) !== email) {
      return res.status(400).json({ success: false, message: "Save this email before requesting a verification code." });
    }
    const user = await get(`SELECT email_verified_at FROM users WHERE id = ?`, [req.user.id]);
    if (user?.email_verified_at) {
      return res.status(409).json({ success: false, message: "Email already verified." });
    }

    const latest = await getLatestOtp({ channel: "email", destination: email, purpose });
    if (latest?.created_at) {
      const elapsedMs = Date.now() - new Date(latest.created_at).getTime();
      const waitSeconds = Math.max(0, EMAIL_OTP_COOLDOWN_SECONDS - Math.floor(elapsedMs / 1000));
      if (waitSeconds > 0) {
        return res.status(429).json({
          success: false,
          message: `You can request another code in ${waitSeconds} seconds.`,
          retryAfter: waitSeconds,
        });
      }
    }
    const hourlyCount = await getOtpSendCountLastHour({
      userId: req.user.id,
      channel: "email",
      destination: email,
      purpose,
    });
    if (hourlyCount >= EMAIL_OTP_MAX_SENDS_PER_HOUR) {
      return res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
    }

    const code = await createOtp({
      userId: req.user?.id || null,
      channel: "email",
      destination: email,
      purpose,
    });
    const otpRow = await getLatestOtp({ channel: "email", destination: email, purpose });
    await run(
      `UPDATE users
       SET email_verification_code_hash = ?,
           email_verification_expires_at = ?,
           last_email_code_sent_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [otpRow?.code_hash || "", otpRow?.expires_at || null, req.user.id]
    ).catch(() => {});
    await sendEmailOtp(email, code);

    res.status(200).json({ success: true, message: "Verification code sent to your email. Check your inbox or spam folder.", retryAfter: EMAIL_OTP_COOLDOWN_SECONDS });
  } catch (error) {
    if (/email sending failed/i.test(error.message || "")) {
      const isProviderAuthError = Number(error.statusCode || 0) === 401 || Number(error.statusCode || 0) === 403;
      const devMessage =
        isProviderAuthError && process.env.NODE_ENV !== "production"
          ? "Email service is not connected locally. Update RESEND_API_KEY, then try again."
          : "Email sending failed. Please try again later.";
      return res.status(error.statusCode || 502).json({
        success: false,
        code: isProviderAuthError ? "EMAIL_PROVIDER_AUTH_FAILED" : "EMAIL_SENDING_FAILED",
        message: devMessage,
      });
    }
    next(error);
  }
}

export async function sendPhoneOtp(req, res, next) {
  try {
    const phone = normalizePhoneNumber(req.body.phone || "");
    if (!phone) {
      return res.status(400).json({ success: false, message: "Valid phone number is required." });
    }

    await sendOtpSms({
      phone,
      userId: req.user?.id || null,
      purpose: req.body.purpose || "account_verification",
    });

    res.status(200).json({
      success: true,
      message: "Phone verification code sent.",
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const channel = String(req.body.channel || "").trim().toLowerCase();
    const rawDestination = String(req.body.destination || "").trim();
    const destination = channel === "sms" ? normalizePhoneNumber(rawDestination) : normalizeEmail(rawDestination);
    const purpose = String(req.body.purpose || "account_verification").trim();
    const code = String(req.body.code || "").trim();

    if (!["email", "sms"].includes(channel) || !destination || !code) {
      return res.status(400).json({ success: false, message: "Channel, destination, and code are required." });
    }

    const row = await getLatestOtp({ channel, destination, purpose });
    await verifyOtpCode(row, code);
    if (channel === "email" && purpose === "account_verification") {
      const profile = await get(`SELECT email FROM profiles WHERE user_id = ?`, [req.user.id]);
      if (!profile?.email || normalizeEmail(profile.email) !== normalizeEmail(destination)) {
        return res.status(404).json({ success: false, message: "Email not found. Add your email before verifying." });
      }
      await run(
        `UPDATE users
         SET email_verified_at = CURRENT_TIMESTAMP,
             email_verification_code_hash = '',
             email_verification_expires_at = NULL
         WHERE id = ?
           AND EXISTS (
             SELECT 1 FROM profiles p
             WHERE p.user_id = users.id
               AND LOWER(TRIM(p.email)) = ?
           )`,
        [req.user.id, normalizeEmail(destination)]
      );
    }

    res.status(200).json({
      success: true,
      message: channel === "email" ? "Email verified" : "Verification completed.",
      channel,
      destination,
      verified: true,
    });
  } catch (error) {
    next(error);
  }
}

export function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user
  });
}

export async function requestPasswordReset(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email || req.body.destination);

    if (!email) {
      return res.status(400).json({ success: false, message: "Enter your registered email address." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }

    const row = await findUserByEmail(email);

    if (!row?.email || getInactiveAccountCode(row)) {
      return res.status(200).json({
        success: true,
        message: PASSWORD_RESET_SAFE_MESSAGE,
      });
    }

    const destination = normalizeEmail(row.email);
    const resetScope = {
      userId: row.id,
      channel: "email",
      destination,
      purpose: "password_reset",
    };
    const latestCreatedAt = await getLatestOtpCreatedAt(resetScope);
    const cooldownRemaining = Math.max(
      0,
      EMAIL_OTP_COOLDOWN_SECONDS - Math.floor((Date.now() - timestampMs(latestCreatedAt)) / 1000)
    );
    const sendsLastHour = await getOtpSendCountLastHour(resetScope);

    if (cooldownRemaining > 0) {
      return res.status(200).json({
        success: true,
        message: PASSWORD_RESET_SAFE_MESSAGE,
        retryAfter: cooldownRemaining,
      });
    }

    if (sendsLastHour >= EMAIL_OTP_MAX_SENDS_PER_HOUR) {
      return res.status(200).json({
        success: true,
        message: PASSWORD_RESET_SAFE_MESSAGE,
        retryAfter: 60 * 60,
      });
    }

    const code = await createOtp({
      userId: row.id,
      channel: "email",
      destination,
      purpose: "password_reset",
    });
    try {
      await sendEmail({
        to: destination,
        ...passwordResetEmail({ code }),
      });
    } catch (error) {
      req.log?.warn?.({ err: error, userId: row.id, providerCode: error.providerCode || "" }, "password reset email delivery failed");
      return res.status(503).json({
        success: false,
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        message: PASSWORD_RESET_EMAIL_FAILURE_MESSAGE,
      });
    }

    return res.status(200).json({ success: true, message: PASSWORD_RESET_SAFE_MESSAGE });
  } catch (error) {
    next(error);
  }
}

export async function confirmPasswordReset(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || "").trim();
    const nextPassword = String(req.body.newPassword || req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || req.body.passwordConfirmation || "");

    if (!email || !code || !nextPassword) {
      return res.status(400).json({ success: false, message: "Email, code, and new password are required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    if (confirmPassword && confirmPassword !== nextPassword) {
      return res.status(400).json({ success: false, message: "The passwords do not match." });
    }
    const resetPasswordPolicyMessage = validatePasswordPolicy(nextPassword, "New password");
    if (resetPasswordPolicyMessage) {
      return res.status(400).json({ success: false, message: resetPasswordPolicyMessage });
    }

    const row = await findUserByEmail(email);

    if (!row?.email || getInactiveAccountCode(row)) {
      return res.status(400).json({ success: false, message: PASSWORD_RESET_INVALID_CODE_MESSAGE });
    }

    const otpRow = await getLatestOtp({
      channel: "email",
      destination: normalizeEmail(row.email),
      purpose: "password_reset",
    });
    try {
      await verifyOtpCode(otpRow, code);
    } catch (error) {
      const status = Number(error.statusCode || error.status || 400);
      return res.status(status === 429 ? 429 : 400).json({
        success: false,
        message: status === 429 ? "Too many incorrect attempts. Request a new code." : PASSWORD_RESET_INVALID_CODE_MESSAGE,
      });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, row.id]);

    const user = {
      id: row.id,
      username: row.username,
      role: row.role,
      created_at: row.created_at,
    };
    await revokeAllUserSessions(user.id);
    const session = await createAuthSession({ ...row, ...user }, sessionRequest(req));

    return res.status(200).json({
      success: true,
      message: "Your password has been changed. You can now sign in.",
      ...session,
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshSession(req, res, next) {
  try {
    const refreshToken = String(req.body.refreshToken || req.body.refresh_token || "").trim();
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "Refresh token is required." });
    }
    const session = await rotateAuthSession(refreshToken);
    return res.status(200).json({ success: true, message: "Session refreshed.", ...session });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

export async function logoutSession(req, res, next) {
  try {
    const refreshToken = String(req.body.refreshToken || req.body.refresh_token || "").trim();
    await revokeAuthSession({ refreshToken });
    return res.status(200).json({ success: true, message: "Logged out." });
  } catch (error) {
    next(error);
  }
}
