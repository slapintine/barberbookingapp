import { all, get, run } from "../db/query.js";

const MAX_NOTIFICATION_LIMIT = 50;
const DEFAULT_NOTIFICATION_LIMIT = 25;

function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function serializeNotification(row = {}) {
  const read = Number(row.read || 0) === 1 || row.read === true;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title || "Notification",
    type: row.type || "system",
    message: row.message || "",
    description: row.message || "",
    barberId: row.barber_id || "",
    customerUserId: row.customer_user_id || "",
    customerUsername: row.customer_username || "",
    barberOwnerUsername: row.barber_owner_username || "",
    read,
    createdAt: row.created_at,
    // Compatibility for older app code while clients migrate to camelCase.
    user_id: row.user_id,
    barber_id: row.barber_id || "",
    customer_user_id: row.customer_user_id || "",
    customer_username: row.customer_username || "",
    barber_owner_username: row.barber_owner_username || "",
    created_at: row.created_at,
  };
}

export async function getMyNotifications(req, res, next) {
  try {
    const limit = parsePositiveInteger(req.query.limit, DEFAULT_NOTIFICATION_LIMIT, MAX_NOTIFICATION_LIMIT);
    const page = parsePositiveInteger(req.query.page, 1);
    const offset = (page - 1) * limit;

    const [rows, unreadRow] = await Promise.all([
      all(
        `SELECT id, user_id, title, type, message, barber_id, customer_user_id,
                customer_username, barber_owner_username, read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [req.user.id, limit, offset]
      ),
      get(
        `SELECT COUNT(*) AS unread_count
         FROM notifications
         WHERE user_id = ? AND read = 0`,
        [req.user.id]
      ),
    ]);

    return res.status(200).json({
      success: true,
      page,
      limit,
      unreadCount: Number(unreadRow?.unread_count || unreadRow?.unreadCount || 0),
      notifications: rows.map(serializeNotification),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getUnreadNotificationCount(req, res, next) {
  try {
    const row = await get(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE user_id = ? AND read = 0`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      unreadCount: Number(row?.unread_count || row?.unreadCount || 0),
    });
  } catch (error) {
    return next(error);
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    if (!id) {
      return res.status(400).json({
        success: false,
        code: "INVALID_NOTIFICATION_ID",
        message: "We could not open this notification.",
      });
    }

    const result = await run(
      `UPDATE notifications
       SET read = 1
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (Number(result?.changes || 0) === 0) {
      return res.status(404).json({
        success: false,
        code: "NOTIFICATION_NOT_FOUND",
        message: "This notification is no longer available.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (error) {
    return next(error);
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    const result = await run(
      `UPDATE notifications
       SET read = 1
       WHERE user_id = ? AND read = 0`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      updated: Number(result?.changes || 0),
    });
  } catch (error) {
    return next(error);
  }
}
