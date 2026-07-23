import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  clearLoginFailures,
  getLoginLock,
  recordLoginFailure,
} from "../services/loginAttemptGuard.js";
import {
  AUDIT_EVENTS,
  hashAuditEmail,
  recordAuditEvent,
} from "../services/auditLogService.js";
import db from "../config/db.js";
import { run, get } from "../db/query.js";
import { otpEmail, passwordResetEmail, sendEmail } from "../services/emailService.js";
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

function isValidUsername(value) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(normalizeUsername(value));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function validatePasswordLength(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return "";
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
    `SELECT u.id, u.username, u.password_hash, u.role, u.account_status,
            u.email_verified_at, u.disabled_at, u.blocked_at, u.created_at, p.email,
            b.id AS barber_id,
            b.subscription_tier,
            COALESCE(
              (
                SELECT bs.tier
                FROM barber_subscriptions bs
                WHERE bs.barber_id = b.id
                  AND COALESCE(bs.is_active, 0) = 1
                  AND LOWER(COALESCE(bs.status, '')) IN ('active', 'trialing')
                ORDER BY bs.id DESC
                LIMIT 1
              ),
              b.subscription_tier
            ) AS provider_plan
     FROM users u
     INNER JOIN profiles p ON p.user_id = u.id
     LEFT JOIN barbers b ON b.owner_user_id = u.id AND b.deleted_at IS NULL
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

async function createUniqueUsernameFromEmail(email) {
  const localPart = normalizeEmail(email).split("@")[0] || "queless";
  const base = localPart
    .replace(/[^a-zA-Z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 24) || "queless";
  let candidate = base.length >= 3 ? base : `${base}user`.slice(0, 24);
  let suffix = 0;
  while (await findUserByUsername(candidate)) {
    suffix += 1;
    const tail = String(suffix);
    candidate = `${base.slice(0, Math.max(3, 31 - tail.length))}${tail}`;
  }
  return candidate;
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
    const password = String(req.body.password || "");
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required."
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    const requestedUsername = normalizeUsername(req.body.username || "");
    if (requestedUsername && !isValidUsername(requestedUsername)) {
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

    const normalizedUsername = requestedUsername || await createUniqueUsernameFromEmail(email);
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
    let emailSent = false;
    try {
      const code = await createOtp({
        userId: user.id,
        channel: "email",
        destination: email,
        purpose: "account_verification",
      });
      const otpRow = await getLatestOtp({ channel: "email", destination: email, purpose: "account_verification" });
      await run(
        `UPDATE users
         SET email_verification_code_hash = ?,
             email_verification_expires_at = ?,
             last_email_code_sent_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [otpRow?.code_hash || "", otpRow?.expires_at || null, user.id]
      ).catch(() => {});
      await sendEmailOtp(email, code);
      emailSent = true;
    } catch {
      emailSent = false;
    }

    const session = await createAuthSession(user, sessionRequest(req));

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Account created. Check your email to verify your Queless account."
        : "Account created. We could not send the verification email right now, but you can resend it from Profile.",
      emailVerificationRequired: true,
      emailVerificationSent: emailSent,
      ...session,
    });
  } catch (error) {
    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email || req.body.username || "");
    const password = String(req.body.password || "");

    if (!email && !password) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your email and password.");
    }

    if (!email) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your email address.");
    }

    if (!isValidEmail(email)) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter a valid email address.");
    }

    if (!password) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your password.");
    }

    // Per-account temporary lockout (layered on top of the per-IP authRateLimiter)
    // so a distributed/IP-rotating attacker still can't brute-force one account.
    // Checked before the password comparison and keyed by the submitted identifier
    // so it behaves identically for real and non-existent accounts (anti-enumeration).
    const existingLock = getLoginLock(email);
    if (existingLock.locked) {
      res.setHeader("Retry-After", String(existingLock.retryAfterSeconds));
      await recordAuditEvent({
        eventType: AUDIT_EVENTS.ACCOUNT_LOCKOUT,
        targetType: "account",
        metadata: { emailHash: hashAuditEmail(email), reason: "already_locked" },
        req,
      });
      return authError(res, 429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Please try again in a few minutes.");
    }

    const user = await findUserByEmail(email);

    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordMatches) {
      // Same message and code path whether the account is missing or the password
      // is wrong, so the response never reveals which accounts exist.
      const lock = recordLoginFailure(email);
      // Failed login: store only a hashed email, never the plain address.
      await recordAuditEvent({
        eventType: AUDIT_EVENTS.LOGIN_FAILURE,
        actorUserId: user?.id ?? null,
        targetType: "account",
        metadata: { emailHash: hashAuditEmail(email) },
        req,
      });
      if (lock.locked) {
        res.setHeader("Retry-After", String(lock.retryAfterSeconds));
        await recordAuditEvent({
          eventType: AUDIT_EVENTS.ACCOUNT_LOCKOUT,
          actorUserId: user?.id ?? null,
          targetType: "account",
          metadata: { emailHash: hashAuditEmail(email), reason: "failed_attempt_threshold" },
          req,
        });
        return authError(res, 429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Please try again in a few minutes.");
      }
      return authError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const inactiveCode = getInactiveAccountCode(user);
    if (inactiveCode) {
      return authError(res, 403, inactiveCode, "This account is not active. Please contact support or verify your account.");
    }

    // Successful login clears the account's failure counter.
    clearLoginFailures(email);
    const session = await createAuthSession(user, sessionRequest(req));
    await recordAuditEvent({
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      actorUserId: user.id,
      actorRole: user.role,
      targetType: "account",
      targetId: user.id,
      req,
    });

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

export async function verifyOtp(req, res, next) {
  try {
    const channel = String(req.body.channel || "email").trim().toLowerCase();
    const rawDestination = String(req.body.destination || "").trim();
    const destination = normalizeEmail(rawDestination);
    const purpose = String(req.body.purpose || "account_verification").trim();
    const code = String(req.body.code || "").trim();

    if (channel !== "email") {
      return res.status(410).json({
        success: false,
        code: "PHONE_VERIFICATION_RETIRED",
        message: "Phone verification is no longer used for Queless accounts. Please verify your email instead.",
      });
    }

    if (!destination || !code) {
      return res.status(400).json({ success: false, message: "Email and verification code are required." });
    }

    const row = await getLatestOtp({ channel, destination, purpose });
    await verifyOtpCode(row, code);
    if (purpose === "account_verification") {
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
      message: "Email verified",
      channel: "email",
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
    const email = normalizeEmail(req.body.email);
    const safeMessage = "If an account exists with this email, a reset code has been sent.";

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    const row = await findUserByEmail(email);

    if (!row?.email) {
      return res.status(200).json({
        success: true,
        message: safeMessage,
      });
    }

    const code = await createOtp({
      userId: row.id,
      channel: "email",
      destination: normalizeEmail(row.email),
      purpose: "password_reset",
    });
    await sendEmail({
      to: normalizeEmail(row.email),
      ...passwordResetEmail({ code }),
    });

    return res.status(200).json({ success: true, message: safeMessage });
  } catch (error) {
    next(error);
  }
}

export async function confirmPasswordReset(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || "").trim();
    const nextPassword = String(req.body.newPassword || req.body.password || "");

    if (!email || !code || !nextPassword) {
      return res.status(400).json({ success: false, message: "Email, code, and new password are required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }
    const resetPasswordLengthMessage = validatePasswordLength(nextPassword);
    if (resetPasswordLengthMessage) {
      return res.status(400).json({ success: false, message: resetPasswordLengthMessage });
    }

    const row = await findUserByEmail(email);

    if (!row?.email) {
      return res.status(404).json({ success: false, message: "Reset request not found." });
    }

    const otpRow = await getLatestOtp({
      channel: "email",
      destination: normalizeEmail(row.email),
      purpose: "password_reset",
    });
    await verifyOtpCode(otpRow, code);

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
      message: "Password reset complete.",
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
