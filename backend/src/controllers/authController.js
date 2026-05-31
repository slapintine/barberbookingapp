import bcrypt from "bcryptjs";
import db from "../config/db.js";
import { run, get } from "../db/query.js";
import { generateToken } from "../utils/generateToken.js";
import { otpEmail, passwordResetEmail, sendEmail } from "../services/emailService.js";
import { normalizePhoneNumber, sendOtpSms } from "../services/smsService.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;
const EMAIL_OTP_COOLDOWN_SECONDS = 60;
const EMAIL_OTP_MAX_SENDS_PER_HOUR = 5;

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

function findUserByUsernameOrEmail(identifier) {
  const value = String(identifier || "").trim();
  const email = normalizeEmail(value);

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT u.id, u.username, u.password_hash, u.role, u.account_status,
              u.email_verified_at, u.disabled_at, u.blocked_at, u.created_at,
              p.email
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.username = ? OR LOWER(p.email) = ?
       LIMIT 1`,
      [value, email],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function findUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, password_hash, role, account_status, created_at
       FROM users
       WHERE username = ?`,
      [username],
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
  return String(Math.floor(100000 + Math.random() * 900000));
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

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user
    });
  } catch (error) {
    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username && !password) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your username/email and password.");
    }

    if (!username) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your username or email.");
    }

    if (!password) {
      return authError(res, 400, "VALIDATION_ERROR", "Please enter your password.");
    }

    const user = await findUserByUsernameOrEmail(username);

    if (!user) {
      return authError(res, 404, "USER_NOT_FOUND", "We couldn’t find an account with that username or email.");
    }

    const inactiveCode = getInactiveAccountCode(user);
    if (inactiveCode) {
      return authError(res, 403, inactiveCode, "This account is not active. Please contact support or verify your account.");
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return authError(res, 401, "INVALID_PASSWORD", "The password you entered is incorrect.");
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email || "",
        emailVerified: Boolean(user.email_verified_at),
        email_verified: Boolean(user.email_verified_at),
        created_at: user.created_at
      }
    });
  } catch (error) {
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

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users
         SET username = ?, password_hash = ?
         WHERE id = ?`,
        [finalUsername, passwordHash, currentUser.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const user = {
      id: currentUser.id,
      username: finalUsername,
      role: currentUser.role,
      created_at: currentUser.created_at
    };
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

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
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset complete.",
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
}
