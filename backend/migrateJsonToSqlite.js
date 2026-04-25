import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import db from "./src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "src", "data");

function readJson(fileName) {
  const fullPath = path.join(dataDir, fileName);
  if (!fs.existsSync(fullPath)) return [];
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function clearTables() {
  await run("DELETE FROM notifications");
  await run("DELETE FROM messages");
  await run("DELETE FROM reviews");
  await run("DELETE FROM bookings");
  await run("DELETE FROM favorites");
  await run("DELETE FROM barber_services");
  await run("DELETE FROM barbers");
  await run("DELETE FROM profiles");
  await run("DELETE FROM users");

  await run("DELETE FROM sqlite_sequence");
}

async function migrate() {
  const users = readJson("users.json");
  const profiles = readJson("profiles.json");
  const barbers = readJson("barbers.json");
  const favorites = readJson("favorites.json");
  const bookings = readJson("bookings.json");
  const reviews = readJson("reviews.json");
  const messages = readJson("messages.json");
  const notifications = readJson("notifications.json");

  const userMap = new Map();
  const barberMap = new Map();
  const bookingMap = new Map();

  console.log("Starting migration...");

  // Optional: start clean
  await clearTables();

  // 1. USERS
  for (const oldUser of users) {
    const existing = await get(
      "SELECT id FROM users WHERE username = ?",
      [oldUser.username]
    );

    let newUserId;

    if (existing) {
      newUserId = existing.id;
    } else {
      const passwordHash = oldUser.password_hash
        ? oldUser.password_hash
        : await bcrypt.hash(oldUser.password || "secret123", 10);

      const result = await run(
        `INSERT INTO users (username, password_hash, role, created_at)
         VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [
          oldUser.username,
          passwordHash,
          oldUser.role || "customer",
          oldUser.created_at || null
        ]
      );

      newUserId = result.lastID;
    }

    userMap.set(oldUser.id, newUserId);
    console.log(`User imported: ${oldUser.username}`);
  }

  // 2. PROFILES
  for (const oldProfile of profiles) {
    const mappedUserId = userMap.get(oldProfile.user_id);
    if (!mappedUserId) continue;

    const existing = await get(
      "SELECT id FROM profiles WHERE user_id = ?",
      [mappedUserId]
    );

    if (!existing) {
      await run(
        `INSERT INTO profiles (user_id, full_name, phone, email, address, profile_photo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mappedUserId,
          oldProfile.full_name || "",
          oldProfile.phone || "",
          oldProfile.email || "",
          oldProfile.address || "",
          oldProfile.profile_photo || ""
        ]
      );
    }

    console.log(`Profile imported for user ${mappedUserId}`);
  }

  // 3. BARBERS
  for (const oldBarber of barbers) {
    const mappedOwnerId = userMap.get(oldBarber.owner_user_id);
    if (!mappedOwnerId) continue;

    const result = await run(
      `INSERT INTO barbers
       (owner_user_id, business_name, location, latitude, longitude, price_from, verified_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        mappedOwnerId,
        oldBarber.business_name || "Unnamed Barber",
        oldBarber.location || "",
        oldBarber.latitude ?? null,
        oldBarber.longitude ?? null,
        oldBarber.price_from ?? 0,
        oldBarber.verified_status || "New",
        oldBarber.created_at || null
      ]
    );

    barberMap.set(oldBarber.id, result.lastID);
    console.log(`Barber imported: ${oldBarber.business_name}`);
  }

  // 4. FAVORITES
  for (const oldFavorite of favorites) {
    const mappedUserId = userMap.get(oldFavorite.user_id);
    const mappedBarberId = barberMap.get(oldFavorite.barber_id);
    if (!mappedUserId || !mappedBarberId) continue;

    try {
      await run(
        `INSERT INTO favorites (user_id, barber_id, created_at)
         VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [mappedUserId, mappedBarberId, oldFavorite.created_at || null]
      );
    } catch {}
  }

  // 5. BOOKINGS
  for (const oldBooking of bookings) {
    const mappedBarberId = barberMap.get(oldBooking.barber_id);
    const mappedCustomerId = userMap.get(oldBooking.customer_user_id);
    if (!mappedBarberId || !mappedCustomerId) continue;

    const result = await run(
      `INSERT INTO bookings
       (barber_id, customer_user_id, service_name, booking_date, booking_time, price, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        mappedBarberId,
        mappedCustomerId,
        oldBooking.service_name || "",
        oldBooking.booking_date || "",
        oldBooking.booking_time || "",
        oldBooking.price ?? 0,
        oldBooking.status || "pending",
        oldBooking.created_at || null
      ]
    );

    bookingMap.set(oldBooking.id, result.lastID);
  }

  // 6. REVIEWS
  for (const oldReview of reviews) {
    const mappedBookingId = bookingMap.get(oldReview.booking_id);
    const mappedBarberId = barberMap.get(oldReview.barber_id);
    const mappedUserId = userMap.get(oldReview.user_id);
    if (!mappedBookingId || !mappedBarberId || !mappedUserId) continue;

    try {
      await run(
        `INSERT INTO reviews
         (booking_id, barber_id, user_id, rating, review_text, created_at)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [
          mappedBookingId,
          mappedBarberId,
          mappedUserId,
          oldReview.rating ?? 5,
          oldReview.review_text || "",
          oldReview.created_at || null
        ]
      );
    } catch {}
  }

  // 7. MESSAGES
  for (const oldMessage of messages) {
    const mappedBarberId = barberMap.get(oldMessage.barber_id);
    const mappedCustomerId = userMap.get(oldMessage.customer_user_id);
    const mappedSenderId = userMap.get(oldMessage.sender_user_id);
    if (!mappedBarberId || !mappedCustomerId || !mappedSenderId) continue;

    await run(
      `INSERT INTO messages
       (barber_id, customer_user_id, sender_user_id, text, created_at)
       VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        mappedBarberId,
        mappedCustomerId,
        mappedSenderId,
        oldMessage.text || "",
        oldMessage.created_at || null
      ]
    );
  }

  // 8. NOTIFICATIONS
  for (const oldNotification of notifications) {
    const mappedUserId = userMap.get(oldNotification.user_id);
    if (!mappedUserId) continue;

    await run(
      `INSERT INTO notifications
       (user_id, message, read, created_at)
       VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        mappedUserId,
        oldNotification.message || "",
        oldNotification.read ?? 0,
        oldNotification.created_at || null
      ]
    );
  }

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});