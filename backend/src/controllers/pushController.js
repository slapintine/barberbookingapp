import webpush from "web-push";
import db from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const VAPID_PUBLIC_KEY = env.vapidPublicKey;
const VAPID_PRIVATE_KEY = env.vapidPrivateKey;
const VAPID_SUBJECT = env.vapidSubject;

let pushReady = false;

try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    pushReady = true;
  }
} catch (error) {
  logger.warn({ err: error }, "Push disabled: invalid VAPID configuration");
  pushReady = false;
}

function ensurePushTable() {
  return new Promise((resolve, reject) => {
    db.run(
      `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        subscription TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
      `,
      [],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export async function getPushPublicKey(req, res) {
  res.json({
    success: true,
    publicKey: pushReady ? VAPID_PUBLIC_KEY : "",
    pushReady,
  });
}

export async function savePushSubscription(req, res, next) {
  try {
    const { username, subscription } = req.body;

    if (!username || !subscription) {
      return res.status(400).json({
        success: false,
        message: "username and subscription are required.",
      });
    }

    await ensurePushTable();

    db.run(
      `
      INSERT INTO push_subscriptions (username, subscription)
      VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET subscription = excluded.subscription
      `,
      [username, JSON.stringify(subscription)],
      (err) => {
        if (err) return next(err);

        res.json({
          success: true,
          message: "Push subscription saved.",
        });
      }
    );
  } catch (error) {
    next(error);
  }
}

export async function removePushSubscription(req, res, next) {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "username is required.",
      });
    }

    await ensurePushTable();

    db.run(
      `DELETE FROM push_subscriptions WHERE username = ?`,
      [username],
      (err) => {
        if (err) return next(err);

        res.json({
          success: true,
          message: "Push subscription removed.",
        });
      }
    );
  } catch (error) {
    next(error);
  }
}

export async function sendPushToUser(username, payload) {
  if (!username || !pushReady) {
    return false;
  }

  await ensurePushTable();

  return new Promise((resolve) => {
    db.get(
      `SELECT subscription FROM push_subscriptions WHERE username = ?`,
      [username],
      async (err, row) => {
        if (err || !row?.subscription) {
          resolve(false);
          return;
        }

        try {
          const subscription = JSON.parse(row.subscription);

          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: payload?.title || "New alert",
              body: payload?.body || "",
              url: payload?.url || "/",
              tag: payload?.tag || "general",
            })
          );

          resolve(true);
        } catch (sendError) {
          if (sendError?.statusCode === 404 || sendError?.statusCode === 410) {
            db.run(
              `DELETE FROM push_subscriptions WHERE username = ?`,
              [username],
              () => {}
            );
          }
          resolve(false);
        }
      }
    );
  });
}
