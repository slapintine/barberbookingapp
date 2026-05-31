import { all, get, run, transaction } from "../db/query.js";
import { getFirebaseMessaging } from "../config/firebaseAdmin.js";
import { logger } from "../config/logger.js";

const FCM_MULTICAST_LIMIT = 500;
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

function compactString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function dataPayload(data = {}) {
  return Object.fromEntries(
    Object.entries(data || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

function routeForType(type, data = {}) {
  if (data.route) return String(data.route);
  if (type === "booking") return "/bookings";
  if (type === "payment" || type === "wallet") return "/profile";
  if (type === "announcement") return "/";
  return "/";
}

function tokenBatches(tokens = []) {
  const batches = [];
  for (let index = 0; index < tokens.length; index += FCM_MULTICAST_LIMIT) {
    batches.push(tokens.slice(index, index + FCM_MULTICAST_LIMIT));
  }
  return batches;
}

export async function registerNotificationToken({
  userId,
  token,
  platform = "web",
  browser = "",
  deviceLabel = "",
}) {
  const cleanedToken = compactString(token, 4096);
  if (!userId || !cleanedToken) {
    const error = new Error("A valid FCM token is required.");
    error.statusCode = 400;
    throw error;
  }

  await run(
    `INSERT INTO notification_tokens (user_id, token, platform, browser, device_label, last_used_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       platform = excluded.platform,
       browser = excluded.browser,
       device_label = excluded.device_label,
       updated_at = CURRENT_TIMESTAMP,
       last_used_at = CURRENT_TIMESTAMP`,
    [
      userId,
      cleanedToken,
      compactString(platform, 60) || "web",
      compactString(browser, 120),
      compactString(deviceLabel, 120),
    ]
  );
}

export async function unregisterNotificationToken({ userId, token }) {
  await run(
    `DELETE FROM notification_tokens WHERE user_id = ? AND token = ?`,
    [userId, compactString(token, 4096)]
  );
}

export async function deleteNotificationTokens(tokens = []) {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  await Promise.all(
    uniqueTokens.map((token) =>
      run(`DELETE FROM notification_tokens WHERE token = ?`, [token]).catch(() => {})
    )
  );
}

export async function createInAppNotification(userId, {
  title = "Notification",
  type = "system",
  message = "",
  barberId = null,
  customerUserId = null,
  customerUsername = "",
  barberOwnerUsername = "",
} = {}, client = { run }) {
  if (!userId || !message) return null;

  const result = await client.run(
    `INSERT INTO notifications
     (user_id, title, type, message, barber_id, customer_user_id, customer_username, barber_owner_username, read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      userId,
      compactString(title, 160) || "Notification",
      compactString(type, 60) || "system",
      compactString(message, 1000),
      barberId || null,
      customerUserId || null,
      compactString(customerUsername, 160),
      compactString(barberOwnerUsername, 160),
    ]
  );
  return result?.lastID || null;
}

async function sendFirebaseToTokens(tokens, { title, body, data = {} }) {
  const messaging = getFirebaseMessaging();
  if (!messaging || !tokens.length) {
    return { sent: 0, failed: 0, firebaseReady: Boolean(messaging) };
  }

  const invalidTokens = [];
  let sent = 0;
  let failed = 0;

  const payloadData = dataPayload({
    ...data,
    route: routeForType(data.type, data),
  });

  for (const batch of tokenBatches(tokens)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      data: payloadData,
      webpush: {
        headers: {
          Urgency: data.type === "booking" || data.type === "payment" ? "high" : "normal",
        },
      },
    });

    sent += Number(response.successCount || 0);
    failed += Number(response.failureCount || 0);

    response.responses.forEach((item, index) => {
      if (!item.success && INVALID_TOKEN_CODES.has(item.error?.code)) {
        invalidTokens.push(batch[index]);
      } else if (!item.success) {
        logger.warn({ code: item.error?.code, message: item.error?.message }, "FCM token send failed");
      }
    });
  }

  if (invalidTokens.length) {
    await deleteNotificationTokens(invalidTokens);
  }

  await Promise.all(
    tokens.map((token) =>
      run(`UPDATE notification_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?`, [token]).catch(() => {})
    )
  );

  return { sent, failed, invalidTokensRemoved: invalidTokens.length, firebaseReady: true };
}

export async function sendNotificationToUser(userId, title, body, data = {}, options = {}) {
  if (!userId) return { sent: 0, failed: 0, tokenCount: 0 };

  if (options.persist !== false) {
    await createInAppNotification(userId, {
      title,
      type: data.type || "system",
      message: body,
      barberId: data.barberId || data.barber_id || null,
      customerUserId: data.customerUserId || data.customer_user_id || null,
      customerUsername: data.customerUsername || data.customer_username || "",
      barberOwnerUsername: data.barberOwnerUsername || data.barber_owner_username || "",
    }).catch((error) => logger.warn({ err: error, userId }, "Could not create in-app notification"));
  }

  const rows = await all(
    `SELECT token FROM notification_tokens WHERE user_id = ? ORDER BY updated_at DESC`,
    [userId]
  );
  const tokens = [...new Set(rows.map((row) => row.token).filter(Boolean))];

  if (!tokens.length) {
    return { sent: 0, failed: 0, tokenCount: 0 };
  }

  const result = await sendFirebaseToTokens(tokens, {
    title,
    body,
    data: {
      ...data,
      type: data.type || "system",
      title,
      body,
    },
  });

  return { ...result, tokenCount: tokens.length };
}

export async function sendNotificationToUsers(userIds = [], title, body, data = {}, options = {}) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))];
  const results = [];
  for (const userId of ids) {
    results.push(await sendNotificationToUser(userId, title, body, data, options));
  }
  return results;
}

export async function sendNotificationToBusiness(businessId, title, body, data = {}, options = {}) {
  const barber = await get(`SELECT id, owner_user_id FROM barbers WHERE id = ?`, [businessId]);
  if (!barber?.owner_user_id) return { sent: 0, failed: 0, tokenCount: 0 };
  return sendNotificationToUser(barber.owner_user_id, title, body, {
    ...data,
    barberId: businessId,
  }, options);
}

export async function sendBookingNotification({ booking, recipientUserId, title, body, status = "" }, options = {}) {
  if (!booking || !recipientUserId) return { sent: 0, failed: 0, tokenCount: 0 };
  return sendNotificationToUser(recipientUserId, title, body, {
    type: "booking",
    bookingId: booking.id,
    barberId: booking.barber_id || booking.barberId || "",
    customerUserId: booking.customer_user_id || booking.customerUserId || "",
    customerUsername: booking.customer_username || booking.customerUsername || "",
    barberOwnerUsername: booking.barber_owner_username || booking.barberOwnerUsername || "",
    status,
    route: "/bookings",
  }, options);
}

export async function sendPaymentNotification({ userId, title, body, paymentId = "", bookingId = "", status = "", type = "payment" }, options = {}) {
  return sendNotificationToUser(userId, title, body, {
    type,
    paymentId,
    bookingId,
    status,
    route: "/profile",
  }, options);
}

export async function sendAdminAnnouncement({ adminUserId, audience = "all", title, body }) {
  const normalizedAudience = compactString(audience, 40).toLowerCase() || "all";
  const allowedAudiences = new Set(["all", "customers", "providers", "admins"]);
  if (!allowedAudiences.has(normalizedAudience)) {
    const error = new Error("Invalid announcement audience.");
    error.statusCode = 400;
    throw error;
  }

  const where =
    normalizedAudience === "customers"
      ? "WHERE LOWER(role) = 'customer'"
      : normalizedAudience === "providers"
      ? "WHERE LOWER(role) IN ('barber', 'business', 'provider') OR id IN (SELECT owner_user_id FROM barbers)"
      : normalizedAudience === "admins"
      ? "WHERE LOWER(role) IN ('admin', 'superadmin', 'super_admin', 'super-admin')"
      : "";

  const users = await all(`SELECT DISTINCT id FROM users ${where}`);

  const persisted = await transaction(async (client) => {
    for (const user of users) {
      await createInAppNotification(user.id, {
        title,
        type: "announcement",
        message: body,
      }, client);
    }

    if (adminUserId) {
      await client.run(
        `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
        [adminUserId, `Sent ${normalizedAudience} push announcement`]
      ).catch(() => {});
    }

    return {
      audience: normalizedAudience,
      recipients: users.length,
      userIds: users.map((user) => user.id),
    };
  });

  const pushResults = [];
  for (const userId of persisted.userIds) {
    pushResults.push(await sendNotificationToUser(userId, title, body, {
      type: "announcement",
      audience: normalizedAudience,
      route: "/",
    }, { persist: false }));
  }

  return {
    audience: persisted.audience,
    recipients: persisted.recipients,
    pushResults,
  };
}
