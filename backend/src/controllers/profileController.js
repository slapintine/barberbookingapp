import db from "../config/db.js";

function normalizeIdentityEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLength);
}

function validateEmail(value) {
  const email = normalizeIdentityEmail(value);
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw httpError(400, "Please enter a valid email address.");
  }
  return email;
}

function validatePhone(value) {
  const raw = String(value || "").trim();
  const digits = normalizeIdentityPhone(raw);
  if (!digits) return "";
  if (digits.length < 9 || digits.length > 15) {
    throw httpError(400, "Please enter a valid phone number.");
  }
  return raw.slice(0, 32);
}

function validateProfilePhoto(value) {
  const photo = String(value || "").trim();
  if (!photo) return "";
  if (/^https?:\/\//i.test(photo)) return photo.slice(0, 1000);
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(photo)) {
    throw httpError(400, "Profile photo must be a PNG, JPG, or WebP image.");
  }
  const base64 = photo.split(",", 2)[1] || "";
  const approxBytes = Math.ceil((base64.length * 3) / 4);
  if (approxBytes > 2 * 1024 * 1024) {
    throw httpError(413, "Profile photo must be 2 MB or smaller.");
  }
  return photo;
}

function normalizeProfileInput(body = {}) {
  const email = validateEmail(body.email);
  const phone = validatePhone(body.phone);
  return {
    full_name: cleanText(body.full_name ?? body.fullName, 120),
    phone,
    email,
    address: cleanText(body.address, 240),
    profile_photo: validateProfilePhoto(body.profile_photo ?? body.profilePhoto),
    normalized_email: email,
    normalized_phone: normalizeIdentityPhone(phone),
  };
}

const profileSelect = `
  SELECT
    p.id,
    p.user_id,
    p.full_name,
    p.full_name AS fullName,
    p.phone,
    p.email,
    p.address,
    p.profile_photo,
    p.profile_photo AS profilePhoto,
    u.username,
    u.role,
    u.email_verified_at,
    CASE WHEN u.email_verified_at IS NULL THEN 0 ELSE 1 END AS email_verified,
    CASE WHEN u.email_verified_at IS NULL THEN 0 ELSE 1 END AS emailVerified
   FROM profiles p
   JOIN users u ON u.id = p.user_id
   WHERE p.user_id = ?`;

export function getMyProfile(req, res, next) {
  db.get(
    profileSelect,
    [req.user.id],
    (err, row) => {
      if (err) return next(err);

      res.status(200).json({
        success: true,
        profile: row || null
      });
    }
  );
}

export function upsertMyProfile(req, res, next) {
  let profileInput;
  try {
    profileInput = normalizeProfileInput(req.body);
  } catch (error) {
    return next(error);
  }

  const { full_name, phone, email, address, profile_photo, normalized_email, normalized_phone } = profileInput;
  if (email) {
    db.get(
      `SELECT user_id FROM profiles WHERE LOWER(email) = ? AND user_id <> ? LIMIT 1`,
      [email, req.user.id],
      (emailErr, duplicateProfile) => {
        if (emailErr) return next(emailErr);
        if (duplicateProfile) return next(httpError(409, "An account with this email already exists."));
        return writeProfile();
      }
    );
    return;
  }

  return writeProfile();

  function writeProfile() {
    db.get(
    `SELECT id, email FROM profiles WHERE user_id = ?`,
    [req.user.id],
    (findErr, existing) => {
      if (findErr) return next(findErr);

      if (existing) {
        const emailChanged = normalizeIdentityEmail(existing.email) !== normalizeIdentityEmail(email);
        db.serialize(() => {
        if (emailChanged) {
          db.run(
            `UPDATE users
             SET email_verified_at = NULL,
                 email_verification_code_hash = '',
                 email_verification_expires_at = NULL,
                 last_email_code_sent_at = NULL
             WHERE id = ?`,
            [req.user.id]
          );
        }
        db.run(
          `UPDATE profiles
           SET full_name = ?, phone = ?, email = ?, normalized_email = ?, normalized_phone = ?, address = ?, profile_photo = ?
           WHERE user_id = ?`,
          [full_name, phone, email, normalized_email, normalized_phone, address, profile_photo, req.user.id],
          (updateErr) => {
            if (updateErr) return next(updateErr);

            db.get(
              profileSelect,
              [req.user.id],
              (selectErr, row) => {
                if (selectErr) return next(selectErr);

                res.status(200).json({
                  success: true,
                  message: "Profile updated successfully.",
                  profile: row
                });
              }
            );
          }
        );
        });
      } else {
        db.run(
          `INSERT INTO profiles (user_id, full_name, phone, email, normalized_email, normalized_phone, address, profile_photo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.user.id, full_name, phone, email, normalized_email, normalized_phone, address, profile_photo],
          (insertErr) => {
            if (insertErr) return next(insertErr);

            db.get(
              profileSelect,
              [req.user.id],
              (selectErr, row) => {
                if (selectErr) return next(selectErr);

                res.status(201).json({
                  success: true,
                  message: "Profile created successfully.",
                  profile: row
                });
              }
            );
          }
        );
      }
    }
    );
  }
}
