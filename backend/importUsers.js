import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import db from "./src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersPath = path.join(__dirname, "src", "data", "users.json");
const users = JSON.parse(fs.readFileSync(usersPath, "utf-8"));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function importUsers() {
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);

    try {
      const result = await run(
        `INSERT INTO users (username, password_hash, role)
         VALUES (?, ?, ?)`,
        [user.username, hash, user.role || "customer"]
      );

      await run(
        `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
         VALUES (?, '', '', '', '', '')`,
        [result.lastID]
      );

      console.log(`Imported: ${user.username}`);
    } catch (err) {
      console.log(`Skipped ${user.username}: ${err.message}`);
    }
  }

  console.log("User import complete.");
  process.exit(0);
}

importUsers().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});