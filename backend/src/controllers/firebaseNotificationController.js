import {
  registerNotificationToken,
  sendAdminAnnouncement,
  sendNotificationToUser,
  unregisterNotificationToken,
} from "../services/notificationService.js";
import { isFirebaseMessagingReady } from "../config/firebaseAdmin.js";

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

export async function registerToken(req, res, next) {
  try {
    const token = clean(req.body.token, 4096);
    if (!token) {
      return res.status(400).json({ success: false, message: "FCM token is required." });
    }

    await registerNotificationToken({
      userId: req.user.id,
      token,
      platform: clean(req.body.platform, 60) || "web",
      browser: clean(req.body.browser, 120),
      deviceLabel: clean(req.body.deviceLabel || req.body.device_label, 120),
    });

    res.status(200).json({
      success: true,
      message: "Notification token registered.",
      firebaseReady: isFirebaseMessagingReady(),
    });
  } catch (error) {
    next(error);
  }
}

export async function unregisterToken(req, res, next) {
  try {
    const token = clean(req.body.token, 4096);
    if (!token) {
      return res.status(400).json({ success: false, message: "FCM token is required." });
    }

    await unregisterNotificationToken({ userId: req.user.id, token });
    res.status(200).json({ success: true, message: "Notification token removed." });
  } catch (error) {
    next(error);
  }
}

export async function sendTestNotification(req, res, next) {
  try {
    const result = await sendNotificationToUser(
      req.user.id,
      "Queless notifications are ready",
      "You will receive booking, payment, and wallet updates instantly.",
      { type: "system", route: "/profile" }
    );

    res.status(200).json({
      success: true,
      message: result.tokenCount ? "Test notification sent." : "No notification tokens found for this account.",
      firebaseReady: isFirebaseMessagingReady(),
      result,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendAnnouncement(req, res, next) {
  try {
    const title = clean(req.body.title, 160);
    const body = clean(req.body.body || req.body.message, 1000);
    const audience = clean(req.body.audience || "all", 40).toLowerCase();

    if (!title || !body) {
      return res.status(400).json({ success: false, message: "Announcement title and body are required." });
    }

    const result = await sendAdminAnnouncement({
      adminUserId: req.user.id,
      audience,
      title,
      body,
    });

    res.status(200).json({
      success: true,
      message: "Announcement queued.",
      firebaseReady: isFirebaseMessagingReady(),
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
