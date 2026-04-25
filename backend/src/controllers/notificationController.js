import db from "../config/db.js";

export function getMyNotifications(req, res, next) {
  db.all(
    `SELECT *
     FROM notifications
     WHERE user_id = ?
     ORDER BY id DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return next(err);

      res.status(200).json({
        success: true,
        notifications: rows || [],
      });
    }
  );
}

export function markNotificationRead(req, res, next) {
  const { id } = req.params;

  db.run(
    `UPDATE notifications
     SET read = 1
     WHERE id = ? AND user_id = ?`,
    [id, req.user.id],
    function onUpdate(err) {
      if (err) return next(err);

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: "Notification not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Notification marked as read.",
      });
    }
  );
}