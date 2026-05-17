import bcrypt from "bcryptjs";
import db from "../config/db.js";
import { run, get } from "../db/query.js";
import { env } from "../config/env.js";
import { generateToken } from "../utils/generateToken.js";
import { otpEmail, passwordResetEmail, sendEmail } from "../services/emailService.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

function validatePasswordLength(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return "";
}

function findUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, password_hash, role, created_at
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

function createEmptyProfile(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
       VALUES (?, '', '', '', '', '')`,
      [userId],
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

async function sendSmsOtp(destination, code) {
  if (!env.africasTalkingUsername || !env.africasTalkingApiKey) return { skipped: true };

  const body = new URLSearchParams({
    username: env.africasTalkingUsername,
    to: destination,
          message: `Your Lineup Barber Booking verification code is ${code}. It expires in 10 minutes.`,
  });

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey: env.africasTalkingApiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Could not send SMS verification code.");
  }

  return { skipped: false };
}

async function createOtp({ userId = null, channel, destination, purpose = "account_verification" }) {
  const code = makeOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

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
     WHERE channel = ? AND destination = ? AND purpose = ? AND verified_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [channel, destination, purpose]
  );
}

async function verifyOtpCode(row, code) {
  if (!row) throw Object.assign(new Error("Verification code not found."), { statusCode: 404 });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("Verification code expired."), { statusCode: 400 });
  }
  if (Number(row.attempts || 0) >= Number(row.max_attempts || 5)) {
    throw Object.assign(new Error("Too many verification attempts."), { statusCode: 429 });
  }

  const matches = await bcrypt.compare(String(code || "").trim(), row.code_hash);
  if (!matches) {
    await run(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
    throw Object.assign(new Error("Invalid verification code."), { statusCode: 400 });
  }

  await run(`UPDATE otp_codes SET verified_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
  return true;
}

export async function registerUser(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required."
      });
    }

    if (String(username).trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Username must be at least 3 characters."
      });
    }

    const passwordLengthMessage = validatePasswordLength(password);
    if (passwordLengthMessage) {
      return res.status(400).json({
        success: false,
        message: passwordLengthMessage
      });
    }

    const existingUser = await findUserByUsername(String(username).trim());

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(String(username).trim(), passwordHash);
    await createEmptyProfile(user.id);

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
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required."
      });
    }

    const user = await findUserByUsername(String(username).trim());

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Create an account first."
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password."
      });
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
      if (nextUsername.length < 3) {
        return res.status(400).json({
          success: false,
          message: "Username must be at least 3 characters."
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
    const email = String(req.body.email || "").trim();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid email is required." });
    }

    const code = await createOtp({
      userId: req.user?.id || null,
      channel: "email",
      destination: email,
      purpose: req.body.purpose || "account_verification",
    });
    const sendResult = await sendEmailOtp(email, code);

    res.status(200).json({
      success: true,
      message: "Email verification code sent.",
      devCode: sendResult.skipped || env.nodeEnv !== "production" ? code : undefined,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendPhoneOtp(req, res, next) {
  try {
    const phone = String(req.body.phone || "").trim();
    if (!phone || phone.length < 8) {
      return res.status(400).json({ success: false, message: "Valid phone number is required." });
    }

    const code = await createOtp({
      userId: req.user?.id || null,
      channel: "sms",
      destination: phone,
      purpose: req.body.purpose || "account_verification",
    });
    const sendResult = await sendSmsOtp(phone, code);

    res.status(200).json({
      success: true,
      message: "Phone verification code sent.",
      devCode: sendResult.skipped || env.nodeEnv !== "production" ? code : undefined,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const channel = String(req.body.channel || "").trim().toLowerCase();
    const destination = String(req.body.destination || "").trim();
    const purpose = String(req.body.purpose || "account_verification").trim();
    const code = String(req.body.code || "").trim();

    if (!["email", "sms"].includes(channel) || !destination || !code) {
      return res.status(400).json({ success: false, message: "Channel, destination, and code are required." });
    }

    const row = await getLatestOtp({ channel, destination, purpose });
    await verifyOtpCode(row, code);

    res.status(200).json({
      success: true,
      message: "Verification completed.",
      channel,
      destination,
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
    const identifier = String(req.body.email || req.body.username || "").trim();
    if (!identifier) {
      return res.status(400).json({ success: false, message: "Email or username is required." });
    }

    const row = await get(
      `SELECT u.id, u.username, p.email
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.username = ? OR p.email = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!row?.email) {
      return res.status(200).json({
        success: true,
        message: "If that account has an email, a password reset code was sent.",
      });
    }

    const code = await createOtp({
      userId: row.id,
      channel: "email",
      destination: row.email,
      purpose: "password_reset",
    });
    const sendResult = await sendEmail({
      to: row.email,
      ...passwordResetEmail({ code }),
    });

    return res.status(200).json({
      success: true,
      message: "Password reset code sent.",
      devCode: sendResult.skipped || env.nodeEnv !== "production" ? code : undefined,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmPasswordReset(req, res, next) {
  try {
    const identifier = String(req.body.email || req.body.username || "").trim();
    const code = String(req.body.code || "").trim();
    const nextPassword = String(req.body.newPassword || req.body.password || "");

    if (!identifier || !code || !nextPassword) {
      return res.status(400).json({ success: false, message: "Email/username, code, and new password are required." });
    }
    const resetPasswordLengthMessage = validatePasswordLength(nextPassword);
    if (resetPasswordLengthMessage) {
      return res.status(400).json({ success: false, message: resetPasswordLengthMessage });
    }

    const row = await get(
      `SELECT u.id, u.username, u.role, u.created_at, p.email
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.username = ? OR p.email = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!row?.email) {
      return res.status(404).json({ success: false, message: "Account email not found." });
    }

    const otpRow = await getLatestOtp({
      channel: "email",
      destination: row.email,
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
