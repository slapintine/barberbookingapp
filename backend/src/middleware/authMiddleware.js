import { authenticateAccessToken } from "../services/authSessionService.js";

export async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No token provided."
      });
    }

    const token = authHeader.split(" ")[1];
    const { user, sessionId } = await authenticateAccessToken(token);
    const accountStatus = String(user.account_status || "active").trim().toLowerCase();
    if (["inactive", "blocked", "disabled", "suspended"].includes(accountStatus) || user.disabled_at || user.blocked_at) {
      return res.status(403).json({ success: false, message: "This account is not active. Please contact support." });
    }
    req.user = user;
    req.authSessionId = sessionId;
    next();
  } catch (error) {
    const message = error?.name === "TokenExpiredError" || error?.statusCode === 401
      ? "Session expired. Please log in again."
      : "Not authorized. Invalid token.";
    return res.status(401).json({
      success: false,
      message,
    });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const { user, sessionId } = await authenticateAccessToken(token);
    const accountStatus = String(user.account_status || "active").trim().toLowerCase();
    if (["inactive", "blocked", "disabled", "suspended"].includes(accountStatus) || user.disabled_at || user.blocked_at) {
      return next();
    }
    req.user = user;
    req.authSessionId = sessionId;
    return next();
  } catch {
    return next();
  }
}
