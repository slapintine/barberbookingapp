import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import db from "../config/db.js";
import { initDb } from "../db/initDb.js";

dotenv.config();

function usage() {
  console.log("Usage: node src/scripts/upsertUser.js <username> <password> [role]");
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, role FROM users WHERE username = ? LIMIT 1`,
      [username],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function createProfileIfMissing(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO profiles (user_id, full_name, phone, email, address, profile_photo)
       VALUES (?, '', '', '', '', '')`,
      [userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function main() {
  const username = String(process.argv[2] || "").trim();
  const password = String(process.argv[3] || "");
  const role = String(process.argv[4] || "customer").trim().toLowerCase();

  if (!username || !password) {
    usage();
    process.exit(1);
  }

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters and include a letter and a number.`);
  }

  if (!["customer", "barber", "admin"].includes(role)) {
    throw new Error("Role must be customer, barber, or admin.");
  }

  await initDb();

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await getUserByUsername(username);

  if (existing) {
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET password_hash = ?, role = ? WHERE id = ?`,
        [passwordHash, role, existing.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    await createProfileIfMissing(existing.id);
    console.log(`Updated user "${username}" with role "${role}".`);
    return;
  }

  const result = await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
      [username, passwordHash, role],
      function onInsert(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });

  await createProfileIfMissing(result);
  console.log(`Created user "${username}" with role "${role}".`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(() => {
    if (typeof db.close === "function") {
      db.close();
    }
  });
