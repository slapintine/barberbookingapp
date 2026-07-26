import { logger } from "../config/logger.js";

export function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(err, req, res, next) {
  const isSqliteConstraint = String(err?.code || "").startsWith("SQLITE_CONSTRAINT");
  const statusCode = err.statusCode || (isSqliteConstraint ? 400 : 500);
  const safeMessage = isSqliteConstraint
    ? "We couldn't activate this plan. Please try again."
    : err.message;
  const publicMessage =
    envSafeProduction() && statusCode >= 500
      ? err.publicMessage || "Something went wrong on our side. Please try again shortly."
      : safeMessage || "Internal server error";

  const requestLogger = req?.log || logger;
  requestLogger.error(
    {
      err,
      statusCode,
    },
    "request failed"
  );

  const body = {
    success: false,
    message: publicMessage,
    requestId: req?.id,
  };

  if (statusCode < 500 && err?.code && !isSqliteConstraint) {
    body.code = String(err.code).slice(0, 80);
  }

  res.status(statusCode).json(body);
}

function envSafeProduction() {
  return process.env.NODE_ENV === "production";
}
