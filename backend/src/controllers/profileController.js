import db from "../config/db.js";

function normalizeIdentityEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function getMyProfile(req, res, next) {
  db.get(
    `SELECT
      p.id,
      p.user_id,
      p.full_name,
      p.phone,
      p.email,
      p.address,
      p.profile_photo,
      u.username,
      u.role
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ?`,
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
  const {
    full_name = "",
    phone = "",
    email = "",
    address = "",
    profile_photo = ""
  } = req.body;

  db.get(
    `SELECT id FROM profiles WHERE user_id = ?`,
    [req.user.id],
    (findErr, existing) => {
      if (findErr) return next(findErr);

      if (existing) {
        db.run(
          `UPDATE profiles
           SET full_name = ?, phone = ?, email = ?, normalized_email = ?, normalized_phone = ?, address = ?, profile_photo = ?
           WHERE user_id = ?`,
          [full_name, phone, email, normalizeIdentityEmail(email), normalizeIdentityPhone(phone), address, profile_photo, req.user.id],
          (updateErr) => {
            if (updateErr) return next(updateErr);

            db.get(
              `SELECT
                p.id,
                p.user_id,
                p.full_name,
                p.phone,
                p.email,
                p.address,
                p.profile_photo,
                u.username,
                u.role
               FROM profiles p
               JOIN users u ON u.id = p.user_id
               WHERE p.user_id = ?`,
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
      } else {
        db.run(
          `INSERT INTO profiles (user_id, full_name, phone, email, normalized_email, normalized_phone, address, profile_photo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.user.id, full_name, phone, email, normalizeIdentityEmail(email), normalizeIdentityPhone(phone), address, profile_photo],
          (insertErr) => {
            if (insertErr) return next(insertErr);

            db.get(
              `SELECT
                p.id,
                p.user_id,
                p.full_name,
                p.phone,
                p.email,
                p.address,
                p.profile_photo,
                u.username,
                u.role
               FROM profiles p
               JOIN users u ON u.id = p.user_id
               WHERE p.user_id = ?`,
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
