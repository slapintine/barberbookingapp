import jwt from "jsonwebtoken";
import db from "../config/db.js";
import { env } from "../config/env.js";

export function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No token provided."
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.jwtSecret);

    db.get(
      `SELECT id, username, role, account_status, disabled_at, blocked_at, created_at
       FROM users
       WHERE id = ?`,
      [decoded.userId],
      (err, user) => {
        if (err) {
          return next(err);
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            message: "Not authorized. User not found."
          });
        }

        const accountStatus = String(user.account_status || "active").trim().toLowerCase();
        if (
          ["inactive", "blocked", "disabled", "suspended"].includes(accountStatus) ||
          user.disabled_at ||
          user.blocked_at
        ) {
          return res.status(403).json({
            success: false,
            message: "This account is not active. Please contact support."
          });
        }

        req.user = user;
        next();
      }
    );
  } catch (error) {
    const message =
      error?.name === "TokenExpiredError"
        ? "Session expired. Please log in again."
        : "Not authorized. Invalid token.";
    return res.status(401).json({
      success: false,
      message,
    });
  }
}
